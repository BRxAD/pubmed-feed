import "server-only";
import { unstable_cache } from "next/cache";
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

/**
 * Top 10 candidate scan floor (stored admin/ml priority).
 * Main Brief stays at BRIEF_MIN_PRIORITY (5); Top 10 only loads ≥ 6.
 */
export const TOP_PRIORITY_MIN_PRIORITY = 6;

/** Revalidated on admin rating changes; the TTL only bounds ingest-driven drift. */
export const TOP_PRIORITY_CACHE_TAG = "brief-top-priority";
const TOP_PRIORITY_CACHE_SECONDS = 900;

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
  | "settings"
  | "jif"
  | "sjrScimago"
>;

/** Prefer JIF; fall back to SJR so Q1/Scimago journals still compete when JIF is missing. */
export function citationImpactScore(item: {
  jif: number | null;
  sjrScimago: number | null;
}): number {
  const jif = item.jif != null && Number.isFinite(item.jif) ? item.jif : 0;
  const sjr =
    item.sjrScimago != null && Number.isFinite(item.sjrScimago)
      ? item.sjrScimago
      : 0;
  return Math.max(jif, sjr * 3);
}

/**
 * Shared Top 10 ranking used by the homepage sidebar and the dashboard.
 * Rank: effective priority → human rating over ML → clinical rubric
 * (relevance %) → JIF / citation impact.
 */
export function rankTopPriorityItems(items: BriefItem[]): BriefItem[] {
  return [...items].sort((a, b) => {
    if (b.effectivePriority !== a.effectivePriority) {
      return b.effectivePriority - a.effectivePriority;
    }
    const humanDiff =
      Number(b.adminPriority != null) - Number(a.adminPriority != null);
    if (humanDiff !== 0) return humanDiff;
    if (b.relevancePercent !== a.relevancePercent) {
      return b.relevancePercent - a.relevancePercent;
    }
    const impactDiff = citationImpactScore(b) - citationImpactScore(a);
    if (impactDiff !== 0) return impactDiff;
    return a.pmid.localeCompare(b.pmid);
  });
}

function toTopPriorityItem(item: BriefItem): TopPriorityItem {
  return {
    pmid: item.pmid,
    headline: item.headline,
    title: item.title,
    effectivePriority: item.effectivePriority,
    adminPriority: item.adminPriority,
    relevancePercent: item.relevancePercent,
    pubmedUrl: item.pubmedUrl,
    date: item.date,
    setting: item.setting,
    settings: item.settings,
    jif: item.jif,
    sjrScimago: item.sjrScimago,
  };
}

function articleDateIso(item: BriefItem): string | null {
  const raw = item.date?.trim() || null;
  if (!raw) return null;
  return raw.slice(0, 10);
}

/**
 * Load brief-eligible (priority ≥ 5) PubMed items and rank them with the
 * shared Top 10 rules. Optional ISO date bounds filter on article date.
 */
export async function getRankedTopPriorityItems(options?: {
  setting?: BriefSettingFilter;
  /** Article-date window ending today (default 365). */
  articleDateWithinDays?: number;
  /** Inclusive YYYY-MM-DD bounds (applied after the window fetch). */
  from?: string | null;
  to?: string | null;
  softSetting?: boolean;
  limit?: number;
}): Promise<TopPriorityItem[]> {
  const windowDays = Math.min(
    365,
    Math.max(1, options?.articleDateWithinDays ?? TOP_PRIORITY_ARTICLE_WINDOW_DAYS)
  );
  const setting = options?.setting ?? "";
  const softSetting = options?.softSetting ?? Boolean(setting);
  const limit = Math.min(50, Math.max(1, options?.limit ?? 10));

  const result = await getBriefItems({
    daysBack: windowDays,
    maxItems: 3000,
    setting: "",
    skipHeadlines: true,
    maxLookbackDays: 365,
    rankBy: "priority",
    articleDateWithinDays: windowDays,
    minPriority: TOP_PRIORITY_MIN_PRIORITY,
    // SQL prefilter: do not walk the year for priority 5 / unscored rows.
    storedPriorityMin: TOP_PRIORITY_MIN_PRIORITY,
  });

  let filtered = setting
    ? result.items.filter((item) =>
        matchesBriefSettingFilter(item, setting, softSetting)
      )
    : result.items;

  const from = options?.from?.trim() || null;
  const to = options?.to?.trim() || null;
  if (from || to) {
    filtered = filtered.filter((item) => {
      const d = articleDateIso(item);
      if (!d) return false;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }

  return rankTopPriorityItems(filtered).slice(0, limit).map(toTopPriorityItem);
}

/**
 * Top 10 PubMed studies from the past 12 months (article date),
 * stored priority ≥ 6. Soft setting match so capsules can fill to 10 when
 * classifiers left many rows unclassified.
 */
async function rankTopPriorityYearItems(
  setting: BriefSettingFilter
): Promise<TopPriorityItem[]> {
  return getRankedTopPriorityItems({
    setting,
    articleDateWithinDays: TOP_PRIORITY_ARTICLE_WINDOW_DAYS,
    softSetting: true,
    limit: 10,
  });
}

/**
 * Ranking a full year of studies means scoring every candidate, which is too
 * costly to repeat per request. Cache it; admin rating changes bust the tag.
 */
const loadTopPriorityYearItems = unstable_cache(
  rankTopPriorityYearItems,
  ["brief-top-priority-year-v3"],
  { revalidate: TOP_PRIORITY_CACHE_SECONDS, tags: [TOP_PRIORITY_CACHE_TAG] }
);

export async function getTopPriorityYearItems(
  setting: BriefSettingFilter = ""
): Promise<TopPriorityItem[]> {
  return loadTopPriorityYearItems(setting);
}
