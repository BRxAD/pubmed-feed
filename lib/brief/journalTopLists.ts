import type { ArticleSetting } from "@/lib/classifySetting";
import { parseArticleSetting } from "@/lib/classifySetting";
import type { ArticleTopic } from "@/lib/classifyTopic";
import type { WhoRegion } from "@/lib/classifyWhoRegion";
import type { FeedItem } from "@/lib/feed";
import { articleExternalUrl, isLiveFeedArticle } from "@/lib/feedSource";
import { getItemSettings } from "@/lib/filters";
import { decodeHtmlEntities } from "@/lib/decodeHtmlEntities";
import {
  citationsPerMonth,
  isWithinDays,
  parseCitedByCount,
} from "@/lib/brief/citationRate";
import type { BriefItem } from "@/lib/brief/items";
import { effectivePriority } from "@/lib/brief/priority";
import {
  matchesBriefSettingFilter,
  type BriefSettingFilter,
} from "@/lib/brief/settingFilter";
import {
  getItemTopics,
  matchesBriefTopicFilter,
  type BriefTopicFilter,
} from "@/lib/brief/topicFilter";
import {
  getItemWhoRegions,
  matchesBriefWhoRegionFilter,
  type BriefWhoRegionFilter,
} from "@/lib/brief/whoRegionFilter";
import type { TopCitedItem } from "@/lib/brief/topCited";
import type { TopPriorityItem } from "@/lib/brief/topPriority";
import { normalizeScoreTo100 } from "@/lib/filters";

export type JournalTopArticle = {
  pmid: string;
  title: string | null;
  journal: string | null;
  pubDate: string | null;
  releaseDate: string | null;
  citedByCount: number | null;
  source: string | null;
  doi: string | null;
  openalexId: string | null;
  landingUrl: string | null;
  jif: number | null;
  sjr: number | null;
};

export type JournalTopSummary = {
  pmid: string;
  headline: string | null;
  adminPriority: number | null;
  mlPriority: number | null;
  rankScore: number | null;
  adminSetting: string | null;
  autoSettings: string[] | null;
  autoTopics: string[] | null;
  autoWhoRegions: string[] | null;
};

type Prepared = {
  priority: TopPriorityItem | null;
  cited: TopCitedItem | null;
  citedRate: number;
  filterItem: BriefItem;
};

function articleDate(article: JournalTopArticle): string | null {
  return article.releaseDate || article.pubDate || null;
}

function impactScore(jif: number | null, sjr: number | null): number {
  const j = jif != null && Number.isFinite(jif) ? jif : 0;
  const s = sjr != null && Number.isFinite(sjr) ? sjr : 0;
  return Math.max(j, s * 3);
}

function meetsPriorityFloor(
  admin: number | null,
  ml: number | null,
  min: number
): boolean {
  if (admin != null && Number.isFinite(admin)) return admin >= min;
  if (ml != null && Number.isFinite(ml)) return ml >= min;
  return false;
}

function asSettings(raw: string[] | null): ArticleSetting[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ArticleSetting[] = [];
  for (const value of raw) {
    const parsed = parseArticleSetting(value);
    if (parsed) out.push(parsed);
  }
  return out;
}

function asTopics(raw: string[] | null): ArticleTopic[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter(Boolean) as ArticleTopic[];
}

function asRegions(raw: string[] | null): WhoRegion[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter(Boolean) as WhoRegion[];
}

