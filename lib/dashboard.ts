import "server-only";
import { unstable_cache } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import {
  getDefaultTopicId,
  getFeedItemsInArticleDateRange,
  type FeedItem,
} from "@/lib/feed";
import {
  parseFeedSource,
  type FeedSourceFilter,
} from "@/lib/feedSource";
import {
  canonicalKeywordForGrouping,
  getItemSettings,
  isTrendingBlocklisted,
  keywordDisplayForm,
  normalizeScoreTo100,
} from "@/lib/filters";
import {
  ARTICLE_SETTING_LABELS,
  ARTICLE_SETTING_ORDER,
  type ArticleSetting,
} from "@/lib/classifySetting";
import { computeBreakdown, type ScoringOptions } from "@/lib/ranking";
import {
  mergeFeedSettings,
  toPenaltyWeights,
  toRankingWeights,
} from "@/lib/brief/feedSettings";
import {
  loadPriorityModel,
  predictArticlePriority,
} from "@/lib/brief/priorityModel";
import { effectivePriority } from "@/lib/brief/priority";
import {
  extractPriorityFeatures,
  PRIORITY_BINARY_FEATURES,
  PRIORITY_FEATURE_NAMES,
  priorityFeatureLabel,
} from "@/lib/brief/priorityFeatures";
import { getRankedTopPriorityItems, getTopPriorityYearItems } from "@/lib/brief/topPriority";
import { briefSettingsLabel } from "@/lib/brief/settingFilter";
import {
  loadLastIngestStats,
  nextIngestAt,
  type IngestRunStats,
} from "@/lib/ingestStats";
import { isHighImpactJournal } from "@/lib/jif";
import { isQ1Journal } from "@/lib/scimago";
import type { PubMedRecord } from "@/lib/pubmed/efetch";
import { FEED_SLIM_INDEX_CACHE_TAG } from "@/lib/feedCache";

export type { IngestRunStats };
export { nextIngestAt };

export const SETTING_LABELS: Record<ArticleSetting, string> =
  ARTICLE_SETTING_LABELS;

export type DashboardDateRange = {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
};

export type RatingBucket = {
  rating: number;
  /** Human admin_priority count at this score. */
  human: number;
  /** ML-predicted priority count at this score (all articles in range). */
  ml: number;
};

export type SettingBucket = {
  setting: ArticleSetting | "unclassified";
  label: string;
  count: number;
};

export type KeywordBucket = { keyword: string; count: number };

export type DashboardTopItem = {
  pmid: string;
  title: string;
  url: string;
  adminPriority: number | null;
  effectivePriority: number;
  relevancePercent: number;
  date: string;
  setting: string;
};

export type ModelFeatureStat = {
  name: string;
  label: string;
  /** Articles where the feature is present / > 0. */
  count: number;
  /** Mean raw feature value across the date range. */
  average: number;
  /** Learned ridge weight when a model is loaded; null if using fallback. */
  weight: number | null;
  /** Kind of feature for display formatting. */
  kind: "binary" | "continuous";
};

export type SchemaField = { name: string; type: string; notes?: string };
export type SchemaTable = {
  table: string;
  description: string;
  fields: SchemaField[];
};

