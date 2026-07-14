import "server-only";
import { getBriefItems } from "@/lib/brief/items";
import { buildBriefDigestEmail } from "@/lib/digest/briefEmailFormat";
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
  const briefUrl = `${base}/stewardshipbrief`;
  const logoUrl = `${base}/stewardship-brief-logo.png`;

  const dateLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const { items } = await getBriefItems({ maxItems: 12, skipHeadlines: false });
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
      skippedReason: "No brief items today",
    };
  }

  const result = await sendDigestEmailToEach({
    recipients,
    subject,
    html,
    text,
    from: getBriefDigestFromAddress(),
  });

  return {
    sent: result.sent > 0,
    recipients,
    itemCount: items.length,
    messageId: result.lastId,
    sentCount: result.sent,
    failedRecipients: result.failed.length > 0 ? result.failed : undefined,
  };
}
