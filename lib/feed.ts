import "server-only";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import type { FeedSource, FeedSourceFilter } from "@/lib/feedSource";
import { DEFAULT_FEED_SOURCE_FILTER } from "@/lib/feedSource";
import type { PubMedRecord } from "@/lib/pubmed/efetch";
import {
  computeBreakdown,
} from "@/lib/ranking";
import { isHighImpactJournal } from "@/lib/jif";
import { isQ1Journal, lookupScimago } from "@/lib/scimago";
import {
  mergeLearnedWeights,
  mergeStoredFeedSettings,
  priorityScoreBoost,
} from "@/lib/relevanceLearning";
import {
  toPenaltyWeights,
  type BriefFeedSettings,
} from "@/lib/brief/feedSettings";
import type { ScoringOptions } from "@/lib/ranking";
import {
  applyFiltersToFeedItems,
  canonicalKeywordForGrouping,
  keywordDisplayForm,
  isTrendingBlocklisted,
  type FeedFilterParams,
} from "@/lib/filters";
import type { ArticleSetting } from "@/lib/classifySetting";
import {
  loadPriorityModel,
  predictArticlePriority,
} from "@/lib/brief/priorityModel";
import { effectivePriority } from "@/lib/brief/priority";

function normalizeJournalName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

const VALID_ADMIN_SETTINGS = new Set<ArticleSetting>([
  "hospital",
  "community",
  "long-term care",
  "animal",
  "environment",
]);

function parseAdminSetting(raw: string | null | undefined): ArticleSetting | null {
  if (!raw?.trim()) return null;
  const v = raw.trim() as ArticleSetting;
  return VALID_ADMIN_SETTINGS.has(v) ? v : null;
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
  /** Manual setting override; wins over auto-classification when set. */
  admin_setting: ArticleSetting | null;
  /** SCImago 2025 Q1 flag. */
  is_q1: boolean;
  /** SCImago SJR when journal is Q1; otherwise null. */
  sjr_scimago: number | null;
  articles: {
    title: string | null;
    abstract: string | null;
    journal: string | null;
    pub_date: string | null;
    release_date: string | null;
    fetched_at: string | null;
    publication_types: string[] | null;
    keywords: string[] | null;
    mesh_terms: string[] | null;
    source: string | null;
  } | null;
};

export type FeedSort = "relevance" | "ingested" | "published";

/** Accept legacy ?sort=recency as ingest-time sort. */
export function parseFeedSort(raw: string | null | undefined): FeedSort {
  if (raw === "relevance") return "relevance";
  if (raw === "published") return "published";
  // Default + legacy "recency" → newest intake first
  return "ingested";
}

const PAGE_SIZE = 10;

/**
 * Supabase/PostgREST silently caps each response (default 1000 rows) even when
 * .limit() asks for more. Page through with .range() to retrieve the full set.
 */
const SUPABASE_FETCH_PAGE = 1000;
/** Safety ceiling so a runaway table cannot OOM the feed renderer. */
const SUPABASE_FETCH_SAFETY_MAX = 20_000;

type SummaryRow = Record<string, unknown>;

function applySourceFilter<T extends { eq: Function; or: Function }>(
  query: T,
  source: FeedSourceFilter
): T {
  if (source === "all") return query;
  // Older rows may have null source (pre–OpenAlex column); treat as PubMed.
  if (source === "pubmed") {
    return query.or("source.eq.pubmed,source.is.null", {
      foreignTable: "articles",
    }) as T;
  }
  return query.eq("articles.source", source) as T;
}

/**
 * Fetch every matching summary row for the topic(s), paging past PostgREST
 * max-row limits so the feed can list the full Supabase set.
 */
async function fetchAllSummariesForTopics(options: {
  supabase: ReturnType<typeof getSupabaseServerClient>;
  topicIds: string[];
  source: FeedSourceFilter;
  selectColumns: string;
  cursorCreatedAt?: string | null;
}): Promise<{ rows: SummaryRow[]; error: { message: string } | null }> {
  const { supabase, topicIds, source, selectColumns, cursorCreatedAt } =
    options;

  const pageQuery = (from: number, exactCount: boolean) => {
    let query = supabase
      .from("summaries")
      .select(selectColumns, exactCount ? { count: "exact" } : undefined)
      .in("topic_id", topicIds)
      .order("created_at", { ascending: false })
      .range(from, from + SUPABASE_FETCH_PAGE - 1);

    query = applySourceFilter(query, source);

    if (cursorCreatedAt?.trim()) {
      query = query.lt("created_at", cursorCreatedAt.trim());
    }

    return query;
  };

  // First page reports the true total so the remainder can be fetched in
  // parallel rather than discovering the end one round-trip at a time.
  const first = await pageQuery(0, true);
  if (first.error) return { rows: [], error: first.error };

  const rows = [...((first.data ?? []) as unknown as SummaryRow[])];
  const total = Math.min(first.count ?? rows.length, SUPABASE_FETCH_SAFETY_MAX);
  if (rows.length < SUPABASE_FETCH_PAGE || rows.length >= total) {
    return { rows, error: null };
  }

  const pending = [];
  for (
    let from = SUPABASE_FETCH_PAGE;
    from < total;
    from += SUPABASE_FETCH_PAGE
  ) {
    pending.push(pageQuery(from, false));
  }

  for (const result of await Promise.all(pending)) {
    if (result.error) return { rows, error: result.error };
    rows.push(...((result.data ?? []) as unknown as SummaryRow[]));
  }

  return { rows, error: null };
}

