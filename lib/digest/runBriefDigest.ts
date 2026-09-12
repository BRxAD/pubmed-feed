import "server-only";
import { getBriefItems, type BriefItem } from "@/lib/brief/items";
import {
  BRIEF_ARTICLE_WINDOW_DAYS,
  DIGEST_SUMMARY_LOOKBACK_DAYS,
} from "@/lib/brief/priority";
import { buildBriefDigestEmail } from "@/lib/digest/briefEmailFormat";
import {
  getPreviouslyEmailedPmids,
  recordBriefEmailSends,
} from "@/lib/digest/briefEmailSends";
import {
  getBriefSubscribers,
  getActiveAuthUserEmails,
} from "@/lib/digest/briefSubscribers";
import {
  getBriefDigestFromAddress,
  getDigestRecipients,
} from "@/lib/digest/config";
import {
  filterBriefItemsForPreferences,
  getPreferencesByEmails,
  shouldSendBriefEmailToday,
} from "@/lib/digest/recipientPreferences";
import { sendDigestEmailToEach } from "@/lib/digest/sendEmail";
import { publicAppBaseUrl } from "@/lib/internalFetch";
import {
  unsubscribeApiUrlForEmail,
  unsubscribeUrlForEmail,
} from "@/lib/digest/unsubscribeToken";
import { createEmailSaveToken } from "@/lib/digest/emailArticleAction";
import { DEFAULT_USER_PREFERENCES } from "@/lib/userPreferences";
import {
  getUnsentApprovedNews,
  recordBriefNewsEmailSends,
} from "@/lib/digest/briefNewsSends";
import { getActiveAnnouncement } from "@/lib/digest/announcements";

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
  skippedByPreference?: number;
};

function isBriefDigestEnabled(): boolean {
  const raw = process.env.BRIEF_DIGEST_ENABLED?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no") return false;
  return true;
}

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

/** Grandfathered subscribers + active auth_users + configured digest recipients (deduped). */
export async function getBriefDigestRecipients(): Promise<string[]> {
  const [subscribers, authUsers, admins] = await Promise.all([
    getBriefSubscribers(),
    getActiveAuthUserEmails(),
    Promise.resolve(getDigestRecipients()),
  ]);
  return [...new Set([...subscribers, ...authUsers, ...admins])];
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

  const allRecipients = await getBriefDigestRecipients();

  if (allRecipients.length === 0) {
    return {
      sent: false,
      recipients: [],
      itemCount: items.length,
      skippedReason: "No brief subscribers or digest recipients configured",
      skippedDuplicates,
      skippedStaleArticle,
      skippedOldSummary,
      skippedByPreference: 0,
    };
  }

  // STRICT RULE: Only send the brief email if there is 1 or more article for inclusion.
  // If there are 0 priority articles today, do NOT dispatch an email containing only
  // "In the News" or announcements. Delay delivery until the next day with 1+ articles.
  if (items.length === 0) {
    return {
      sent: false,
      recipients: allRecipients,
      itemCount: 0,
      skippedReason:
        skippedDuplicates > 0
          ? "No new brief articles (all recent items already emailed) — email delivery delayed until 1+ new articles arrive"
          : skippedStaleArticle > 0
            ? "No newly published articles in the last 28 days — email delivery delayed until 1+ new articles arrive"
            : "No new brief articles today — email delivery delayed until 1+ new articles arrive",
      skippedDuplicates,
      skippedStaleArticle,
      skippedOldSummary,
      skippedByPreference: 0,
    };
  }

  const prefsByEmail = await getPreferencesByEmails(allRecipients);

  let skippedByPreference = 0;
  const activeRecipients: string[] = [];
  const itemsByEmail = new Map<string, BriefItem[]>();

  for (const email of allRecipients) {
    const prefs =
      prefsByEmail.get(email.trim().toLowerCase()) ?? DEFAULT_USER_PREFERENCES;
    if (!shouldSendBriefEmailToday(prefs)) {
      skippedByPreference++;
      continue;
    }
    const filtered = filterBriefItemsForPreferences(items, prefs);
    // Only send the brief email to this recipient if there is 1 or more article for inclusion
    // matching their preferences. If filtered.length === 0, delay their delivery.
    if (filtered.length === 0) {
      skippedByPreference++;
      continue;
    }
    activeRecipients.push(email);
    itemsByEmail.set(email, filtered);
  }

  if (activeRecipients.length === 0) {
    return {
      sent: false,
      recipients: allRecipients,
      itemCount: items.length,
      skippedReason:
        "No recipients had 1 or more articles matching their preferences today — email delivery delayed until matching articles arrive",
      skippedDuplicates,
      skippedStaleArticle,
      skippedOldSummary,
      skippedByPreference,
    };
  }

  const listIdHost = (() => {
    try {
      return new URL(base).hostname.replace(/^www\./, "");
    } catch {
      return "stewardshipbrief.com";
    }
  })();

  const [unsentNews, announcement] = await Promise.all([
    getUnsentApprovedNews(3),
    getActiveAnnouncement(),
  ]);

  // Fallback body (unused when personalize always returns content).
  const { subject, html, text } = buildBriefDigestEmail({
    items,
    briefUrl,
    dateLabel,
    logoUrl,
    logoLightUrl,
    newsItems: unsentNews,
    announcement,
  });

  const result = await sendDigestEmailToEach({
    recipients: activeRecipients,
    subject,
    html,
    text,
    from: getBriefDigestFromAddress(),
    personalize: (email) => {
      const recipientItems = itemsByEmail.get(email) ?? items;
      const prefs =
        prefsByEmail.get(email.trim().toLowerCase()) ?? DEFAULT_USER_PREFERENCES;
      const recipientNews = prefs.includeNews !== false ? unsentNews : [];

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
      const saveUrlForPmid = (pmid: string) => {
        try {
          const token = createEmailSaveToken({ email, pmid });
          return `${base}/article/${pmid}?save=1&token=${encodeURIComponent(token)}`;
        } catch {
          return `${base}/article/${pmid}?save=1`;
        }
      };

      const personalized = buildBriefDigestEmail({
        items: recipientItems,
        briefUrl,
        dateLabel,
        logoUrl,
        logoLightUrl,
        unsubscribeUrl: unsubscribePageUrl,
        saveUrlForPmid,
        newsItems: recipientNews,
        announcement,
      });
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
        subject: personalized.subject,
        headers,
      };
    },
  });

  if (result.sent > 0) {
    if (items.length > 0) {
      await recordBriefEmailSends(items.map((i) => i.pmid));
    }
    if (unsentNews.length > 0) {
      await recordBriefNewsEmailSends(unsentNews.map((n) => n.id));
    }
  }

  return {
    sent: result.sent > 0,
    recipients: activeRecipients,
    itemCount: items.length,
    messageId: result.lastId,
    sentCount: result.sent,
    failedRecipients: result.failed.length > 0 ? result.failed : undefined,
    skippedDuplicates,
    skippedStaleArticle,
    skippedOldSummary,
    skippedByPreference,
  };
}
