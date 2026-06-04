import { getDefaultTopicId } from "@/lib/feed";
import {
  digestSinceIso,
  getDigestItems,
  parseRecipientEmails,
} from "@/lib/digest/items";
import { buildDigestEmail } from "@/lib/digest/emailFormat";
import { sendDigestEmail } from "@/lib/digest/sendEmail";

function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

async function triggerIngest(path: string): Promise<Record<string, unknown>> {
  const base = appBaseUrl();
  const res = await fetch(`${base}${path}`, { method: "POST" });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(data.error ?? res.statusText));
  }
  return data;
}

export type DailyDigestResult = {
  ok: boolean;
  topicId: string;
  topicName?: string;
  ingestPubmed?: Record<string, unknown>;
  ingestOpenAlex?: Record<string, unknown>;
  digest: {
    minRelevancePercent: number;
    since: string;
    itemCount: number;
    items: { title: string; relevancePercent: number; url: string }[];
  };
  email?: {
    sent: boolean;
    recipients: string[];
    messageId?: string;
    skippedReason?: string;
  };
  error?: string;
};

export async function runDailyDigest(): Promise<DailyDigestResult> {
  const topicId = await getDefaultTopicId();
  if (!topicId) {
    throw new Error("Default topic not found");
  }

  const minRelevancePercent = Math.min(
    100,
    Math.max(
      0,
      parseInt(process.env.DIGEST_MIN_RELEVANCE ?? "20", 10) || 20
    )
  );
  const maxSummaries = Math.min(
    50,
    Math.max(1, parseInt(process.env.DIGEST_MAX_SUMMARIES ?? "20", 10) || 20)
  );
  const hoursBack = Math.min(
    168,
    Math.max(1, parseInt(process.env.DIGEST_HOURS_BACK ?? "24", 10) || 24)
  );
  const since = digestSinceIso(hoursBack);

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

  const { items } = await getDigestItems({
    topicId,
    sinceIso: since,
    minRelevancePercent,
  });

  const feedUrl = `${appBaseUrl()}/feed?topicId=${topicId}`;
  const periodLabel = `the last ${hoursBack} hours`;
  const { subject, html, text } = buildDigestEmail({
    items,
    topicName: "Antimicrobial Stewardship",
    feedUrl,
    minRelevancePercent,
    periodLabel,
  });

  const recipients = parseRecipientEmails(process.env.DIGEST_RECIPIENT_EMAILS);

  let emailResult: DailyDigestResult["email"];

  if (recipients.length === 0) {
    emailResult = {
      sent: false,
      recipients: [],
      skippedReason: "DIGEST_RECIPIENT_EMAILS not set",
    };
  } else if (items.length === 0 && process.env.DIGEST_SEND_IF_EMPTY !== "1") {
    emailResult = {
      sent: false,
      recipients,
      skippedReason: "No items met relevance threshold",
    };
  } else {
    const sent = await sendDigestEmail({ to: recipients, subject, html, text });
    emailResult = {
      sent: true,
      recipients,
      messageId: sent.id,
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
      since,
      itemCount: items.length,
      items: items.map((i) => ({
        title: i.title,
        relevancePercent: i.relevancePercent,
        url: i.url,
      })),
    },
    email: emailResult,
  };
}