export async function getFeedItems(
  topicId: string,
  _limit = PAGE_SIZE,
  cursor: string | null = null,
  sort: FeedSort = "ingested",
  filters?: FeedFilterParams,
  page = 1,
  source: FeedSourceFilter = DEFAULT_FEED_SOURCE_FILTER,
  options?: { pageSize?: number }
): Promise<{
  items: FeedItem[];
  nextCursor: string | null;
  query_string: string;
  totalCount: number;
  totalPages: number;
  page: number;
  feedSettings: BriefFeedSettings;
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

  const feedSettings = mergeStoredFeedSettings(
    (topic as { ranking_weights?: Record<string, unknown> | null }).ranking_weights
  );
  const learnedWeights = mergeLearnedWeights(
    (topic as { ranking_weights?: Record<string, unknown> | null }).ranking_weights
  );
  const scoringOptions: ScoringOptions = {
    ...toPenaltyWeights(feedSettings),
    smallSampleMax: feedSettings.brief.smallSampleMax,
    largeStudyThreshold: feedSettings.brief.largeStudyThreshold,
  };

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
    "pmid, summary_text, created_at, subheading, label, admin_priority, admin_setting, articles!inner(title, abstract, journal, pub_date, release_date, fetched_at, publication_types, keywords, mesh_terms, source)";

  let { rows: rawItems, error } = await fetchAllSummariesForTopics({
    supabase,
    topicIds: topicIdsToFetch,
    source,
    selectColumns,
    cursorCreatedAt: cursor?.trim() && sort === "ingested" ? cursor : null,
  });

  if (error?.message?.toLowerCase().includes("admin_setting")) {
    const fallback = await fetchAllSummariesForTopics({
      supabase,
      topicIds: topicIdsToFetch,
      source,
      selectColumns:
        "pmid, summary_text, created_at, subheading, label, admin_priority, articles!inner(title, abstract, journal, pub_date, release_date, fetched_at, publication_types, keywords, mesh_terms, source)",
      cursorCreatedAt: cursor?.trim() && sort === "ingested" ? cursor : null,
    });
    rawItems = fallback.rows;
    error = fallback.error;
  }

  if (error) throw new Error(error.message);

  let items = rawItems;

  // Dedupe by pmid (keep most recent) when main feed merged two topics
  if (isMainFeed && items.length > 0) {
    const seen = new Set<string>();
    items = items.filter((it) => {
      const pmid = String((it as { pmid?: string }).pmid ?? "").trim();
      if (!pmid || seen.has(pmid)) return false;
      seen.add(pmid);
      return true;
    });
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
      admin_setting?: string | null;
      articles?: {
        title?: string | null;
        abstract?: string | null;
        journal?: string | null;
        pub_date?: string | null;
        release_date?: string | null;
        fetched_at?: string | null;
        publication_types?: string[] | null;
        keywords?: string[] | null;
        mesh_terms?: string[] | null;
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
            mesh_terms: row.articles.mesh_terms ?? null,
            source: row.articles.source ?? null,
          }
        : null;
    const scimago = lookupScimago(row.articles?.journal);
    return {
      pmid: row.pmid,
      summary_text: row.summary_text,
      created_at: row.created_at,
      subheading: row.subheading ?? null,
      label: row.label ?? null,
      rank_score: row.rank_score ?? null,
      admin_priority: row.admin_priority ?? null,
      admin_setting: parseAdminSetting(row.admin_setting),
      is_q1: Boolean(scimago) || isQ1Journal(row.articles?.journal),
      sjr_scimago: scimago?.sjr ?? null,
      jif_2024,
      source: articleSource,
      articles,
    };
  });

  if (filters?.setting || filters?.keyword?.trim()) {
    itemsWithJif = applyFiltersToFeedItems(itemsWithJif, filters);
  }

  const releaseOrPub = (item: FeedItem): string => {
    const today = new Date().toISOString().slice(0, 10);
    const release = item.articles?.release_date?.trim();
    const pub = item.articles?.pub_date?.trim();
    const raw = release ?? pub ?? "";
    if (!raw) return "";
    return raw > today ? today : raw;
  };
  const ingestTime = (item: FeedItem): string => {
    const fetched = item.articles?.fetched_at?.trim() ?? "";
    const created = item.created_at?.trim() ?? "";
    return fetched || created || "";
  };

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
        const jifIsHigh =
          item.is_q1 || isHighImpactJournal(item.articles?.journal);
        const breakdown = computeBreakdown(
          query_string,
          rec,
          learnedWeights,
          true,
          jifIsHigh,
          scoringOptions
        );
        const rank_score =
          breakdown.finalScore + priorityScoreBoost(item.admin_priority);
        return { ...item, rank_score };
      })
      .sort((a, b) => (b.rank_score ?? 0) - (a.rank_score ?? 0));
  } else if (sort === "published") {
    itemsWithJif = itemsWithJif.sort((a, b) => {
      const da = releaseOrPub(a);
      const db = releaseOrPub(b);
      if (da !== db) {
        if (!da) return 1;
        if (!db) return -1;
        return db.localeCompare(da);
      }
      return ingestTime(b).localeCompare(ingestTime(a));
    });
  } else {
    // ingested (default): newest intake first
    itemsWithJif = itemsWithJif.sort((a, b) => {
      const ia = ingestTime(a);
      const ib = ingestTime(b);
      if (ia !== ib) {
        if (!ia) return 1;
        if (!ib) return -1;
        return ib.localeCompare(ia);
      }
      const da = releaseOrPub(a);
      const db = releaseOrPub(b);
      if (da !== db) {
        if (!da) return 1;
        if (!db) return -1;
        return db.localeCompare(da);
      }
      return a.pmid.localeCompare(b.pmid);
    });
  }

  if (filters?.unratedOnly) {
    itemsWithJif = itemsWithJif.filter((item) => item.admin_priority == null);
  }

  const minPriority = filters?.minPriority;
  if (minPriority != null && minPriority > 0) {
    const priorityModel = await loadPriorityModel(supabase, topicId);
    itemsWithJif = itemsWithJif.filter((item) => {
      if (item.admin_priority != null) {
        return effectivePriority(item.admin_priority, item.admin_priority) >= minPriority;
      }
      const rec: PubMedRecord = {
        pmid: item.pmid,
        title: item.articles?.title ?? null,
        abstract: item.articles?.abstract ?? null,
        journal: item.articles?.journal ?? null,
        pubDate: item.articles?.pub_date ?? null,
        publicationTypes: item.articles?.publication_types ?? [],
        meshTerms: [],
        keywords: item.articles?.keywords ?? [],
        authors: [],
      };
      const predicted = predictArticlePriority({
        rec,
        queryString: query_string,
        weights: learnedWeights,
        model: priorityModel,
      });
      return effectivePriority(null, predicted.priority) >= minPriority;
    });
  }

  const totalCount = itemsWithJif.length;
  const pageSize = Math.min(
    SUPABASE_FETCH_SAFETY_MAX,
    Math.max(1, options?.pageSize ?? PAGE_SIZE)
  );
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const pageNum = Math.max(1, Math.min(page, totalPages));
  const start = (pageNum - 1) * pageSize;
  const paginatedItems = itemsWithJif.slice(start, start + pageSize);

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
    feedSettings,
  };
}

