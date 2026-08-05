import "server-only";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import {
  getDefaultTopicId,
  getFeedItems,
  type FeedItem,
} from "@/lib/feed";
import {
  articleExternalUrl,
  parseFeedSource,
  type FeedSourceFilter,
} from "@/lib/feedSource";
import {
  canonicalKeywordForGrouping,
  getItemSetting,
  isTrendingBlocklisted,
  keywordDisplayForm,
  normalizeScoreTo100,
} from "@/lib/filters";
import type { ArticleSetting } from "@/lib/classifySetting";
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
  PRIORITY_FEATURE_NAMES,
} from "@/lib/brief/priorityFeatures";
import { isHighImpactJournal } from "@/lib/jif";
import { isQ1Journal } from "@/lib/scimago";
import type { PubMedRecord } from "@/lib/pubmed/efetch";

export const SETTING_LABELS: Record<ArticleSetting, string> = {
  hospital: "Hospital",
  community: "Community",
  "long-term care": "Long-term care",
  animal: "Animal / Veterinary",
  environment: "Environment",
};

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
  /** Unique articles in the articles table. */
  totalInDatabase: number;
  /** Unique PMIDs on the feed topics (no date gate). */
  totalOnFeed: number;
  /** Feed PMIDs whose article date falls in the selected range. */
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
};

const FEATURE_LABELS: Record<string, string> = {
  stewardshipTitle: "Title term match",
  clinicalBonusNorm: "Clinical rubric total",
  isQ1: "Q1 journal",
  isRct: "RCT",
  isSystematicReview: "Systematic review",
  largeStudy: "Large study",
  jifNorm: "Impact factor",
  keywordCountNorm: "Keyword count",
};

const BINARY_FEATURES = new Set([
  "isQ1",
  "isRct",
  "isSystematicReview",
  "largeStudy",
]);

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthsAgoIso(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

/** Default window: last 12 months through today. */
export function defaultDashboardRange(): DashboardDateRange {
  return { from: monthsAgoIso(12), to: todayIso() };
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
    meshTerms: [],
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
      { name: "admin_setting", type: "text", notes: "hospital | community | long-term care | animal | environment" },
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

  const topicId = await getDefaultTopicId();
  if (!topicId) throw new Error("Default topic not found");

  const supabase = getSupabaseServerClient();

  const [articlesCountRes, feed] = await Promise.all([
    supabase.from("articles").select("pmid", { count: "exact", head: true }),
    getFeedItems(
      topicId,
      20_000,
      null,
      "published",
      undefined,
      1,
      source,
      { pageSize: 20_000 }
    ),
  ]);

  const totalInDatabase = articlesCountRes.count ?? 0;
  const allFeed = feed.items;
  const totalOnFeed = allFeed.length;
  const inRange = allFeed.filter((item) => articleInDateRange(item, range));

  // Setting breakdown
  const settingCounts = new Map<ArticleSetting | "unclassified", number>();
  const settingOrder: Array<ArticleSetting | "unclassified"> = [
    "hospital",
    "community",
    "long-term care",
    "animal",
    "environment",
    "unclassified",
  ];
  for (const s of settingOrder) settingCounts.set(s, 0);
  for (const item of inRange) {
    const s = getItemSetting(item) ?? "unclassified";
    settingCounts.set(s, (settingCounts.get(s) ?? 0) + 1);
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
    const mlBucket = Math.min(10, Math.max(1, predicted.priority));
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
      label: FEATURE_LABELS[name] ?? name,
      count: featurePresent[i],
      average: featureSums[i] / n,
      weight: priorityModel?.weights[i] ?? null,
      kind: BINARY_FEATURES.has(name) ? "binary" : "continuous",
    })
  );

  ranked.sort((a, b) => {
    if (b.effectivePriority !== a.effectivePriority) {
      return b.effectivePriority - a.effectivePriority;
    }
    const human = Number(b.humanRated) - Number(a.humanRated);
    if (human !== 0) return human;
    return b.relevancePercent - a.relevancePercent;
  });

  const topTen: DashboardTopItem[] = ranked.slice(0, 10).map((r) => {
    const setting = getItemSetting(r.item);
    return {
      pmid: r.item.pmid,
      title: r.item.articles?.title?.trim() || "Untitled",
      url: articleExternalUrl(r.item.pmid, r.item.source),
      adminPriority: r.adminPriority,
      effectivePriority: r.effectivePriority,
      relevancePercent: r.relevancePercent,
      date: articleDateIso(r.item) ?? "",
      setting: setting ? SETTING_LABELS[setting] : "Unclassified",
    };
  });

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
  };
}
