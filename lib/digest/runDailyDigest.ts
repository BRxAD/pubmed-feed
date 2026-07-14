import { getDefaultTopicId } from "@/lib/feed";
import type { FeedSource } from "@/lib/feedSource";
import { digestSinceIso, getDigestItems } from "@/lib/digest/items";
import {
  DEFAULT_DIGEST_HOURS_BACK,
  DEFAULT_DIGEST_MAX_SUMMARIES,
  DEFAULT_DIGEST_MIN_RELEVANCE,
  getDigestRecipients,
} from "@/lib/digest/config";
import { buildDigestEmail } from "@/lib/digest/emailFormat";
import { runBriefDigest, type BriefDigestResult } from "@/lib/digest/runBriefDigest";
import { sendDigestEmail } from "@/lib/digest/sendEmail";
import { publicAppBaseUrl } from "@/lib/internalFetch";
import { GET as runPubmedIngest } from "@/app/api/ingest/route";
import { GET as runOpenAlexIngest } from "@/app/api/ingest/openalex/route";
import { NextRequest } from "next/server";

function appBaseUrl(): string {
  return publicAppBaseUrl();
}

/** Run ingest in-process — avoids Vercel Deployment Protection on self-fetch URLs. */
async function triggerIngest(path: string): Promise<Record<string, unknown>> {
  const url = new URL(path, "http://digest-internal");
  const request = new NextRequest(url);
  const handler = path.includes("/openalex") ? runOpenAlexIngest : runPubmedIngest;
  const response = await handler(request);
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      `${path} → ${String(data.error ?? response.statusText)} (HTTP ${response.status})`
    );
  }
  return data;
}

export type SourceDigestEmailResult = {
  source: FeedSource;
  sent: boolean;
  recipients: string[];
  messageId?: string;
  skippedReason?: string;
  itemCount: number;
};

export type DailyDigestResult = {
  ok: boolean;
  topicId: string;
  topicName?: string;
  ingestPubmed?: Record<string, unknown>;
  ingestOpenAlex?: Record<string, unknown>;
  digest: {
    minRelevancePercent: number;
    maxSummariesPerSource: number;
    since: string;
    pubmed: { itemCount: number; items: { title: string; relevancePercent: number; url: string }[] };
    openalex: { itemCount: number; items: { title: string; relevancePercent: number; url: string }[] };
  };
  emails: SourceDigestEmailResult[];
  briefEmail: BriefDigestResult;
  error?: string;
};

async function sendSourceDigest(options: {
  source: FeedSource;
  topicId: string;
  since: string;
  minRelevancePercent: number;
  hoursBack: number;
  recipients: string[];
}): Promise<SourceDigestEmailResult> {
  const { source, topicId, since, minRelevancePercent, hoursBack, recipients } =
    options;

  const { items } = await getDigestItems({
    topicId,
    sinceIso: since,
    minRelevancePercent,
    maxItems: DEFAULT_DIGEST_MAX_SUMMARIES,
    source,
  });

  const baseFeed = `${appBaseUrl()}/feed?topicId=${topicId}`;
  const feedUrl =
    source === "openalex" ? `${baseFeed}&source=openalex` : baseFeed;

  const periodLabel = `the last ${hoursBack} hours`;
  const { subject, html, text } = buildDigestEmail({
    items,
    topicName: "Antimicrobial Stewardship",
    feedUrl,
    minRelevancePercent,
    periodLabel,
    source,
  });

  if (recipients.length === 0) {
    return {
      source,
      sent: false,
      recipients: [],
      skippedReason: "No recipient email configured",
      itemCount: items.length,
    };
  }

  if (items.length === 0 && process.env.DIGEST_SEND_IF_EMPTY !== "1") {
    return {
      source,
      sent: false,
      recipients,
      skippedReason: "No items met relevance threshold",
      itemCount: 0,
    };
  }

  const sent = await sendDigestEmail({ to: recipients, subject, html, text });
  return {
    source,
    sent: true,
    recipients,
    messageId: sent.id,
    itemCount: items.length,
  };
}