export type TrendingKeyword = { keyword: string; count: number };

/**
 * Top 10 keywords from summaries for this topic in the last 30 days.
 */
export async function getTrendingKeywords(
  topicId: string,
  source: FeedSourceFilter = DEFAULT_FEED_SOURCE_FILTER
): Promise<TrendingKeyword[]> {
  const supabase = getSupabaseServerClient();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const since = thirtyDaysAgo.toISOString();

  // Trending is a 30-day window only (sidebar); main feed has no date gate.
  const rows: SummaryRow[] = [];
  let from = 0;
  for (;;) {
    let trendingQuery = supabase
      .from("summaries")
      .select("articles!inner(keywords, source)")
      .eq("topic_id", topicId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .range(from, from + SUPABASE_FETCH_PAGE - 1);
    trendingQuery = applySourceFilter(trendingQuery, source);
    const { data, error } = await trendingQuery;
    if (error) return [];
    const batch = (data ?? []) as unknown as SummaryRow[];
    rows.push(...batch);
    if (batch.length < SUPABASE_FETCH_PAGE) break;
    from += SUPABASE_FETCH_PAGE;
    if (from >= SUPABASE_FETCH_SAFETY_MAX) break;
  }

  const countByKeyword = new Map<string, number>();
  for (const row of rows) {
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
