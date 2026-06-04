import "server-only";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import type { FeedSource } from "@/lib/feedSource";
import { DEFAULT_FEED_SOURCE } from "@/lib/feedSource";
import type { PubMedRecord } from "@/lib/pubmed/efetch";
import {
  computeBreakdown,
} from "@/lib/ranking";
import { isHighImpactJournal } from "@/lib/jif";
import {
  mergeLearnedWeights,
  priorityScoreBoost,
} from "@/lib/relevanceLearning";
import {
  applyFiltersToFeedItems,
  canonicalKeywordForGrouping,
  keywordDisplayForm,
  isTrendingBlocklisted,
  type FeedFilterParams,
} from "@/lib/filters";

function normalizeJournalName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

const DEFAULT_TOPIC_NAME = "antimicrobial stewardship";

/** Name used for the AI + antimicrobial stewardship topic (MeSH, Jan 2024+, weekly refresh). */
export const AI_STEWARDSHIP_TOPIC_NAME = "Antimicrobial stewardship and artificial intelligence";

/** Main feed topic (stewardship only); excludes the AI+stewardship topic. */
export async function getDefaultTopicId(): Promise<string | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("topics")
    .select("id, name")
    .ilike("name", `%${DEFAULT_TOPIC_NAME}%`)
    .limit(5);
  if (error || !data?.length) return null;
  const main = data.find(
    (row) =>
      !String((row as { name?: string }).name ?? "").toLowerCase().includes("artificial intelligence")
  );
  return main?.id ?? data[0].id;
}

export async function getAIStewardshipTopicId(): Promise<string | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("topics")
    .select("id")
    .ilike("name", `%${AI_STEWARDSHIP_TOPIC_NAME}%`)
    .limit(1);
  if (error || !data?.length) return null;
  return data[0].id;
}

export type FeedItem = {
  pmid: string;
  summary_text: string | null;
  created_at: string;
  rank_score: number | null;
  subheading: string | null;
  label: string | null;
  jif_2024: number | null;
  source: FeedSource;
  admin_priority: number | null;
  articles: {
    title: string | null;
    abstract: string | null;
    journal: string | null;
    pub_date: string | null;
    release_date: string | null;
    fetched_at: string | null;
    publication_types: string[] | null;
    keywords: string[] | null;
    source: string | null;
  } | null;
};

export type FeedSort = "relevance" | "recency";

const PAGE_SIZE = 10;