function prepare(
  article: JournalTopArticle,
  summary: JournalTopSummary | undefined,
  nowMs: number,
  windowDays: number,
  minPriority: number
): Prepared | null {
  const pmid = article.pmid.trim();
  if (!pmid) return null;
  if (
    !isLiveFeedArticle({
      pmid,
      source: article.source,
      doi: article.doi,
      openalexId: article.openalexId,
    })
  ) {
    return null;
  }

  const date = articleDate(article);
  const inWindow = date != null && isWithinDays(date, nowMs, windowDays);
  const title = decodeHtmlEntities(article.title?.trim() || `PMID ${pmid}`);
  const headline = decodeHtmlEntities(summary?.headline?.trim() || title);
  const adminSetting = parseArticleSetting(summary?.adminSetting);
  const autoSettings = asSettings(summary?.autoSettings ?? null);
  const autoTopics = asTopics(summary?.autoTopics ?? null);
  const autoWhoRegions = asRegions(summary?.autoWhoRegions ?? null);
  const adminPriority =
    summary?.adminPriority != null && Number.isFinite(summary.adminPriority)
      ? summary.adminPriority
      : null;
  const mlPriority =
    summary?.mlPriority != null && Number.isFinite(summary.mlPriority)
      ? summary.mlPriority
      : null;
  const pubmedUrl = articleExternalUrl(pmid, "pubmed", {
    doi: article.doi,
    landingUrl: article.landingUrl,
    openalexId: article.openalexId,
  });

  const feedLike: FeedItem = {
    pmid,
    summary_text: null,
    created_at: "",
    rank_score: summary?.rankScore ?? null,
    subheading: null,
    label: null,
    jif_2024: article.jif,
    source: "pubmed",
    admin_priority: adminPriority,
    ml_priority: mlPriority,
    admin_setting: adminSetting,
    auto_settings: autoSettings,
    is_q1: false,
    sjr_scimago: article.sjr,
    articles: {
      title,
      abstract: null,
      journal: article.journal,
      pub_date: article.pubDate,
      release_date: article.releaseDate,
      fetched_at: null,
      publication_types: null,
      keywords: [],
      mesh_terms: [],
      source: article.source,
      doi: article.doi,
      openalex_id: article.openalexId,
      landing_url: article.landingUrl,
    },
  };
  const settings = getItemSettings(feedLike);
  const topics = getItemTopics({ autoTopics, title });
  const whoRegions = getItemWhoRegions({
    autoWhoRegions,
    title,
  });
  const citedByCount = parseCitedByCount(article.citedByCount);
  const relevancePercent = normalizeScoreTo100(summary?.rankScore ?? 0);
  const priority =
    adminPriority != null || mlPriority != null
      ? effectivePriority(adminPriority, mlPriority ?? 0)
      : 0;

  const filterItem = {
    pmid,
    title,
    headline,
    settings,
    setting: settings[0] ?? null,
    adminSetting,
    topics,
    autoTopics,
    whoRegions,
    autoWhoRegions: whoRegions,
    keywords: [],
    meshTerms: [],
  } as unknown as BriefItem;

  let priorityItem: TopPriorityItem | null = null;
  if (
    inWindow &&
    summary &&
    meetsPriorityFloor(adminPriority, mlPriority, minPriority)
  ) {
    priorityItem = {
      pmid,
      headline,
      title,
      effectivePriority: priority,
      adminPriority,
      adminSetting,
      relevancePercent,
      pubmedUrl,
      date,
      setting: settings[0] ?? null,
      settings,
      topics,
      whoRegions,
      autoWhoRegions: whoRegions,
      keywords: [],
      meshTerms: [],
      jif: article.jif,
      sjrScimago: article.sjr,
    };
  }

  let citedItem: TopCitedItem | null = null;
  let citedRate = 0;
  if (inWindow && citedByCount != null && citedByCount >= 1 && date) {
    const rate = citationsPerMonth(citedByCount, date, nowMs);
    if (rate != null) {
      citedRate = rate;
      citedItem = {
        pmid,
        headline,
        title,
        pubmedUrl,
        date,
        citedByCount,
        adminSetting,
        settings,
        topics,
        autoTopics,
        whoRegions,
      };
    }
  }

  if (!priorityItem && !citedItem) return null;
  return { priority: priorityItem, cited: citedItem, citedRate, filterItem };
}

function passes(
  item: BriefItem,
  setting: BriefSettingFilter,
  topic: BriefTopicFilter,
  region: BriefWhoRegionFilter
): boolean {
  if (setting && !matchesBriefSettingFilter(item, setting, true)) return false;
  if (topic && !matchesBriefTopicFilter(item, topic)) return false;
  if (region && !matchesBriefWhoRegionFilter(item, region)) return false;
  return true;
}

/**
 * Top 10 relevance and Top 10 cited for one journal.
 * Same windows and ranks as the homepage sidebars. No abstracts.
 */
export function pickJournalTopLists(options: {
  articles: JournalTopArticle[];
  summaries: JournalTopSummary[];
  nowMs: number;
  windowDays: number;
  minPriority: number;
  setting?: BriefSettingFilter;
  topic?: BriefTopicFilter;
  region?: BriefWhoRegionFilter;
  limit?: number;
}): { priority: TopPriorityItem[]; cited: TopCitedItem[] } {
  const limit = Math.min(10, Math.max(1, options.limit ?? 10));
  const setting = options.setting ?? "";
  const topic = options.topic ?? "";
  const region = options.region ?? "";
  const byPmid = new Map<string, JournalTopSummary>();
  for (const summary of options.summaries) {
    if (!byPmid.has(summary.pmid)) byPmid.set(summary.pmid, summary);
  }

  const prepared: Prepared[] = [];
  for (const article of options.articles) {
    const row = prepare(
      article,
      byPmid.get(article.pmid),
      options.nowMs,
      options.windowDays,
      options.minPriority
    );
    if (!row) continue;
    if (!passes(row.filterItem, setting, topic, region)) continue;
    prepared.push(row);
  }

  const priority = prepared
    .flatMap((row) => (row.priority ? [row.priority] : []))
    .sort((a, b) => {
      if (b.effectivePriority !== a.effectivePriority) {
        return b.effectivePriority - a.effectivePriority;
      }
      const human =
        Number(b.adminPriority != null) - Number(a.adminPriority != null);
      if (human !== 0) return human;
      if (b.relevancePercent !== a.relevancePercent) {
        return b.relevancePercent - a.relevancePercent;
      }
      const impact = impactScore(b.jif, b.sjrScimago) - impactScore(a.jif, a.sjrScimago);
      if (impact !== 0) return impact;
      return a.pmid.localeCompare(b.pmid);
    })
    .slice(0, limit);

  const cited = prepared
    .flatMap((row) => (row.cited ? [{ item: row.cited, rate: row.citedRate }] : []))
    .sort((a, b) => {
      if (b.rate !== a.rate) return b.rate - a.rate;
      if (b.item.citedByCount !== a.item.citedByCount) {
        return b.item.citedByCount - a.item.citedByCount;
      }
      return a.item.pmid.localeCompare(b.item.pmid);
    })
    .slice(0, limit)
    .map((row) => row.item);

  return { priority, cited };
}
