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
import { sendDigestEmail } from "@/lib/digest/sendEmail";
import { internalAppBaseUrl, internalFetchHeaders } from "@/lib/internalFetch";

function appBaseUrl(): string {
  return internalAppBaseUrl();
}

async function triggerIngest(path: string): Promise<Record<string, unknown>> {
  const base = internalAppBaseUrl();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: "GET",
    headers: internalFetchHeaders(),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      `${url} → ${String(data.error ?? res.statusText)} (HTTP ${res.status})`
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

  const ingestPubmed = await triggerIngest(
    `/api/ingest?topicName=main&summarize=1&maxSummaries=${maxSummaries}`
  );

  let ingestOpenAlex: Record<string, unknown> | undefined;
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

  const pubmedItems = await getDigestItems({
    topicId,
    sinceIso: since,
    minRelevancePercent,
    maxItems: maxSummaries,
    source: "pubmed",
  });

  const openalexItems = await getDigestItems({
    topicId,
    sinceIso: since,
    minRelevancePercent,
    maxItems: maxSummaries,
    source: "openalex",
  });

  const emailPubmed = await sendSourceDigest({
    source: "pubmed",
    topicId,
    since,
    minRelevancePercent,
    hoursBack,
    recipients,
  });

  const emailOpenAlex = await sendSourceDigest({
    source: "openalex",
    topicId,
    since,
    minRelevancePercent,
    hoursBack,
    recipients,
  });

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
  };
}