export type DashboardData = {
  range: DashboardDateRange;
  source: FeedSourceFilter;
  /** Articles whose release/pub date falls in the selected range. */
  totalInDatabase: number;
  /** Feed PMIDs whose article date falls in the selected range. */
  totalOnFeed: number;
  /** Same as totalOnFeed (kept for callers / charts). */
  inRangeCount: number;
  humanRatedCount: number;
  mlPredictedCount: number;
  ratingHistogram: RatingBucket[];
  settingBreakdown: SettingBucket[];
  topKeywords: KeywordBucket[];
  topMeshTerms: KeywordBucket[];
  topTen: DashboardTopItem[];
  modelFeatures: ModelFeatureStat[];
  modelSampleCount: number | null;
  schema: SchemaTable[];
  ingest: IngestRunStats;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Default window: last 28 days through today (matches Brief article window). */
export function defaultDashboardRange(): DashboardDateRange {
  return { from: daysAgoIso(28), to: todayIso() };
}

export function parseDashboardRange(
  fromRaw: string | null | undefined,
  toRaw: string | null | undefined
): DashboardDateRange {
  const fallback = defaultDashboardRange();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(fromRaw?.trim() ?? "")
    ? fromRaw!.trim()
    : fallback.from;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(toRaw?.trim() ?? "")
    ? toRaw!.trim()
    : fallback.to;
  return from <= to ? { from, to } : { from: to, to: from };
}

function articleDateIso(item: FeedItem): string | null {
  const raw =
    item.articles?.release_date?.trim() ||
    item.articles?.pub_date?.trim() ||
    null;
  if (!raw) return null;
  return raw.slice(0, 10);
}

function articleInDateRange(item: FeedItem, range: DashboardDateRange): boolean {
  const d = articleDateIso(item);
  if (!d) return false;
  return d >= range.from && d <= range.to;
}

function toRec(item: FeedItem): PubMedRecord {
  return {
    pmid: item.pmid,
    title: item.articles?.title ?? null,
    abstract: item.articles?.abstract ?? null,
    journal: item.articles?.journal ?? null,
    pubDate: item.articles?.pub_date ?? null,
    publicationTypes: item.articles?.publication_types ?? [],
    meshTerms: item.articles?.mesh_terms ?? [],
    keywords: item.articles?.keywords ?? [],
    authors: [],
  };
}

/** Static field inventory of tables the app uses in Supabase. */
export const SUPABASE_SCHEMA_SUMMARY: SchemaTable[] = [
  {
    table: "articles",
    description: "Canonical publication records (PubMed / OpenAlex).",
    fields: [
      { name: "pmid", type: "text PK", notes: "PubMed ID or OpenAlex work ID" },
      { name: "title", type: "text" },
      { name: "abstract", type: "text" },
      { name: "journal", type: "text" },
      { name: "pub_date", type: "date" },
      { name: "release_date", type: "date", notes: "Preferred article date when present" },
      { name: "fetched_at", type: "timestamptz" },
      { name: "publication_types", type: "text[]" },
      { name: "keywords", type: "text[]" },
      { name: "mesh_terms", type: "text[]" },
      { name: "authors", type: "text[]" },
      { name: "source", type: "text", notes: "pubmed | openalex" },
    ],
  },
  {
    table: "summaries",
    description: "Per-topic AI summaries and editorial ratings.",
    fields: [
      { name: "id", type: "uuid PK" },
      { name: "topic_id", type: "uuid FK → topics" },
      { name: "pmid", type: "text FK → articles" },
      { name: "summary_text", type: "text" },
      { name: "prompt_version", type: "int" },
      { name: "created_at", type: "timestamptz" },
      { name: "subheading", type: "text" },
      { name: "label", type: "text" },
      { name: "rank_score", type: "numeric" },
      { name: "headline", type: "text" },
      { name: "admin_priority", type: "int 1–10" },
      {
        name: "ml_priority",
        type: "smallint 1–10",
        notes: "First ML rating at ingest (embeddings); admin_priority wins when set",
      },
      { name: "admin_setting", type: "text", notes: "hospital | community | long-term care | animal | environment" },
      {
        name: "auto_settings",
        type: "text[]",
        notes: "Ingest multi-label settings; admin_setting wins when set",
      },
    ],
  },
  {
    table: "topics",
    description: "Search topics and stored ranking / priority models.",
    fields: [
      { name: "id", type: "uuid PK" },
      { name: "name", type: "text" },
      { name: "query_string", type: "text" },
      { name: "openalex_query_string", type: "text" },
      { name: "is_active", type: "boolean" },
      { name: "ranking_weights", type: "jsonb" },
      { name: "priority_model", type: "jsonb" },
      { name: "created_at", type: "timestamptz" },
    ],
  },
  {
    table: "relevance_feedback",
    description: "History of human priority ratings used to train the model.",
    fields: [
      { name: "topic_id", type: "uuid" },
      { name: "pmid", type: "text" },
      { name: "admin_priority", type: "int" },
      { name: "feature_snapshot", type: "jsonb" },
      { name: "created_at", type: "timestamptz" },
    ],
  },
  {
    table: "journal_metrics",
    description: "Journal impact factors for ranking boosts.",
    fields: [
      { name: "journal_name", type: "text PK" },
      { name: "jif_2024", type: "numeric" },
      { name: "jcr_rank", type: "int" },
      { name: "jif_quartile", type: "text" },
    ],
  },
  {
    table: "app_settings",
    description: "Key/value app configuration (e.g. summary prompts).",
    fields: [
      { name: "key", type: "text PK" },
      { name: "value", type: "text" },
      { name: "updated_at", type: "timestamptz" },
    ],
  },
  {
    table: "brief_subscribers",
    description: "Email subscribers for The Stewardship Brief.",
    fields: [
      { name: "id", type: "uuid PK" },
      { name: "email", type: "text" },
      { name: "created_at", type: "timestamptz" },
    ],
  },
  {
    table: "pubmed_ingest_state / openalex_ingest_state",
    description: "Cursor / watermark state for ingest jobs.",
    fields: [
      { name: "topic_id", type: "uuid" },
      { name: "last_* / cursor fields", type: "various" },
    ],
  },
];

export async function getDashboardData(options?: {
  from?: string | null;
  to?: string | null;
  source?: string | null;
}): Promise<DashboardData> {
  const range = parseDashboardRange(options?.from, options?.to);
  const source = parseFeedSource(options?.source ?? undefined);
  return loadCachedDashboardData(range.from, range.to, source);
}

const loadCachedDashboardData = unstable_cache(
  async (
    from: string,
    to: string,
    source: FeedSourceFilter
  ): Promise<DashboardData> => getDashboardDataUncached({ from, to, source }),
  ["dashboard-data-v1"],
  { revalidate: 60 * 60 * 3, tags: [FEED_SLIM_INDEX_CACHE_TAG] }
);

async function getDashboardDataUncached(options: {
  from: string;
  to: string;
  source: FeedSourceFilter;
}): Promise<DashboardData> {
  const range = { from: options.from, to: options.to };
  const source = options.source;

  const topicId = await getDefaultTopicId();
  if (!topicId) throw new Error("Default topic not found");

  const supabase = getSupabaseServerClient();

  const [articlesInRangeRes, feed] = await Promise.all([
    supabase
      .from("articles")
      .select("pmid", { count: "exact", head: true })
      .or(
        `and(release_date.gte.${range.from},release_date.lte.${range.to}),and(pub_date.gte.${range.from},pub_date.lte.${range.to})`
      ),
    // Date-scoped slim fetch (cap) — do not walk the full corpus for charts.
    getFeedItemsInArticleDateRange(topicId, range, source, { maxRows: 1500 }),
  ]);

  // Exact coalesce(release, pub) filter; SQL OR may over-include.
  const inRange = feed.items.filter((item) =>
    articleInDateRange(item, range)
  );

  const totalInDatabase = articlesInRangeRes.count ?? 0;
  const totalOnFeed = inRange.length;

  // Setting breakdown (multi-label: one article can increment several buckets)
  const settingCounts = new Map<ArticleSetting | "unclassified", number>();
  const settingOrder: Array<ArticleSetting | "unclassified"> = [
    ...ARTICLE_SETTING_ORDER,
    "unclassified",
  ];
  for (const s of settingOrder) settingCounts.set(s, 0);
  for (const item of inRange) {
    const labels = getItemSettings(item);
    if (labels.length === 0) {
      settingCounts.set(
        "unclassified",
        (settingCounts.get("unclassified") ?? 0) + 1
      );
      continue;
    }
    for (const s of labels) {
      settingCounts.set(s, (settingCounts.get(s) ?? 0) + 1);
    }
  }
  const settingBreakdown: SettingBucket[] = settingOrder.map((s) => ({
    setting: s,
    label: s === "unclassified" ? "Unclassified" : SETTING_LABELS[s],
    count: settingCounts.get(s) ?? 0,
  }));

  // Top keywords (sorted highest → lowest; rendered as a single column)
  const kwCounts = new Map<string, number>();
  for (const item of inRange) {
    for (const raw of item.articles?.keywords ?? []) {
      const canonical = canonicalKeywordForGrouping(String(raw));
      if (!canonical || isTrendingBlocklisted(canonical)) continue;
      kwCounts.set(canonical, (kwCounts.get(canonical) ?? 0) + 1);
    }
  }
  const topKeywords: KeywordBucket[] = [...kwCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 25)
    .map(([keyword, count]) => ({
      keyword: keywordDisplayForm(keyword),
      count,
    }));

  // Top MeSH terms (same ranking; no blocklist — MeSH is curated)
  const meshCounts = new Map<string, number>();
  for (const item of inRange) {
    for (const raw of item.articles?.mesh_terms ?? []) {
      const term = String(raw ?? "").trim().toLowerCase();
      if (!term) continue;
      meshCounts.set(term, (meshCounts.get(term) ?? 0) + 1);
    }
  }
  const topMeshTerms: KeywordBucket[] = [...meshCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 25)
    .map(([term, count]) => ({
      keyword: term.charAt(0).toUpperCase() + term.slice(1),
      count,
    }));

  const { data: topicRow } = await supabase
    .from("topics")
    .select("ranking_weights")
    .eq("id", topicId)
    .maybeSingle();
  const feedSettings = mergeFeedSettings(
    (topicRow as { ranking_weights?: Record<string, unknown> | null } | null)
      ?.ranking_weights
  );
  const weights = toRankingWeights(feedSettings);
  const scoringOptions: ScoringOptions = {
    ...toPenaltyWeights(feedSettings),
    smallSampleMax: feedSettings.brief.smallSampleMax,
    largeStudyThreshold: feedSettings.brief.largeStudyThreshold,
  };
  const priorityModel = await loadPriorityModel(supabase, topicId);

  const ingest = await loadLastIngestStats(supabase, topicId);
  const humanHist = Array.from({ length: 10 }, () => 0);
  const mlHist = Array.from({ length: 10 }, () => 0);
  let humanRatedCount = 0;
  let mlPredictedCount = 0;
  const featureSums = Array.from(
    { length: PRIORITY_FEATURE_NAMES.length },
    () => 0
  );
  const featurePresent = Array.from(
    { length: PRIORITY_FEATURE_NAMES.length },
    () => 0
  );

  // No embedding cache reads here — each cached vector is tens of KB of JSON
  // egress. Dashboard histograms use handcrafted features only.
  const ranked = inRange.map((item) => {
    const rec = toRec(item);
    const jifIsHigh =
      item.is_q1 ||
      isQ1Journal(item.articles?.journal) ||
      isHighImpactJournal(item.articles?.journal);
    const breakdown = computeBreakdown(
      feed.query_string,
      rec,
      weights,
      true,
      jifIsHigh,
      scoringOptions
    );
    const features = extractPriorityFeatures(rec, breakdown);
    for (let i = 0; i < features.length; i++) {
      const v = features[i] ?? 0;
      featureSums[i] += v;
      if (v > 0) featurePresent[i] += 1;
    }

    const predicted = predictArticlePriority({
      rec,
      queryString: feed.query_string,
      weights,
      model: priorityModel,
      embedding: null,
    });
    const eff = effectivePriority(item.admin_priority, predicted.priority);

    if (
      item.admin_priority != null &&
      item.admin_priority >= 1 &&
      item.admin_priority <= 10
    ) {
      humanHist[item.admin_priority - 1] += 1;
      humanRatedCount += 1;
    } else {
      mlPredictedCount += 1;
    }
    // ML distribution includes every article (human-rated and ML-only).
    // Round to nearest 1–10; empty buckets are possible when the model rarely
    // lands near that integer (e.g. few scores ≈ 1.5–2.5).
    const mlBucket = Math.min(10, Math.max(1, Math.round(predicted.priority)));
    mlHist[mlBucket - 1] += 1;

    return {
      item,
      adminPriority: item.admin_priority,
      effectivePriority: eff,
      humanRated: item.admin_priority != null,
      relevancePercent: normalizeScoreTo100(breakdown.finalScore),
    };
  });

  const ratingHistogram: RatingBucket[] = Array.from({ length: 10 }, (_, i) => ({
    rating: i + 1,
    human: humanHist[i],
    ml: mlHist[i],
  }));

  const n = Math.max(1, inRange.length);
  const modelFeatures: ModelFeatureStat[] = PRIORITY_FEATURE_NAMES.map(
    (name, i) => ({
      name,
      label: priorityFeatureLabel(name),
      count: featurePresent[i],
      average: featureSums[i] / n,
      weight: priorityModel?.weights[i] ?? null,
      kind: PRIORITY_BINARY_FEATURES.has(name) ? "binary" : "continuous",
    })
  );

  // Prefer the cached homepage Top 10 (15 min) when it already covers the
  // dashboard date range — avoids a second 365-day slim walk per /dashboard load.
  const yearTop = await getTopPriorityYearItems("");
  let topPriority = yearTop.filter((item) => {
    const d = item.date?.slice(0, 10) ?? "";
    return d >= range.from && d <= range.to;
  });
  if (topPriority.length < 10) {
    const fromMs = Date.parse(`${range.from}T12:00:00Z`);
    const todayMs = Date.parse(`${todayIso()}T12:00:00Z`);
    const windowDays = Number.isFinite(fromMs)
      ? Math.min(
          365,
          Math.max(1, Math.ceil((todayMs - fromMs) / (24 * 60 * 60 * 1000)) + 1)
        )
      : 28;
    topPriority = await getRankedTopPriorityItems({
      articleDateWithinDays: windowDays,
      from: range.from,
      to: range.to,
      limit: 10,
    });
  }
  const topTen: DashboardTopItem[] = topPriority.map((item) => ({
    pmid: item.pmid,
    title: item.title?.trim() || item.headline || "Untitled",
    url: item.pubmedUrl,
    adminPriority: item.adminPriority,
    effectivePriority: item.effectivePriority,
    relevancePercent: item.relevancePercent,
    date: item.date?.slice(0, 10) ?? "",
    setting:
      briefSettingsLabel(item.settings, item.setting) ?? "Unclassified",
  }));

  return {
    range,
    source,
    totalInDatabase,
    totalOnFeed,
    inRangeCount: inRange.length,
    humanRatedCount,
    mlPredictedCount,
    ratingHistogram,
    settingBreakdown,
    topKeywords,
    topMeshTerms,
    topTen,
    modelFeatures,
    modelSampleCount: priorityModel?.sampleCount ?? null,
    schema: SUPABASE_SCHEMA_SUMMARY,
    ingest,
  };
}
