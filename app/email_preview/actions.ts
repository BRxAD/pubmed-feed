"use server";

import { verifyBriefAdminSecret } from "@/lib/brief/adminAuth";
import {
  updateAnnouncementConfig,
  type BriefAnnouncement,
} from "@/lib/digest/announcements";
import { buildBriefDigestEmail } from "@/lib/digest/briefEmailFormat";
import { getBriefItems, type BriefItem } from "@/lib/brief/items";
import {
  BRIEF_ARTICLE_WINDOW_DAYS,
  DIGEST_SUMMARY_LOOKBACK_DAYS,
} from "@/lib/brief/priority";
import { getPreviouslyEmailedPmids } from "@/lib/digest/briefEmailSends";
import { getUnsentApprovedNews } from "@/lib/digest/briefNewsSends";
import { sendDigestEmail } from "@/lib/digest/sendEmail";
import { getBriefDigestFromAddress } from "@/lib/digest/config";
import { publicAppBaseUrl } from "@/lib/internalFetch";

function isPublishedWithinDays(item: BriefItem, days: number): boolean {
  if (!item.date) return false;
  const t = new Date(
    item.date.includes("T") ? item.date : `${item.date}T12:00:00`
  ).getTime();
  if (Number.isNaN(t)) return false;
  return t >= Date.now() - days * 24 * 60 * 60 * 1000;
}

function isSummaryRecent(item: BriefItem, days: number): boolean {
  const t = new Date(item.createdAt).getTime();
  if (Number.isNaN(t)) return false;
  return t >= Date.now() - days * 24 * 60 * 60 * 1000;
}

export async function saveAnnouncementAction(input: {
  secret: string;
  title: string;
  body: string;
  active: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  if (!verifyBriefAdminSecret(input.secret)) {
    return { ok: false, error: "Unauthorized — invalid admin secret." };
  }

  return updateAnnouncementConfig({
    title: input.title,
    body: input.body,
    active: input.active,
  });
}

export async function sendTestBriefEmailAction(input: {
  secret: string;
  toEmail: string;
  includeNews?: boolean;
  announcement?: BriefAnnouncement | null;
}): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  if (!verifyBriefAdminSecret(input.secret)) {
    return { ok: false, error: "Unauthorized — invalid admin secret." };
  }

  const email = input.toEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Please enter a valid recipient email address." };
  }

  try {
    const base = publicAppBaseUrl();
    const dateLabel = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    // 1. Load upcoming items (same as runBriefDigest)
    const [rawFeed, previouslySent, unsentNews] = await Promise.all([
      getBriefItems({
        maxItems: 40,
        skipHeadlines: false,
        daysBack: DIGEST_SUMMARY_LOOKBACK_DAYS,
        maxLookbackDays: DIGEST_SUMMARY_LOOKBACK_DAYS,
        articleDateWithinDays: BRIEF_ARTICLE_WINDOW_DAYS,
      }),
      getPreviouslyEmailedPmids(),
      getUnsentApprovedNews(3),
    ]);

    const upcomingItems = rawFeed.items
      .filter((i) => {
        if (previouslySent.has(i.pmid)) return false;
        if (!isPublishedWithinDays(i, BRIEF_ARTICLE_WINDOW_DAYS)) return false;
        if (!isSummaryRecent(i, DIGEST_SUMMARY_LOOKBACK_DAYS)) return false;
        return true;
      })
      .slice(0, 12);

    const newsItems = input.includeNews !== false ? unsentNews : [];

    const built = buildBriefDigestEmail({
      items: upcomingItems,
      briefUrl: base,
      dateLabel,
      logoUrl: `${base}/stewardship-brief-logo.png`,
      logoLightUrl: `${base}/stewardship-brief-logo-light.png`,
      newsItems,
      announcement: input.announcement ?? null,
      saveUrlForPmid: (pmid) => `${base}/article/${pmid}?save=1`,
    });

    const result = await sendDigestEmail({
      to: [email],
      subject: `[TEST PREVIEW] ${built.subject}`,
      html: built.html,
      text: built.text,
      from: getBriefDigestFromAddress(),
    });

    return { ok: true, messageId: result.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to send test email",
    };
  }
}
