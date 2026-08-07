import "server-only";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import {
  getDefaultTopicId,
  getFeedItems,
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
import { getRankedTopPriorityItems } from "@/lib/brief/topPriority";
import { briefSettingsLabel } from "@/lib/brief/settingFilter";
import { isHighImpactJournal } from "@/lib/jif";
import { isQ1Journal } from "@/lib/scimago";
import type { PubMedRecord } from "@/lib/pubmed/efetch";

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

export type IngestRunStats = {
  /** When the last PubMed ingest batch finished (ISO). */
  lastAt: string | null;
  /** Articles upserted in that batch (same fetched_at stamp). */
  ingestedCount: number;
  /** Distinct PMIDs newly summarized for this topic during that ingest window. */
  summarizedCount: number;
  /** Next scheduled ingest cron (ISO), fixed Eastern (EDT)→UTC slots. */
  nextAt: string;
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

/**
 * PubMed ingest cron hours in UTC (Eastern Daylight: UTC−4):
 * 06:00 / 12:00 / 17:00 Eastern → 10:00 / 16:00 / 21:00 UTC.
 * Display always formats last/next times in America/New_York.
 */
const INGEST_CRON_UTC_HOURS = [10, 16, 21] as const;

/** Next scheduled ingest instant after `now`. */
export function nextIngestAt(now = new Date()): Date {
  const candidates: Date[] = [];
  for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
    for (const hour of INGEST_CRON_UTC_HOURS) {
      const d = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() + dayOffset,
          hour,
          0,
          0,
          0
        )
      );
      if (d.getTime() > now.getTime()) candidates.push(d);
    }
  }
  candidates.sort((a, b) => a.getTime() - b.getTime());
  return candidates[0] ?? new Date(now.getTime() + 60 * 60 * 1000);
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

/** Fill abstracts for in-range scoring / setting classification (page-sized batches). */
async function hydrateAbstractsForItems(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  items: FeedItem[]
): Promise<FeedItem[]> {
  const need = items.filter((i) => !i.articles?.abstract?.trim());
  if (need.length === 0) return items;
  const byPmid = new Map<string, string>();
  const chunkSize = 80;
  for (let i = 0; i < need.length; i += chunkSize) {
    const chunk = need.slice(i, i + chunkSize).map((x) => x.pmid);
    const { data } = await supabase
      .from("articles")
      .select("pmid, abstract")
      .in("pmid", chunk);
    for (const row of data ?? []) {
      const pmid = String((row as { pmid?: string }).pmid ?? "").trim();
      const abs = (row as { abstract?: string | null }).abstract;
      if (pmid && abs?.trim()) byPmid.set(pmid, abs);
    }
  }
  if (byPmid.size === 0) return items;
  return items.map((item) => {
    const abs = byPmid.get(item.pmid);
    if (!abs || !item.articles) return item;
    return {
      ...item,
      articles: { ...item.articles, abstract: abs },
    };
  });
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

/**
 * Stats for the most recent PubMed ingest batch.
 * A batch shares one `fetched_at` stamp (set once per ingest call).
 */
async function loadLastIngestStats(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  topicId: string
): Promise<IngestRunStats> {
  const nextAt = nextIngestAt().toISOString();

  const { data: newest } = await supabase
    .from("articles")
    .select("fetched_at")
    .eq("source", "pubmed")
    .not("fetched_at", "is", null)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const batchFetchedAt =
    typeof newest?.fetched_at === "string" ? newest.fetched_at : null;

  const { data: stateRow } = await supabase
    .from("pubmed_ingest_state")
    .select("updated_at")
    .eq("topic_id", topicId)
    .maybeSingle();

  const stateUpdated =
    typeof (stateRow as { updated_at?: string } | null)?.updated_at === "string"
      ? (stateRow as { updated_at: string }).updated_at
      : null;

  const lastAt = batchFetchedAt ?? stateUpdated;

  if (!batchFetchedAt) {
    return {
      lastAt,
      ingestedCount: 0,
      summarizedCount: 0,
      nextAt,
    };
  }

  const { data: batchRows, count: ingestedCount } = await supabase
    .from("articles")
    .select("pmid", { count: "exact" })
    .eq("source", "pubmed")
    .eq("fetched_at", batchFetchedAt)
    .limit(500);

  const batch = batchRows ?? [];
  const pmids = [
    ...new Set(batch.map((r) => String((r as { pmid?: string }).pmid ?? "")).filter(Boolean)),
  ];

  let summarizedCount = 0;
  if (pmids.length > 0) {
    // Summaries created in the same ingest window for these PMIDs (distinct).
    const windowEnd = new Date(
      new Date(batchFetchedAt).getTime() + 45 * 60 * 1000
    ).toISOString();
    const { data: sumRows } = await supabase
      .from("summaries")
      .select("pmid")
      .eq("topic_id", topicId)
      .in("pmid", pmids)
      .gte("created_at", batchFetchedAt)
      .lte("created_at", windowEnd);
    summarizedCount = new Set(
      (sumRows ?? []).map((r) => String((r as { pmid?: string }).pmid ?? "")).filter(Boolean)
    ).size;
  }

  return {
    lastAt,
    ingestedCount: ingestedCount ?? pmids.length,
    summarizedCount,
    nextAt,
  };
}

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

  const [articlesInRangeRes, feed] = await Promise.all([
    supabase
      .from("articles")
      .select("pmid", { count: "exact", head: true })
      .or(
        `and(release_date.gte.${range.from},release_date.lte.${range.to}),and(pub_date.gte.${range.from},pub_date.lte.${range.to})`
      ),
    getFeedItems(
      topicId,
      20_000,
      null,
      "published",
      undefined,
      1,
      source,
      // Slim: no abstract / summary_text — hydrate abstracts for in-range only below.
      { pageSize: 20_000, slim: true }
    ),
  ]);

  const allFeed = feed.items;
  let inRange = allFeed.filter((item) => articleInDateRange(item, range));
  // Abstracts needed for accurate ML + setting classification in the date window.
  inRange = await hydrateAbstractsForItems(supabase, inRange);

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

  // Same rules as the homepage Top 10: brief-eligible (priority ≥ 5), PubMed,
  // rank by priority → human → relevance → JIF/SJR — then clipped to the
  // dashboard date range.
  const fromMs = Date.parse(`${range.from}T12:00:00Z`);
  const todayMs = Date.parse(`${todayIso()}T12:00:00Z`);
  const windowDays = Number.isFinite(fromMs)
    ? Math.min(
        365,
        Math.max(1, Math.ceil((todayMs - fromMs) / (24 * 60 * 60 * 1000)) + 1)
      )
    : 28;
  const topPriority = await getRankedTopPriorityItems({
    articleDateWithinDays: windowDays,
    from: range.from,
    to: range.to,
    limit: 10,
  });
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
