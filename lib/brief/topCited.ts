import "server-only";
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getDefaultTopicId, type FeedItem } from "@/lib/feed";
import { getItemSettings } from "@/lib/filters";
import {
  parseArticleSetting,
  type ArticleSetting,
} from "@/lib/classifySetting";
import type { ArticleTopic } from "@/lib/classifyTopic";
import { getItemTopics } from "@/lib/brief/topicFilter";
import {
  matchesBriefSettingFilter,
  type BriefSettingFilter,
} from "@/lib/brief/settingFilter";
import {
  matchesBriefTopicFilter,
  type BriefTopicFilter,
} from "@/lib/brief/topicFilter";
import {
  getItemWhoRegions,
  matchesBriefWhoRegionFilter,
  type BriefWhoRegionFilter,
} from "@/lib/brief/whoRegionFilter";
import type { WhoRegion } from "@/lib/classifyWhoRegion";
import type { BriefItem } from "@/lib/brief/items";
import { articleExternalUrl, isLiveFeedArticle } from "@/lib/feedSource";
import { decodeHtmlEntities } from "@/lib/decodeHtmlEntities";
import {
  citationsPerMonth,
  isWithinDays,
  parseCitedByCount,
} from "@/lib/brief/citationRate";
import { TOP_PRIORITY_ARTICLE_WINDOW_DAYS } from "@/lib/brief/topPriority";

/** Same year window as the priority Top 10. */
export const TOP_CITED_WINDOW_DAYS = TOP_PRIORITY_ARTICLE_WINDOW_DAYS;

export const TOP_CITED_CACHE_TAG = "brief-top-cited";
const TOP_CITED_CACHE_SECONDS = 60 * 60 * 24 * 3;

/** Raw-count net, then re-ranked by citations per month. */
const FETCH_LIMIT = 1000;
const POOL_LIMIT = 300;

export type TopCitedItem = {
  pmid: string;
  headline: string;
  title: string;
  pubmedUrl: string;
  date: string;
  citedByCount: number;
  adminSetting: ArticleSetting | null;
  settings: ArticleSetting[];
  topics: ArticleTopic[];
  autoTopics: ArticleTopic[] | null;
  /** Stored WHO regions. Empty when the summary has none. */
  whoRegions: WhoRegion[];
};

type ArticleCandidate = {
  pmid: string;
  title: string | null;
  pub_date: string | null;
  release_date: string | null;
  cited_by_count: number | null;
  source: string | null;
  doi: string | null;
  openalex_id: string | null;
  landing_url: string | null;
};

type SummaryHead = {
  pmid: string;
  headline: string | null;
  admin_setting: string | null;
  auto_settings: string[] | null;
  auto_topics: string[] | null;
  auto_who_regions?: string[] | null;
};

function asBriefForFilter(item: TopCitedItem): BriefItem {
  return {
    pmid: item.pmid,
    source: "pubmed",
    headline: item.headline,
    title: item.title,
    journal: null,
    jif: null,
    jifIsHigh: false,
    isQ1: false,
    sjrScimago: null,
    date: item.date,
    createdAt: "",
    fetchedAt: null,
    isNew: false,
    setting: item.settings[0] ?? null,
    settings: item.settings,
    adminSetting: item.adminSetting,
    topics: item.topics,
    autoTopics: item.autoTopics,
    whoRegions: item.whoRegions,
    autoWhoRegions: item.whoRegions,
    studyLabel: null,
    methods: null,
    results: null,
    bottomLine: null,
    relevancePercent: 0,
    predictedPriority: 0,
    adminPriority: null,
    effectivePriority: 0,
    prioritySource: "model",
    pubmedUrl: item.pubmedUrl,
    authors: [],
    keywords: [],
    meshTerms: [],
    abstractSnippet: null,
    citedByCount: item.citedByCount,
  };
}

async function loadSummaryHeads(
  supabase: SupabaseClient,
  topicId: string | null,
  pmids: string[]
): Promise<Map<string, SummaryHead>> {
  const map = new Map<string, SummaryHead>();
  if (!topicId || pmids.length === 0) return map;

  for (let i = 0; i < pmids.length; i += 100) {
    const chunk = pmids.slice(i, i + 100);
    const { data, error } = await supabase
      .from("summaries")
      .select(
        "pmid, headline, admin_setting, auto_settings, auto_topics, auto_who_regions"
      )
      .eq("topic_id", topicId)
      .in("pmid", chunk);
    if (error) {
      const message = error.message.toLowerCase();
      if (message.includes("auto_topics") || message.includes("auto_who_regions")) {
        const retry = await supabase
          .from("summaries")
          .select("pmid, headline, admin_setting, auto_settings, auto_topics")
          .eq("topic_id", topicId)
          .in("pmid", chunk);
        if (retry.error) {
          if (retry.error.message.toLowerCase().includes("auto_topics")) {
            const slim = await supabase
              .from("summaries")
              .select("pmid, headline, admin_setting, auto_settings")
              .eq("topic_id", topicId)
              .in("pmid", chunk);
            if (slim.error) {
              console.warn("[topCited] summary read failed:", slim.error.message);
              continue;
            }
            for (const row of (slim.data ?? []) as SummaryHead[]) {
              map.set(row.pmid, {
                ...row,
                auto_topics: null,
                auto_who_regions: null,
              });
            }
            continue;
          }
          console.warn("[topCited] summary read failed:", retry.error.message);
          continue;
        }
        for (const row of (retry.data ?? []) as SummaryHead[]) {
          map.set(row.pmid, { ...row, auto_who_regions: null });
        }
        continue;
      }
      console.warn("[topCited] summary read failed:", error.message);
      continue;
    }
    for (const row of (data ?? []) as SummaryHead[]) {
      map.set(row.pmid, row);
    }
  }
  return map;
}