export async function getFeedItems(
  topicId: string,
  limit = PAGE_SIZE,
  cursor: string | null = null,
  sort: FeedSort = "recency",
  filters?: FeedFilterParams,
  page = 1,
  source: FeedSource = DEFAULT_FEED_SOURCE
): Promise<{
  items: FeedItem[];
  nextCursor: string | null;
  query_string: string;
  totalCount: number;
  totalPages: number;
  page: number;
}> {
  const supabase = getSupabaseServerClient();

  const { data: topic, error: topicError } = await supabase
    .from("topics")
    .select("id, query_string, ranking_weights")
    .eq("id", topicId)
    .maybeSingle();

  if (topicError || !topic) {
    throw new Error("Topic not found");
  }

  const query_string =
    topic.query_string != null && String(topic.query_string).trim()
      ? String(topic.query_string).trim()
      : "";

  const learnedWeights = mergeLearnedWeights(
    (topic as { ranking_weights?: Record<string, unknown> | null }).ranking_weights
  );

  const hasFilters = Boolean(filters?.keyword?.trim());
  const fetchLimit = 500;

  // Main feed: include both default (stewardship) and AI topic summaries so we don't lose
  // high-relevance articles that were only ingested under the AI topic.
  const defaultTopicId = await getDefaultTopicId();
  const aiTopicId = await getAIStewardshipTopicId();
  const isMainFeed =
    defaultTopicId === topicId &&
    aiTopicId &&
    aiTopicId !== defaultTopicId;
  const topicIdsToFetch = isMainFeed
    ? [defaultTopicId!, aiTopicId!]
    : [topicId];

  const selectColumns =
    "pmid, summary_text, created_at, subheading, label, admin_priority, articles!inner(title, abstract, journal, pub_date, release_date, fetched_at, publication_types, keywords, source)";

  let query = supabase
    .from("summaries")
    .select(selectColumns)
    .in("topic_id", topicIdsToFetch)
    .eq("articles.source", source)
    .order("created_at", { ascending: false })
    .limit(isMainFeed ? 1000 : fetchLimit);

  if (cursor?.trim() && sort === "recency") {
    query = query.lt("created_at", cursor.trim());
  }

  const { data: rawItems, error } = await query;

  if (error) throw new Error(error.message);

  let items = (rawItems ?? []) as Record<string, unknown>[];

  // Dedupe by pmid (keep most recent) when main feed merged two topics
  if (isMainFeed && items.length > 0) {
    const seen = new Set<string>();
    items = items.filter((it) => {
      const pmid = String((it as { pmid?: string }).pmid ?? "").trim();
      if (!pmid || seen.has(pmid)) return false;
      seen.add(pmid);
      return true;
    });
    items = items.slice(0, fetchLimit);
  }

  const journalNames = [
    ...new Set(
      items
        .map((it) => {
          const a = (it as { articles?: { journal?: string | null } | null })
            ?.articles;
          const j = a?.journal;
          return j && String(j).trim() ? normalizeJournalName(String(j)) : null;
        })
        .filter((j): j is string => j != null)
    ),
  ];

  const jifByJournal = new Map<string, number | null>();
  if (journalNames.length > 0) {
    const chunkSize = 100;
    for (let i = 0; i < journalNames.length; i += chunkSize) {
      const chunk = journalNames.slice(i, i + chunkSize);
      const { data: rows } = await supabase
        .from("journal_metrics")
        .select("journal_name, jif_2024")
        .in("journal_name", chunk);
      if (rows) {
        for (const row of rows) {
          const jif =
            row.jif_2024 != null && !Number.isNaN(Number(row.jif_2024))
              ? Number(row.jif_2024)
              : null;
          jifByJournal.set(row.journal_name, jif);
        }
      }
    }
  }

  let itemsWithJif: FeedItem[] = items.map((it) => {
    const row = it as {
      pmid: string;
      summary_text: string | null;
      created_at: string;
      subheading?: string | null;
      label?: string | null;
      rank_score?: number | null;
      admin_priority?: number | null;
      articles?: {
        title?: string | null;
        abstract?: string | null;
        journal?: string | null;
        pub_date?: string | null;
        release_date?: string | null;
        fetched_at?: string | null;
        publication_types?: string[] | null;
        keywords?: string[] | null;
        source?: string | null;
      } | null;
    };
    const journal = row.articles?.journal;
    const normalizedJournal =
      journal && String(journal).trim()
        ? normalizeJournalName(String(journal))
        : null;
    const jif_2024 = normalizedJournal
      ? jifByJournal.get(normalizedJournal) ?? null
      : null;
    const articleSource =
      row.articles?.source === "openalex" ? "openalex" : "pubmed";
    const articles: FeedItem["articles"] =
      row.articles != null
        ? {
            title: row.articles.title ?? null,
            abstract: row.articles.abstract ?? null,
            journal: row.articles.journal ?? null,
            pub_date: row.articles.pub_date ?? null,
            release_date: row.articles.release_date ?? null,
            fetched_at: row.articles.fetched_at ?? null,
            publication_types: row.articles.publication_types ?? null,
            keywords: row.articles.keywords ?? null,
            source: row.articles.source ?? null,
          }
        : null;
    return {
      pmid: row.pmid,
      summary_text: row.summary_text,
      created_at: row.created_at,
      subheading: row.subheading ?? null,
      label: row.label ?? null,
      rank_score: row.rank_score ?? null,
      admin_priority: row.admin_priority ?? null,
      jif_2024,
      source: articleSource,
      articles,
    };
  });

  if (hasFilters && filters) {
    itemsWithJif = applyFiltersToFeedItems(itemsWithJif, filters);
  }

  if (sort === "relevance" && query_string) {
    const recFromItem = (item: FeedItem): PubMedRecord => ({
      pmid: item.pmid,
      title: item.articles?.title ?? null,
      abstract: item.articles?.abstract ?? null,
      journal: item.articles?.journal ?? null,
      pubDate: item.articles?.pub_date ?? null,
      publicationTypes: item.articles?.publication_types ?? [],
      meshTerms: [],
      keywords: item.articles?.keywords ?? [],
      authors: [],
    });
    itemsWithJif = itemsWithJif
      .map((item) => {
        const rec = recFromItem(item);
        const jifIsHigh = isHighImpactJournal(item.articles?.journal);
        const breakdown = computeBreakdown(
          query_string,
          rec,
          learnedWeights,
          true,
          jifIsHigh
        );
        const rank_score =
          breakdown.finalScore + priorityScoreBoost(item.admin_priority);
        return { ...item, rank_score };
      })
      .sort((a, b) => (b.rank_score ?? 0) - (a.rank_score ?? 0));
  } else if (sort === "recency") {
    const today = new Date().toISOString().slice(0, 10);
    const releaseOrFetched = (item: FeedItem): string => {
      const release = item.articles?.release_date?.trim();
      const pub = item.articles?.pub_date?.trim();
      const fetched = item.articles?.fetched_at?.slice(0, 10);
      const created = item.created_at.slice(0, 10);
      const raw = release ?? pub ?? fetched ?? created ?? "";
      if (!raw) return "";
      return raw > today ? today : raw;
    };
    const fetchedAt = (item: FeedItem): string =>
      item.articles?.fetched_at?.trim() ?? "";
    itemsWithJif = itemsWithJif.sort((a, b) => {
      const da = releaseOrFetched(a);
      const db = releaseOrFetched(b);
      if (da !== db) {
        if (!da) return 1;
        if (!db) return -1;
        return db.localeCompare(da);
      }
      return fetchedAt(b).localeCompare(fetchedAt(a));
    });
  }

  const totalCount = itemsWithJif.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pageNum = Math.max(1, Math.min(page, totalPages));
  const start = (pageNum - 1) * PAGE_SIZE;
  const paginatedItems = itemsWithJif.slice(start, start + PAGE_SIZE);

  const lastItem =
    paginatedItems.length > 0 ? paginatedItems[paginatedItems.length - 1] : null;
  const nextCursor = lastItem
    ? sort === "relevance" && lastItem.rank_score != null
      ? String(lastItem.rank_score)
      : lastItem.created_at
    : null;

  return {
    items: paginatedItems,
    nextCursor,
    query_string,
    totalCount,
    totalPages,
    page: pageNum,
  };
}

