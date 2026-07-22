import "server-only";
import {
  getBriefItems,
  type BriefItem,
} from "@/lib/brief/items";
import type { BriefSettingFilter } from "@/lib/brief/settingFilter";

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

/**
 * Top 10 PubMed brief-eligible studies from the past 12 months (article date).
 * Honors the active setting capsule. Loads a wide created_at window so late
 * ingest of older publications still qualifies when the paper date is in-range.
 */
export async function getTopPriorityYearItems(
  setting: BriefSettingFilter = ""
): Promise<TopPriorityItem[]> {
  const result = await getBriefItems({
    daysBack: 400,
    maxItems: 300,
    setting,
    skipHeadlines: true,
    minItems: 10,
    maxLookbackDays: 730,
    articleDateWithinDays: 365,
  });

  const ranked = [...result.items].sort((a, b) => {
    const adminA = a.adminPriority != null ? 1 : 0;
    const adminB = b.adminPriority != null ? 1 : 0;
    if (adminB !== adminA) return adminB - adminA;

    if (b.effectivePriority !== a.effectivePriority) {
      return b.effectivePriority - a.effectivePriority;
    }
    if (b.relevancePercent !== a.relevancePercent) {
      return b.relevancePercent - a.relevancePercent;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
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