async function loadTopCitedPool(): Promise<TopCitedItem[]> {
  const supabase = getSupabaseServerClient();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - TOP_CITED_WINDOW_DAYS);
  const sinceDay = since.toISOString().slice(0, 10);
  const now = Date.now();

  const { data, error } = await supabase
    .from("articles")
    .select(
      "pmid, title, pub_date, release_date, cited_by_count, source, doi, openalex_id, landing_url"
    )
    .gte("cited_by_count", 1)
    .or(`release_date.gte.${sinceDay},pub_date.gte.${sinceDay}`)
    .order("cited_by_count", { ascending: false })
    .limit(FETCH_LIMIT);

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("cited_by_count") && message.includes("does not exist")) {
      return [];
    }
    throw new Error(error.message);
  }

  const articles = ((data ?? []) as ArticleCandidate[]).filter((row) => {
    if (!isLiveFeedArticle({
      pmid: row.pmid,
      source: row.source,
      doi: row.doi,
      openalexId: row.openalex_id,
    })) {
      return false;
    }
    const date = row.release_date || row.pub_date;
    return isWithinDays(date, now, TOP_CITED_WINDOW_DAYS);
  });

  const topicId = await getDefaultTopicId();
  const heads = await loadSummaryHeads(
    supabase,
    topicId,
    articles.map((row) => row.pmid)
  );

  const ranked: { item: TopCitedItem; rate: number }[] = [];
  for (const row of articles) {
    const count = parseCitedByCount(row.cited_by_count);
    const date = row.release_date || row.pub_date;
    if (count == null || count < 1 || !date) continue;
    const rate = citationsPerMonth(count, date, now);
    if (rate == null) continue;

    const head = heads.get(row.pmid);
    const title = decodeHtmlEntities(row.title?.trim() || `PMID ${row.pmid}`);
    const headline = decodeHtmlEntities(head?.headline?.trim() || title);
    const adminSetting = parseArticleSetting(head?.admin_setting);
    const autoSettings = Array.isArray(head?.auto_settings)
      ? (head.auto_settings.filter(Boolean) as ArticleSetting[])
      : null;
    const autoTopics = Array.isArray(head?.auto_topics)
      ? (head.auto_topics.filter(Boolean) as ArticleTopic[])
      : null;
    const storedRegions = head?.auto_who_regions;
    const whoRegions = getItemWhoRegions({
      autoWhoRegions: Array.isArray(storedRegions)
        ? (storedRegions.filter(Boolean) as WhoRegion[])
        : null,
      title,
    });
    const feedLike: FeedItem = {
      pmid: row.pmid,
      summary_text: null,
      created_at: "",
      rank_score: null,
      subheading: null,
      label: null,
      jif_2024: null,
      source: "pubmed",
      admin_priority: null,
      ml_priority: null,
      admin_setting: adminSetting,
      auto_settings: autoSettings,
      is_q1: false,
      sjr_scimago: null,
      articles: {
        title,
        abstract: null,
        journal: null,
        pub_date: row.pub_date,
        release_date: row.release_date,
        fetched_at: null,
        publication_types: null,
        keywords: [],
        mesh_terms: [],
        source: row.source,
        doi: row.doi,
        openalex_id: row.openalex_id,
        landing_url: row.landing_url,
      },
    };
    const settings = getItemSettings(feedLike);
    const topics = getItemTopics({
      autoTopics,
      title,
      keywords: [],
      meshTerms: [],
      abstractSnippet: null,
    });

    ranked.push({
      rate,
      item: {
        pmid: row.pmid,
        headline,
        title,
        pubmedUrl: articleExternalUrl(row.pmid, "pubmed", {
          doi: row.doi,
          landingUrl: row.landing_url,
          openalexId: row.openalex_id,
        }),
        date,
        citedByCount: count,
        adminSetting,
        settings,
        topics,
        autoTopics,
        whoRegions,
      },
    });
  }

  ranked.sort((a, b) => {
    if (b.rate !== a.rate) return b.rate - a.rate;
    if (b.item.citedByCount !== a.item.citedByCount) {
      return b.item.citedByCount - a.item.citedByCount;
    }
    return a.item.pmid.localeCompare(b.item.pmid);
  });

  return ranked.slice(0, POOL_LIMIT).map((row) => row.item);
}

const loadCachedTopCitedPool = unstable_cache(
  loadTopCitedPool,
  ["brief-top-cited-pool-v4"],
  { revalidate: TOP_CITED_CACHE_SECONDS, tags: [TOP_CITED_CACHE_TAG] }
);

/**
 * Top 10 by citations per month, past 365 days.
 * All articles with a saved count of at least 1. No priority floor.
 * Cached ~3 days. Setting, topic, and region tabs filter the pool in memory.
 */
export async function getTopCitedYearItems(
  setting: BriefSettingFilter = "",
  topic: BriefTopicFilter = "",
  region: BriefWhoRegionFilter = ""
): Promise<TopCitedItem[]> {
  const pool = await loadCachedTopCitedPool();
  let out = pool;
  if (setting) {
    out = out.filter((item) =>
      matchesBriefSettingFilter(asBriefForFilter(item), setting, true)
    );
  }
  if (topic) {
    out = out.filter((item) =>
      matchesBriefTopicFilter(asBriefForFilter(item), topic)
    );
  }
  if (region) {
    out = out.filter((item) =>
      matchesBriefWhoRegionFilter(asBriefForFilter(item), region)
    );
  }
  return out.slice(0, 10);
}