export type TrendingKeyword = { keyword: string; count: number };

/**
 * Top 10 keywords from summaries for this topic in the last 30 days.
 */
export async function getTrendingKeywords(
  topicId: string,
  source: FeedSource = DEFAULT_FEED_SOURCE
): Promise<TrendingKeyword[]> {
  const supabase = getSupabaseServerClient();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const since = thirtyDaysAgo.toISOString();

  const { data: rows, error } = await supabase
    .from("summaries")
    .select("articles!inner(keywords, source)")
    .eq("topic_id", topicId)
    .eq("articles.source", source)
    .gte("created_at", since)
    .limit(10000);

  if (error) return [];

  const countByKeyword = new Map<string, number>();
  for (const row of rows ?? []) {
    const a = row as { articles?: { keywords?: string[] | null } | null };
    const keywords = a?.articles?.keywords;
    if (!Array.isArray(keywords)) continue;
    for (const kw of keywords) {
      const k = (kw ?? "").trim();
      if (!k) continue;
      const canonical = canonicalKeywordForGrouping(k);
      countByKeyword.set(canonical, (countByKeyword.get(canonical) ?? 0) + 1);
    }
  }

  return Array.from(countByKeyword.entries())
    .filter(([canonical]) => !isTrendingBlocklisted(canonical))
    .map(([canonical, count]) => ({
      keyword: keywordDisplayForm(canonical),
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}
