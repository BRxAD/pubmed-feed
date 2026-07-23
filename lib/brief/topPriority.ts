import "server-only";
import {
  getBriefItems,
  type BriefItem,
} from "@/lib/brief/items";
import type { BriefSettingFilter } from "@/lib/brief/settingFilter";

/** Top 10 sidebar uses a full year of article dates (main brief stays 28 days). */
export const TOP_PRIORITY_ARTICLE_WINDOW_DAYS = 365;

export type TopPriorityItem = Pick<
  BriefItem,
  | "pmid"
  | "headline"
  | "title"
  | "effectivePriority"
  | "adminPriority"
  | "relevancePercent"
  | "pubmedUrl"
  | "date"
  | "setting"
>;

function articleTimestamp(item: {
  date: string | null;
  createdAt: string;
}): number {
  const raw = item.date ?? item.createdAt;
  if (!raw) return 0;
  const t = new Date(
    raw.includes("T") ? raw : `${String(raw).slice(0, 10)}T12:00:00`
  ).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Top 10 PubMed brief-eligible studies from the past 12 months (article date),
 * priority ≥ 5 (admin rating supersedes predicted). Newest first among ties.
 */
export async function getTopPriorityYearItems(
  setting: BriefSettingFilter = ""
): Promise<TopPriorityItem[]> {
  const result = await getBriefItems({
    // Wide created_at lookback so late ingest of in-year papers still qualify.
    daysBack: 400,
    maxItems: 300,
    setting,
    skipHeadlines: true,
    minItems: 10,
    maxLookbackDays: 730,
    articleDateWithinDays: TOP_PRIORITY_ARTICLE_WINDOW_DAYS,
  });

  const ranked = [...result.items].sort((a, b) => {
    if (b.effectivePriority !== a.effectivePriority) {
      return b.effectivePriority - a.effectivePriority;
    }
    const tDiff = articleTimestamp(b) - articleTimestamp(a);
    if (tDiff !== 0) return tDiff;
    if (b.relevancePercent !== a.relevancePercent) {
      return b.relevancePercent - a.relevancePercent;
    }
    return 0;
  });

  return ranked.slice(0, 10).map((item) => ({
    pmid: item.pmid,
    headline: item.headline,
    title: item.title,
    effectivePriority: item.effectivePriority,
    adminPriority: item.adminPriority,
    relevancePercent: item.relevancePercent,
    pubmedUrl: item.pubmedUrl,
    date: item.date,
    setting: item.setting,
  }));
}
