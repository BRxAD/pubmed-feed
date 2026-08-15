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

/**
 * Optional tag for rare manual busts. Ingest and admin ratings do **not**
 * revalidate this — Top 10 refreshes on TTL only (~3 days) to limit egress.
 */
export const TOP_PRIORITY_CACHE_TAG = "brief-top-priority";
/** ~3 days — not busted on every ingest/rating. */
const TOP_PRIORITY_CACHE_SECONDS = 60 * 60 * 24 * 3;

/** Enough ranked ≥6 rows so setting tabs can still fill ~10 after filter. */
const TOP_PRIORITY_POOL_LIMIT = 500;

export type TopPriorityItem = Pick<
  BriefItem,
  | "pmid"
  | "headline"
  | "title"
  | "effectivePriority"
  | "adminPriority"
  | "adminSetting"
  | "relevancePercent"
  | "pubmedUrl"
  | "date"
  | "setting"
  | "settings"
  | "keywords"
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
 * Shared Top 10 ranking used by the homepage sidebar.
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
    adminSetting: item.adminSetting,
    relevancePercent: item.relevancePercent,
    pubmedUrl: item.pubmedUrl,
    date: item.date,
    setting: item.setting,
    settings: item.settings,
    keywords: item.keywords,
    jif: item.jif,
    sjrScimago: item.sjrScimago,
  };
}

function articleDateIso(item: BriefItem | TopPriorityItem): string | null {
  const raw = item.date?.trim() || null;
  if (!raw) return null;
  return raw.slice(0, 10);
}

/** Minimal BriefItem shape for setting soft-match against a cached pool row. */
function asBriefForSettingFilter(item: TopPriorityItem): BriefItem {
  return {
    pmid: item.pmid,
    source: "pubmed",
    headline: item.headline,
    title: item.title,
    journal: null,
    jif: item.jif,
    jifIsHigh: false,
    isQ1: false,
    sjrScimago: item.sjrScimago,
    date: item.date,
    createdAt: "",
    fetchedAt: null,
    isNew: false,
    setting: item.setting,
    settings: item.settings,
    adminSetting: item.adminSetting,
    studyLabel: null,
    methods: null,
    results: null,
    bottomLine: null,
    relevancePercent: item.relevancePercent,
    predictedPriority: item.effectivePriority,
    adminPriority: item.adminPriority,
    effectivePriority: item.effectivePriority,
    prioritySource: item.adminPriority != null ? "admin" : "model",
    pubmedUrl: item.pubmedUrl,
    authors: [],
    keywords: item.keywords ?? [],
    meshTerms: [],
    abstractSnippet: null,
  };
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
  const limit = Math.min(500, Math.max(1, options?.limit ?? 10));

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
 * Full-year ≥6 pool (All settings). Cached once; tabs filter in memory.
 */
async function loadTopPriorityYearPool(): Promise<TopPriorityItem[]> {
  return getRankedTopPriorityItems({
    setting: "",
    articleDateWithinDays: TOP_PRIORITY_ARTICLE_WINDOW_DAYS,
    softSetting: false,
    limit: TOP_PRIORITY_POOL_LIMIT,
  });
}

const loadCachedTopPriorityYearPool = unstable_cache(
  loadTopPriorityYearPool,
  ["brief-top-priority-year-pool-v1"],
  { revalidate: TOP_PRIORITY_CACHE_SECONDS, tags: [TOP_PRIORITY_CACHE_TAG] }
);

/**
 * Top 10 PubMed studies from the past 12 months (article date),
 * stored priority ≥ 6. Soft setting match so capsules can fill to 10 when
 * classifiers left many rows unclassified.
 *
 * Loads the shared All pool from cache, then filters — never rebuilds per tab.
 */
export async function getTopPriorityYearItems(
  setting: BriefSettingFilter = ""
): Promise<TopPriorityItem[]> {
  const pool = await loadCachedTopPriorityYearPool();
  if (!setting) return pool.slice(0, 10);
  return pool
    .filter((item) =>
      matchesBriefSettingFilter(asBriefForSettingFilter(item), setting, true)
    )
    .slice(0, 10);
}
