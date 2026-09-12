import type { Metadata } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { verifyBriefAdminSecret } from "@/lib/brief/adminAuth";
import SettingsUnlock from "@/components/brief/SettingsUnlock";
import EmailPreviewDashboard from "@/components/brief/EmailPreviewDashboard";
import { brief } from "@/components/brief/briefTheme";
import { getBriefItems, type BriefItem } from "@/lib/brief/items";
import {
  BRIEF_ARTICLE_WINDOW_DAYS,
  DIGEST_SUMMARY_LOOKBACK_DAYS,
} from "@/lib/brief/priority";
import { getPreviouslyEmailedPmids } from "@/lib/digest/briefEmailSends";
import { getUnsentApprovedNews } from "@/lib/digest/briefNewsSends";
import { getAnnouncementConfig } from "@/lib/digest/announcements";
import { publicAppBaseUrl } from "@/lib/internalFetch";

export const metadata: Metadata = {
  title: "Email Brief Preview & Announcements — The Stewardship Brief",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

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

export default async function EmailPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ secret?: string }>;
}) {
  const { secret } = await searchParams;
  const authorized = verifyBriefAdminSecret(secret);

  if (!authorized || !secret) {
    return (
      <div className={`min-h-screen ${brief.bg} ${brief.ink}`}>
        <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
          <header className="mb-8 pb-4 border-b border-[#D8D4C8]">
            <p className={`${brief.kicker} mb-1.5`}>Admin Portal</p>
            <h1 className={`${brief.serif} text-2xl sm:text-3xl font-bold`}>
              Email Brief Preview &amp; Announcements
            </h1>
            <p className="mt-2 text-xs text-[#72705B]">
              Enter your admin secret to inspect the upcoming email brief, manage announcements, and send test previews.
            </p>
          </header>
          <SettingsUnlock redirectPath="/email_preview" />
        </div>
      </div>
    );
  }

  const [rawFeed, previouslySent, unsentNews, announcementConfig, session] =
    await Promise.all([
      getBriefItems({
        maxItems: 40,
        skipHeadlines: false,
        daysBack: DIGEST_SUMMARY_LOOKBACK_DAYS,
        maxLookbackDays: DIGEST_SUMMARY_LOOKBACK_DAYS,
        articleDateWithinDays: BRIEF_ARTICLE_WINDOW_DAYS,
      }),
      getPreviouslyEmailedPmids(),
      getUnsentApprovedNews(3),
      getAnnouncementConfig(),
      getServerSession(authOptions),
    ]);

  const upcomingItems = rawFeed.items
    .filter((i) => {
      if (previouslySent.has(i.pmid)) return false;
      if (!isPublishedWithinDays(i, BRIEF_ARTICLE_WINDOW_DAYS)) return false;
      if (!isSummaryRecent(i, DIGEST_SUMMARY_LOOKBACK_DAYS)) return false;
      return true;
    })
    .slice(0, 12);

  const briefBaseUrl = publicAppBaseUrl();

  return (
    <div className={`min-h-screen ${brief.bg} ${brief.ink}`}>
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <header className="mb-8 pb-6 border-b-2 border-[#1C0B19]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className={`${brief.kicker} mb-1.5`}>Admin Dashboard</p>
              <h1 className={`${brief.serif} text-3xl font-bold tracking-tight text-[#1C0B19]`}>
                Upcoming Email Brief Preview
              </h1>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <Link
                href={`/stewardshipbrief/settings?secret=${encodeURIComponent(secret)}`}
                className={`${brief.action} font-medium`}
              >
                ← Relevance settings
              </Link>
              <Link href="/" className={`${brief.action} font-medium`}>
                Open web brief →
              </Link>
            </div>
          </div>
          <p className="mt-2.5 font-sans text-xs sm:text-sm text-[#72705B] max-w-2xl leading-relaxed">
            Inspect tomorrow&apos;s automated morning email digest before delivery. Add or edit an announcement section, verify the &ldquo;In the News&rdquo; roundup, and send a test run to your personal inbox.
          </p>
        </header>

        <EmailPreviewDashboard
          secret={secret}
          upcomingItems={upcomingItems}
          unsentNews={unsentNews}
          initialAnnouncement={announcementConfig}
          userEmail={session?.user?.email}
          briefBaseUrl={briefBaseUrl}
        />
      </div>
    </div>
  );
}