/** When false or unset, OpenAlex ingest and digest email are skipped. */
function isOpenAlexIngestEnabled(): boolean {
  const raw = process.env.OPENALEX_INGEST_ENABLED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export async function runDailyDigest(): Promise<DailyDigestResult> {
  const topicId = await getDefaultTopicId();
  if (!topicId) {
    throw new Error("Default topic not found");
  }

  const minRelevancePercent = Math.min(
    100,
    Math.max(
      0,
      parseInt(
        process.env.DIGEST_MIN_RELEVANCE ?? String(DEFAULT_DIGEST_MIN_RELEVANCE),
        10
      ) || DEFAULT_DIGEST_MIN_RELEVANCE
    )
  );
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
  const hoursBack = Math.min(
    168,
    Math.max(
      1,
      parseInt(
        process.env.DIGEST_HOURS_BACK ?? String(DEFAULT_DIGEST_HOURS_BACK),
        10
      ) || DEFAULT_DIGEST_HOURS_BACK
    )
  );
  const since = digestSinceIso(hoursBack);
  const recipients = getDigestRecipients();

  let ingestPubmed: Record<string, unknown>;
  try {
    ingestPubmed = await triggerIngest(
      `/api/ingest?topicName=main&summarize=1&maxSummaries=${maxSummaries}`
    );
  } catch (err) {
    ingestPubmed = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  let ingestOpenAlex: Record<string, unknown> | undefined;
  if (isOpenAlexIngestEnabled()) {
    try {
      ingestOpenAlex = await triggerIngest(
        `/api/ingest/openalex?topicName=main&summarize=1&maxSummaries=${maxSummaries}`
      );
    } catch (err) {
      ingestOpenAlex = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  } else {
    ingestOpenAlex = { ok: true, skipped: true, reason: "OPENALEX_INGEST_ENABLED is off" };
  }

  const pubmedItems = await getDigestItems({
    topicId,
    sinceIso: since,
    minRelevancePercent,
    maxItems: maxSummaries,
    source: "pubmed",
  });

  const openalexItems = isOpenAlexIngestEnabled()
    ? await getDigestItems({
        topicId,
        sinceIso: since,
        minRelevancePercent,
        maxItems: maxSummaries,
        source: "openalex",
      })
    : { items: [] as Awaited<ReturnType<typeof getDigestItems>>["items"] };

  // Legacy ASP-format emails stay off unless DIGEST_SEND_LEGACY=1.
  // The morning subscriber email is The Stewardship Brief (runBriefDigest below).
  const sendLegacy = process.env.DIGEST_SEND_LEGACY === "1";

  const emailPubmed = sendLegacy
    ? await sendSourceDigest({
        source: "pubmed",
        topicId,
        since,
        minRelevancePercent,
        hoursBack,
        recipients,
      })
    : {
        source: "pubmed" as const,
        sent: false,
        recipients,
        skippedReason: "Replaced by Stewardship Brief email",
        itemCount: pubmedItems.items.length,
      };

  const emailOpenAlex =
    sendLegacy && isOpenAlexIngestEnabled()
      ? await sendSourceDigest({
          source: "openalex",
          topicId,
          since,
          minRelevancePercent,
          hoursBack,
          recipients,
        })
      : {
          source: "openalex" as const,
          sent: false,
          recipients,
          skippedReason: isOpenAlexIngestEnabled()
            ? "Replaced by Stewardship Brief email"
            : "OpenAlex ingest paused",
          itemCount: openalexItems.items.length,
        };

  let briefEmail: BriefDigestResult;
  try {
    briefEmail = await runBriefDigest();
  } catch (err) {
    briefEmail = {
      sent: false,
      recipients: [],
      itemCount: 0,
      skippedReason:
        err instanceof Error ? err.message : "Brief digest failed",
    };
  }

  return {
    ok: true,
    topicId,
    topicName: "Antimicrobial Stewardship",
    ingestPubmed,
    ingestOpenAlex,
    digest: {
      minRelevancePercent,
      maxSummariesPerSource: maxSummaries,
      since,
      pubmed: {
        itemCount: pubmedItems.items.length,
        items: pubmedItems.items.map((i) => ({
          title: i.title,
          relevancePercent: i.relevancePercent,
          url: i.url,
        })),
      },
      openalex: {
        itemCount: openalexItems.items.length,
        items: openalexItems.items.map((i) => ({
          title: i.title,
          relevancePercent: i.relevancePercent,
          url: i.url,
        })),
      },
    },
    emails: [emailPubmed, emailOpenAlex],
    briefEmail,
  };
}
