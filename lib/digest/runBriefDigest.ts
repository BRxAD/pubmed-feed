import "server-only";
import { getBriefItems, type BriefItem } from "@/lib/brief/items";
import { BRIEF_ARTICLE_WINDOW_DAYS } from "@/lib/brief/priority";
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
import {
  unsubscribeApiUrlForEmail,
  unsubscribeUrlForEmail,
} from "@/lib/digest/unsubscribeToken";

export type BriefDigestResult = {
  sent: boolean;
  recipients: string[];
  itemCount: number;
  messageId?: string;
  skippedReason?: string;
  sentCount?: number;
  failedRecipients?: string[];
  skippedDuplicates?: number;
  skippedStaleArticle?: number;
  skippedOldSummary?: number;
};

function isBriefDigestEnabled(): boolean {
  const raw = process.env.BRIEF_DIGEST_ENABLED?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no") return false;
  return true;
}

/** How far back to look for newly summarized items for the email (created_at). */
const DIGEST_SUMMARY_LOOKBACK_DAYS = 2;

/** Prefer article/pub date; exclude undated items from email. */
function isPublishedWithinDays(item: BriefItem, days: number): boolean {
  if (!item.date) return false;
  const t = new Date(
    item.date.includes("T")
      ? item.date
      : `${item.date.slice(0, 10)}T12:00:00`
  ).getTime();
  if (Number.isNaN(t)) return false;
  return t >= Date.now() - days * 24 * 60 * 60 * 1000;
}

function isSummaryRecent(item: BriefItem, days: number): boolean {
  const t = new Date(item.createdAt).getTime();
  if (Number.isNaN(t)) return false;
  return t >= Date.now() - days * 24 * 60 * 60 * 1000;
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
  const logoLightUrl = `${base}/stewardship-brief-logo-light.png`;

  const dateLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // Email only: newly summarized rows (created_at), published in the last 28
  // days, and never previously emailed. Do not expand lookback — that would
  // pull in older backfill batches that already appeared on the web brief.
  const { items: rawItems } = await getBriefItems({
    maxItems: 40,
    skipHeadlines: false,
    daysBack: DIGEST_SUMMARY_LOOKBACK_DAYS,
    maxLookbackDays: DIGEST_SUMMARY_LOOKBACK_DAYS,
    articleDateWithinDays: BRIEF_ARTICLE_WINDOW_DAYS,
  });

  const previouslySent = await getPreviouslyEmailedPmids();

  let skippedDuplicates = 0;
  let skippedStaleArticle = 0;
  let skippedOldSummary = 0;

  const items = rawItems
    .filter((i) => {
      if (previouslySent.has(i.pmid)) {
        skippedDuplicates++;
        return false;
      }
      if (!isPublishedWithinDays(i, BRIEF_ARTICLE_WINDOW_DAYS)) {
        skippedStaleArticle++;
        return false;
      }
      if (!isSummaryRecent(i, DIGEST_SUMMARY_LOOKBACK_DAYS)) {
        skippedOldSummary++;
        return false;
      }
      return true;
    })
    .slice(0, 12);

  const recipients = await getBriefDigestRecipients();

  const { subject, html, text } = buildBriefDigestEmail({
    items,
    briefUrl,
    dateLabel,
    logoUrl,
    logoLightUrl,
  });

  if (recipients.length === 0) {
    return {
      sent: false,
      recipients: [],
      itemCount: items.length,
      skippedReason: "No brief subscribers or digest recipients configured",
      skippedDuplicates,
      skippedStaleArticle,
      skippedOldSummary,
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
          : skippedStaleArticle > 0
            ? "No newly published articles in the last 28 days"
            : "No new brief items today",
      skippedDuplicates,
      skippedStaleArticle,
      skippedOldSummary,
    };
  }

  const listIdHost = (() => {
    try {
      return new URL(base).hostname.replace(/^www\./, "");
    } catch {
      return "stewardshipbrief.com";
    }
  })();

  const result = await sendDigestEmailToEach({
    recipients,
    subject,
    html,
    text,
    from: getBriefDigestFromAddress(),
    personalize: (email) => {
      let unsubscribePageUrl: string | undefined;
      let unsubscribeApiUrl: string | undefined;
      try {
        unsubscribePageUrl = unsubscribeUrlForEmail(base, email);
        unsubscribeApiUrl = unsubscribeApiUrlForEmail(base, email);
      } catch (err) {
        console.warn(
          "[brief-digest] unsubscribe token unavailable:",
          err instanceof Error ? err.message : err
        );
      }
      const personalized = buildBriefDigestEmail({
        items,
        briefUrl,
        dateLabel,
        logoUrl,
        logoLightUrl,
        unsubscribeUrl: unsubscribePageUrl,
      });
      // Gmail/Yahoo bulk-sender rules: one-click List-Unsubscribe + clear List-Id.
      const headers: Record<string, string> = {
        "List-Id": `The Stewardship Brief <brief.${listIdHost}>`,
        Precedence: "list",
      };
      if (unsubscribeApiUrl) {
        headers["List-Unsubscribe"] = `<${unsubscribeApiUrl}>`;
        headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
      } else if (unsubscribePageUrl) {
        headers["List-Unsubscribe"] = `<${unsubscribePageUrl}>`;
      }
      return {
        html: personalized.html,
        text: personalized.text,
        headers,
      };
    },
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
    skippedStaleArticle,
    skippedOldSummary,
  };
}
