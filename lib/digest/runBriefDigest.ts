import "server-only";
import { getBriefItems } from "@/lib/brief/items";
import { buildBriefDigestEmail } from "@/lib/digest/briefEmailFormat";
import {
  getPreviouslyEmailedPmids,
  recordBriefEmailSends,
} from "@/lib/digest/briefEmailSends";
import { getBriefSubscribers } from "@/lib/digest/briefSubscribers";
import {
  getBriefDigestFromAddress,
  getDigestRecipients,
} from "@/lib/digest/config";
import { sendDigestEmailToEach } from "@/lib/digest/sendEmail";
import { publicAppBaseUrl } from "@/lib/internalFetch";

export type BriefDigestResult = {
  sent: boolean;
  recipients: string[];
  itemCount: number;
  messageId?: string;
  skippedReason?: string;
  sentCount?: number;
  failedRecipients?: string[];
  skippedDuplicates?: number;
};

function isBriefDigestEnabled(): boolean {
  const raw = process.env.BRIEF_DIGEST_ENABLED?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no") return false;
  return true;
}

/** Subscribers + configured digest recipients (deduped). */
export async function getBriefDigestRecipients(): Promise<string[]> {
  const [subscribers, admins] = await Promise.all([
    getBriefSubscribers(),
    Promise.resolve(getDigestRecipients()),
  ]);
  return [...new Set([...subscribers, ...admins])];
}

export async function runBriefDigest(): Promise<BriefDigestResult> {
  if (!isBriefDigestEnabled()) {
    return {
      sent: false,
      recipients: [],
      itemCount: 0,
      skippedReason: "BRIEF_DIGEST_ENABLED is off",
    };
  }

  const base = publicAppBaseUrl();
  const briefUrl = base;
  const logoUrl = `${base}/stewardship-brief-logo.png`;

  const dateLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const { items: rawItems } = await getBriefItems({
    maxItems: 40,
    skipHeadlines: false,
    daysBack: 14,
  });
  const previouslySent = await getPreviouslyEmailedPmids();
  const skippedDuplicates = rawItems.filter((i) =>
    previouslySent.has(i.pmid)
  ).length;
  const items = rawItems
    .filter((i) => !previouslySent.has(i.pmid))
    .slice(0, 12);

  const recipients = await getBriefDigestRecipients();

  const { subject, html, text } = buildBriefDigestEmail({
    items,
    briefUrl,
    dateLabel,
    logoUrl,
  });

  if (recipients.length === 0) {
    return {
      sent: false,
      recipients: [],
      itemCount: items.length,
      skippedReason: "No brief subscribers or digest recipients configured",
      skippedDuplicates,
    };
  }

  const sendEmpty =
    process.env.BRIEF_DIGEST_SEND_IF_EMPTY === "1" ||
    process.env.DIGEST_SEND_IF_EMPTY === "1";

  if (items.length === 0 && !sendEmpty) {
    return {
      sent: false,
      recipients,
      itemCount: 0,
      skippedReason:
        skippedDuplicates > 0
          ? "No new brief items (all recent items already emailed)"
          : "No brief items today",
      skippedDuplicates,
    };
  }

  const result = await sendDigestEmailToEach({
    recipients,
    subject,
    html,
    text,
    from: getBriefDigestFromAddress(),
  });

  if (result.sent > 0 && items.length > 0) {
    await recordBriefEmailSends(items.map((i) => i.pmid));
  }

  return {
    sent: result.sent > 0,
    recipients,
    itemCount: items.length,
    messageId: result.lastId,
    sentCount: result.sent,
    failedRecipients: result.failed.length > 0 ? result.failed : undefined,
    skippedDuplicates,
  };
}
