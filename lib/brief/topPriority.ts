import "server-only";
import { getBriefItems, type BriefItem } from "@/lib/brief/items";

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
 * Top 10 PubMed brief-eligible studies from the past 12 months.
 * Ranked by effective priority (admin when set), then relevance.
 */
export async function getTopPriorityYearItems(): Promise<TopPriorityItem[]> {
  const result = await getBriefItems({
    daysBack: 365,
    maxItems: 200,
    setting: "",
    skipHeadlines: true,
  });

  const ranked = [...result.items].sort((a, b) => {
    // Admin-rated items sort ahead of predicted-only when priorities equal
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
