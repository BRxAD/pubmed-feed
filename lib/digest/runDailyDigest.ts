import { getDefaultTopicId } from "@/lib/feed";
import { publicAppBaseUrl } from "@/lib/internalFetch";
import { GET as runPubmedIngest } from "@/app/api/ingest/route";
import { NextRequest } from "next/server";
import { DEFAULT_DIGEST_MAX_SUMMARIES } from "@/lib/digest/config";
import { runOpenAlexIngest } from "@/lib/openalex/ingest";
import { saveLastIngestRunStats } from "@/lib/ingestStats";
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

  let ingestOpenAlex: Record<string, unknown> = {
    ok: false,
    skipped: true,
    reason: "not run",
  };
  try {
    ingestOpenAlex = await runOpenAlexIngest({
      topicName: "main",
      summarize: true,
      maxSummaries,
      persistStats: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[daily-digest] OpenAlex ingest failed:", message);
    ingestOpenAlex = { ok: false, error: message };
  }

  const used = asCount(ingestOpenAlex.storedSummaries);
  const remaining = Math.max(0, maxSummaries - used);

  const ingestPubmed = await triggerIngest(
    `/api/ingest?topicName=main&summarize=1&maxArticles=${maxSummaries}&maxSummaries=${remaining}&persistStats=0`
  );

  const supabase = getSupabaseServerClient();
  await saveLastIngestRunStats(supabase, {
    topicId,
    ranAt: new Date().toISOString(),
    newArticles:
      asCount(ingestOpenAlex.newArticles) + asCount(ingestPubmed.newArticles),
    newSummaries:
      asCount(ingestOpenAlex.storedSummaries) +
      asCount(ingestPubmed.storedSummaries),
    mlPriorityGe5:
      asCount(ingestOpenAlex.mlPriorityGe5Count) +
      asCount(ingestPubmed.mlPriorityGe5Count),
  });

  return {
    ok: true,
    topicId,
    topicName: "Antimicrobial Stewardship",
    ingestPubmed,
    ingestOpenAlex,
    emailsRetired: true,
    briefEmailCron: "/api/cron/brief-digest",
    appUrl: publicAppBaseUrl(),
  };
}
