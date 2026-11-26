import { getDefaultTopicId } from "@/lib/feed";
import { publicAppBaseUrl } from "@/lib/internalFetch";
import { GET as runPubmedIngest } from "@/app/api/ingest/route";
import { NextRequest } from "next/server";
import { DEFAULT_DIGEST_MAX_SUMMARIES } from "@/lib/digest/config";
import { runOpenAlexIngest } from "@/lib/openalex/ingest";
import { saveLastIngestRunStats } from "@/lib/ingestStats";
import {
  summarizeRecentUnsummarized,
  summaryRunFailedCompletely,
} from "@/lib/ingest/summarizeCatchUp";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

/** Run ingest in-process — avoids Vercel Deployment Protection on self-fetch URLs. */
async function triggerIngest(path: string): Promise<Record<string, unknown>> {
  const url = new URL(path, "http://digest-internal");
  const request = new NextRequest(url);
  const response = await runPubmedIngest(request);
  const data = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok || data.ok === false) {
    throw new Error(
      `${path} → ${String(data.error ?? response.statusText)} (HTTP ${response.status})`
    );
  }
  return data;
}

function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export type DailyDigestResult = {
  ok: boolean;
  topicId: string;
  topicName?: string;
  ingestPubmed?: Record<string, unknown>;
  ingestOpenAlex?: Record<string, unknown>;
  summarizeCatchUp?: {
    storedSummaries: number;
    summarizeAttempted: number;
    summarizeFailed: number;
  };
  /** Legacy ASP emails retired — Brief email is /api/cron/brief-digest. */
  emailsRetired: true;
  briefEmailCron: "/api/cron/brief-digest";
  appUrl: string;
  error?: string;
};

/**
 * OpenAlex (CID/OFID/ASHE/ICHE/CMI) then PubMed, shared summarize cap.
 * Stewardship Brief email is sent separately by `/api/cron/brief-digest`.
 *
 * Throws if PubMed ingest fails so cron callers get a non-2xx.
 * OpenAlex failure is recorded but does not block PubMed.
 */
export async function runDailyDigest(): Promise<DailyDigestResult> {
  const topicId = await getDefaultTopicId();
  if (!topicId) {
    throw new Error("Default topic not found");
  }

  const maxSummaries = Math.min(
    100,
    Math.max(
      1,
      parseInt(
        process.env.DIGEST_MAX_SUMMARIES ?? String(DEFAULT_DIGEST_MAX_SUMMARIES),
        10
      ) || DEFAULT_DIGEST_MAX_SUMMARIES
    )
  );

  const supabase = getSupabaseServerClient();
  const { data: topicRow, error: topicErr } = await supabase
    .from("topics")
    .select("query_string, ranking_weights")
    .eq("id", topicId)
    .maybeSingle();
  if (topicErr) {
    throw new Error(`Topic load failed: ${topicErr.message}`);
  }

  const catchUp = await summarizeRecentUnsummarized({
    supabase,
    topicId,
    queryString: String(
      (topicRow as { query_string?: string } | null)?.query_string ?? ""
    ),
    rankingWeights:
      ((topicRow as { ranking_weights?: Record<string, unknown> | null } | null)
        ?.ranking_weights ?? null),
    maxSummaries,
  });
  const remainingAfterCatchUp = Math.max(
    0,
    maxSummaries - catchUp.storedSummaries
  );
  const billingDown = catchUp.summarizeErrors.some((err) =>
    /no credits remaining|insufficient_quota/i.test(err)
  );
  const summarizeBudget = billingDown ? 0 : remainingAfterCatchUp;

  let ingestOpenAlex: Record<string, unknown> = {
    ok: false,
    skipped: true,
    reason: "not run",
  };
  try {
    ingestOpenAlex = await runOpenAlexIngest({
      topicName: "main",
      summarize: true,
      maxSummaries: summarizeBudget,
      persistStats: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[daily-digest] OpenAlex ingest failed:", message);
    ingestOpenAlex = { ok: false, error: message };
  }

  const used = asCount(ingestOpenAlex.storedSummaries);
  const remaining = Math.max(0, summarizeBudget - used);

  const ingestPubmed = await triggerIngest(
    `/api/ingest?topicName=main&summarize=1&maxArticles=${maxSummaries}&maxSummaries=${remaining}&persistStats=0`
  );

  const storedSummaries =
    catchUp.storedSummaries +
    asCount(ingestOpenAlex.storedSummaries) +
    asCount(ingestPubmed.storedSummaries);
  const attemptedSummaries =
    catchUp.summarizeAttempted +
    asCount(ingestOpenAlex.summarizeAttempted) +
    asCount(ingestPubmed.summarizeAttempted);
  const summaryErrors = [
    ...catchUp.summarizeErrors,
    ...(Array.isArray(ingestOpenAlex.summarizeErrors)
      ? ingestOpenAlex.summarizeErrors.map(String)
      : []),
    ...(Array.isArray(ingestPubmed.summarizeErrors)
      ? ingestPubmed.summarizeErrors.map(String)
      : []),
  ];

  await saveLastIngestRunStats(supabase, {
    topicId,
    ranAt: new Date().toISOString(),
    newArticles:
      asCount(ingestOpenAlex.newArticles) + asCount(ingestPubmed.newArticles),
    newSummaries: storedSummaries,
    mlPriorityGe5:
      catchUp.mlPriorityGe5Count +
      asCount(ingestOpenAlex.mlPriorityGe5Count) +
      asCount(ingestPubmed.mlPriorityGe5Count),
  });

  if (summaryRunFailedCompletely(attemptedSummaries, storedSummaries)) {
    throw new Error(
      `No summaries were saved (${attemptedSummaries} failed). ${summaryErrors.slice(0, 3).join(" ")}`
    );
  }

  return {
    ok: true,
    topicId,
    topicName: "Antimicrobial Stewardship",
    ingestPubmed,
    ingestOpenAlex,
    summarizeCatchUp: catchUp,
    emailsRetired: true,
    briefEmailCron: "/api/cron/brief-digest",
    appUrl: publicAppBaseUrl(),
  };
}
