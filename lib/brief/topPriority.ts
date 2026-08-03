import "server-only";
import {
  getBriefItems,
  type BriefItem,
} from "@/lib/brief/items";
import {
  matchesBriefSettingFilter,
  type BriefSettingFilter,
} from "@/lib/brief/settingFilter";

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
  | "jif"
  | "sjrScimago"
>;

/** Prefer JIF; fall back to SJR so Q1/Scimago journals still compete when JIF is missing. */
function citationImpactScore(item: BriefItem): number {
  const jif = item.jif != null && Number.isFinite(item.jif) ? item.jif : 0;
  const sjr =
    item.sjrScimago != null && Number.isFinite(item.sjrScimago)
      ? item.sjrScimago
      : 0;
  // SJR is typically smaller than JIF; weight it so both can break ties meaningfully.
  return Math.max(jif, sjr * 3);
}

/**
 * Top 10 PubMed brief-eligible studies from the past 12 months (article date),
 * priority ≥ 5. Soft setting match so capsules can fill to 10 when classifiers
 * left many rows unclassified.
 *
 * Rank: effective priority → clinical rubric (relevance %) → JIF / citation impact.
 */
export async function getTopPriorityYearItems(
  setting: BriefSettingFilter = ""
): Promise<TopPriorityItem[]> {
  // Fetch without hard setting filter, then soft-filter — classified nulls that
  // still score for the capsule would otherwise leave Top 10 underfilled.
  const result = await getBriefItems({
    daysBack: 400,
    maxItems: 500,
    setting: "",
    skipHeadlines: true,
    maxLookbackDays: 730,
    articleDateWithinDays: TOP_PRIORITY_ARTICLE_WINDOW_DAYS,
  });

  const filtered = setting
    ? result.items.filter((item) =>
        matchesBriefSettingFilter(item, setting, true)
      )
    : result.items;

  const ranked = [...filtered].sort((a, b) => {
    if (b.effectivePriority !== a.effectivePriority) {
      return b.effectivePriority - a.effectivePriority;
    }
    if (b.relevancePercent !== a.relevancePercent) {
      return b.relevancePercent - a.relevancePercent;
    }
    const impactDiff = citationImpactScore(b) - citationImpactScore(a);
    if (impactDiff !== 0) return impactDiff;
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
    jif: item.jif,
    sjrScimago: item.sjrScimago,
  }));
}
