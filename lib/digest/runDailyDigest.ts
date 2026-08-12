import { getDefaultTopicId } from "@/lib/feed";
import { publicAppBaseUrl } from "@/lib/internalFetch";
import { GET as runPubmedIngest } from "@/app/api/ingest/route";
import { NextRequest } from "next/server";
import { DEFAULT_DIGEST_MAX_SUMMARIES } from "@/lib/digest/config";

/** Run ingest in-process — avoids Vercel Deployment Protection on self-fetch URLs. */
async function triggerIngest(path: string): Promise<Record<string, unknown>> {
  const url = new URL(path, "http://digest-internal");
  const request = new NextRequest(url);
  const response = await runPubmedIngest(request);
  const data = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    throw new Error(
      `${path} → ${String(data.error ?? response.statusText)} (HTTP ${response.status})`
    );
  }
  return data;
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
 * PubMed ingest + summarize only (2× daily).
 * Stewardship Brief email is sent separately by `/api/cron/brief-digest`.
 * Legacy ASP Literature Feed emails are retired.
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

  let ingestPubmed: Record<string, unknown>;
  try {
    ingestPubmed = await triggerIngest(
      `/api/ingest?topicName=main&summarize=1&maxArticles=${maxSummaries}&maxSummaries=${maxSummaries}`
    );
  } catch (err) {
    ingestPubmed = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  return {
    ok: true,
    topicId,
    topicName: "Antimicrobial Stewardship",
    ingestPubmed,
    ingestOpenAlex: {
      ok: true,
      skipped: true,
      reason: "OpenAlex ingest disabled",
    },
    emailsRetired: true,
    briefEmailCron: "/api/cron/brief-digest",
    appUrl: publicAppBaseUrl(),
  };
}
