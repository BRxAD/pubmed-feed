import "server-only";
import { getDefaultTopicId, type FeedItem } from "@/lib/feed";
import { computeBreakdown } from "@/lib/ranking";
import { mergeFeedSettings, toRankingWeights, toPenaltyWeights } from "@/lib/brief/feedSettings";
import type { ScoringOptions } from "@/lib/ranking";
import {
  normalizeScoreTo100,
  parseSummaryBullets,
  getItemSetting,
  getItemSettings,
  formatStudyLabel,
} from "@/lib/filters";
import type { ArticleSetting } from "@/lib/classifySetting";
import { isHighImpactJournal, lookupJif } from "@/lib/jif";
import { isQ1Journal, lookupScimago } from "@/lib/scimago";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { articleExternalUrl } from "@/lib/feedSource";
import type { PubMedRecord } from "@/lib/pubmed/efetch";
import {
  BRIEF_ARTICLE_WINDOW_DAYS,
  effectivePriority,
  meetsBriefThreshold,
} from "@/lib/brief/priority";
import {
  loadPriorityModel,
  predictArticlePriority,
  type PriorityPredictionSource,
} from "@/lib/brief/priorityModel";
import { getOrCreateEmbeddings, l2Normalize } from "@/lib/brief/embeddings";
import {
  matchesBriefSettingFilter,
  type BriefSettingFilter,
} from "@/lib/brief/settingFilter";
import {
  ensureBriefHeadlines,
  resolveStoredHeadline,
} from "@/lib/brief/ensureHeadlines";

/** Rolling window for the daily brief (summaries created within this period). */
export const DEFAULT_BRIEF_DAYS_BACK = 7;

/** PostgREST returns at most ~1000 rows per response; fetch in pages of that size. */
const ROW_FETCH_PAGE = 1000;

export type BriefItem = {
  pmid: string;
  source: "pubmed";
  headline: string;
  title: string;
  journal: string | null;
  jif: number | null;
  jifIsHigh: boolean;
  /** SCImago 2025 Q1. */
  isQ1: boolean;
  /** SCImago SJR when Q1. */
  sjrScimago: number | null;
  date: string | null;
  createdAt: string;
  isNew: boolean;
  /** Primary (highest-scoring) setting. */
  setting: ArticleSetting | null;
  /** All settings that cleared the classifier floor (multi-label). */
  settings: ArticleSetting[];
  /**
   * Human admin override (single label). When set, filters and display use
   * only this — automated multi-label settings are ignored.
   */
  adminSetting: ArticleSetting | null;
  studyLabel: string | null;
  methods: string | null;
  results: string | null;
  bottomLine: string | null;
  relevancePercent: number;
  predictedPriority: number;
  adminPriority: number | null;
  effectivePriority: number;
  prioritySource: "admin" | PriorityPredictionSource;
  pubmedUrl: string;
  /** Author names as stored from PubMed (e.g. "Smith JA"). */
  authors: string[];
  keywords: string[];
  /** MeSH terms used for image matching (and optional display later). */
  meshTerms: string[];
  /** First ~1200 chars of abstract for image matching and photo captions. */
  abstractSnippet: string | null;
};

export type BriefFeedResult = {
  topicId: string;
  source: "pubmed";
  query_string: string;
  daysBack: number;
  minPriority: number;
  priorityModelSamples: number;
  items: BriefItem[];
};

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

/** Calendar date (YYYY-MM-DD) for article release/pub filters. */
function dateDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function isWithinHours(iso: string, hours: number): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= hours * 60 * 60 * 1000;
}

function isPubMedArticle(pmid: string, source: string | null | undefined): boolean {
  const id = pmid.trim();
  if (/^W\d+$/i.test(id)) return false;
  if (source === "openalex") return false;
  if (source === "pubmed") return true;
  return /^\d+$/.test(id);
}

/** Prefer article/release date; fall back to summary created_at. */
function articleTimestamp(item: {
  date: string | null;
  createdAt: string;
}): number {
  const raw = item.date ?? item.createdAt;
  if (!raw) return 0;
  const t = new Date(
    raw.includes("T") ? raw : `${String(raw).slice(0, 10)}T12:00:00`
  ).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function parseStoredMlPriority(raw: unknown): number | null {
  if (raw == null || !Number.isFinite(Number(raw))) return null;
  const n = Math.round(Number(raw));
  return n >= 1 && n <= 10 ? n : null;
}

function parseAdminSettingValue(
  raw: string | null | undefined
): ArticleSetting | null {
  const s = raw?.trim();
  if (
    s === "hospital" ||
    s === "community" ||
    s === "long-term care" ||
    s === "animal" ||
    s === "environment"
  ) {
    return s;
  }
  return null;
}

/** Slim Brief index: no abstract / summary_text bodies. */
const BRIEF_SELECT_SLIM =
  "pmid, headline, created_at, subheading, label, admin_priority, admin_setting, ml_priority, rank_score, articles!inner(title, journal, pub_date, release_date, fetched_at, publication_types, keywords, mesh_terms, authors, source)";

const BRIEF_SELECT_SLIM_NO_HEADLINE =
  "pmid, created_at, subheading, label, admin_priority, admin_setting, ml_priority, rank_score, articles!inner(title, journal, pub_date, release_date, fetched_at, publication_types, keywords, mesh_terms, authors, source)";

const HYDRATE_CHUNK = 80;

async function hydrateAbstractsByPmid(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  pmids: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(pmids.filter(Boolean))];
  for (let i = 0; i < unique.length; i += HYDRATE_CHUNK) {
    const chunk = unique.slice(i, i + HYDRATE_CHUNK);
    const { data, error } = await supabase
      .from("articles")
      .select("pmid, abstract")
      .in("pmid", chunk);
    if (error) {
      console.warn("[brief] abstract hydrate failed:", error.message);
      continue;
    }
    for (const row of data ?? []) {
      const pmid = String((row as { pmid?: string }).pmid ?? "").trim();
      const abs = (row as { abstract?: string | null }).abstract?.trim() ?? "";
      if (pmid && abs) map.set(pmid, abs);
    }
  }
  return map;
}

type BodyHydration = {
  summaryText: string;
  abstract: string;
  headline: string | null;
};

/** Load summary_text + abstract for Brief survivors only. */
async function hydrateBriefBodies(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  topicId: string,
  pmids: string[]
): Promise<Map<string, BodyHydration>> {
  const map = new Map<string, BodyHydration>();
  const unique = [...new Set(pmids.filter(Boolean))];
  for (let i = 0; i < unique.length; i += HYDRATE_CHUNK) {
    const chunk = unique.slice(i, i + HYDRATE_CHUNK);
    const { data, error } = await supabase
      .from("summaries")
      .select("pmid, summary_text, headline, articles!inner(abstract)")
      .eq("topic_id", topicId)
      .in("pmid", chunk);
    if (error) {
      console.warn("[brief] body hydrate failed:", error.message);
      continue;
    }
    for (const row of data ?? []) {
      const r = row as {
        pmid?: string;
        summary_text?: string | null;
        headline?: string | null;
        articles?: { abstract?: string | null } | null;
      };
      const pmid = String(r.pmid ?? "").trim();
      const summaryText = r.summary_text?.trim() ?? "";
      if (!pmid || !summaryText) continue;
      map.set(pmid, {
        summaryText,
        abstract: r.articles?.abstract?.trim() ?? "",
        headline: r.headline ?? null,
      });
    }
  }
  return map;
}

export async function getBriefItems(options?: {
  daysBack?: number;
  maxItems?: number;
  setting?: BriefSettingFilter;
  /** Skip OpenAI headline backfill (for side panels / ranking lists). */
  skipHeadlines?: boolean;
  /** Expand lookback until at least this many setting-matched items (or maxLookbackDays). */
  minItems?: number;
  /** Cap for lookback expansion (default 365, max 365). */
  maxLookbackDays?: number;
  /**
   * When true, load/mint embeddings from app_settings for ML PCA features.
   * Default false — web/digest paths use handcrafted features only (egress).
   * Retrain calls getOrCreateEmbeddings directly; do not enable on page loads.
   */
  useEmbeddings?: boolean;
  /**
   * Max uncached OpenAI embeddings to mint when useEmbeddings is true.
   * Default: 100 for short windows; 0 when article/lookback window > 60 days.
   */
  embedMaxFresh?: number;
  /**
   * Keep only items whose article date (release/pub) falls within this many
   * days. Defaults to BRIEF_ARTICLE_WINDOW_DAYS (28). Falls back to created_at
   * when article date is missing. Pass a larger value only for special views.
   */
  articleDateWithinDays?: number;
  /**
   * Ordering applied before the maxItems cut. "recency" (default) follows the
   * brief's leadByRecency setting. "priority" ranks purely by effective
   * priority, so an older-but-higher-rated study is never cut from the pool by
   * a newer, lower-rated one.
   */
  rankBy?: "recency" | "priority";
  /**
   * Override Brief eligibility floor (default from feed settings / BRIEF_MIN_PRIORITY).
   * Top 10 passes 6 so the year pool is narrower than the main Brief (≥5).
   */
  minPriority?: number;
  /**
   * When set, slim SQL only loads rows with stored priority at/above this:
   * admin_priority ≥ n, or (admin null and ml_priority ≥ n). Skips legacy
   * handcrafted-only rows — used for Top 10 egress.
   */
  storedPriorityMin?: number;
}): Promise<BriefFeedResult> {
  const topicId = await getDefaultTopicId();
  if (!topicId) {
    throw new Error("Default topic not found");
  }

  const supabase = getSupabaseServerClient();

  const { data: topic, error: topicError } = await supabase
    .from("topics")
    .select("query_string, ranking_weights")
    .eq("id", topicId)
    .maybeSingle();

  if (topicError || !topic) {
    throw new Error(
      topicError?.message ? `Topic load failed: ${topicError.message}` : "Topic not found"
    );
  }

  const feedSettings = mergeFeedSettings(
    (topic as { ranking_weights?: Record<string, unknown> | null }).ranking_weights
  );
  const learnedWeights = toRankingWeights(feedSettings);
  const penaltyWeights = toPenaltyWeights(feedSettings);
  const scoringOptions: ScoringOptions = {
    ...penaltyWeights,
    smallSampleMax: feedSettings.brief.smallSampleMax,
    largeStudyThreshold: feedSettings.brief.largeStudyThreshold,
  };
  const minPriority = Math.min(
    10,
    Math.max(1, options?.minPriority ?? feedSettings.brief.minPriority)
  );
  const storedPriorityMin =
    options?.storedPriorityMin != null
      ? Math.min(10, Math.max(1, options.storedPriorityMin))
      : null;
  const minItems = Math.max(0, options?.minItems ?? 0);
  const maxLookbackDays = Math.min(
    365,
    Math.max(1, options?.maxLookbackDays ?? 365)
  );

  let daysBack = Math.min(
    maxLookbackDays,
    Math.max(1, options?.daysBack ?? feedSettings.brief.daysBack)
  );
  // Capsule pages: start with a wider window when we need a floor count
  if (minItems > 0) {
    daysBack = Math.max(daysBack, Math.min(maxLookbackDays, 90));
  }
  const maxItems = Math.min(5000, Math.max(1, options?.maxItems ?? 50));
  const since = isoDaysAgo(daysBack);
  const articleWindow =
    options?.articleDateWithinDays ?? BRIEF_ARTICLE_WINDOW_DAYS;
  // Email uses a short daysBack (≤7) to mean "newly summarized only".
  // The main brief / Top 10 must NOT gate on created_at when an article-date
  // window is set — year backfill otherwise crowds recent pubs out of the
  // created_at-ordered result page.
  const gateByCreatedAt = articleWindow <= 0 || daysBack <= 7;

  const query_string = String(topic.query_string ?? "").trim();
  const priorityModel = await loadPriorityModel(supabase, topicId);

  const settingFilter = options?.setting ?? "";

  // Daily intake is typically <100; a year of candidates is a few thousand at most.
  const rowCeiling =
    articleWindow > 60 || daysBack > 60
      ? 3000
      : articleWindow > 0
        ? 1500
        : 1000;

  /**
   * PostgREST caps each response near 1000 rows regardless of .limit(), so page
   * with .range() until the set is exhausted. Without this the pool is only the
   * most recently summarized rows, which hides older high-priority studies.
   */
  const fetchRows = async (
    select: string
  ): Promise<{ rows: unknown[]; error: { message: string } | null }> => {
    const pageQuery = (from: number, exactCount: boolean) => {
      let query = supabase
        .from("summaries")
        .select(select, exactCount ? { count: "exact" } : undefined)
        .eq("topic_id", topicId)
        .eq("articles.source", "pubmed")
        // Existence only — do not select summary_text body on the slim pass.
        .not("summary_text", "is", null)
        .neq("summary_text", "");

      if (storedPriorityMin != null) {
        // Effective stored priority ≥ n: admin wins when set.
        query = query.or(
          `admin_priority.gte.${storedPriorityMin},and(admin_priority.is.null,ml_priority.gte.${storedPriorityMin})`
        );
      }

      if (articleWindow > 0) {
        const articleSince = dateDaysAgo(articleWindow);
        query = query.or(
          `release_date.gte.${articleSince},pub_date.gte.${articleSince}`,
          { foreignTable: "articles" }
        );
      }
      if (gateByCreatedAt) {
        query = query.gte("created_at", since);
      }

      return query
        .order("created_at", { ascending: false })
        .range(from, from + ROW_FETCH_PAGE - 1);
    };

    const first = await pageQuery(0, true);
    if (first.error) return { rows: [], error: first.error };

    const rows = [...((first.data ?? []) as unknown[])];
    const total = Math.min(first.count ?? rows.length, rowCeiling);
    if (rows.length < ROW_FETCH_PAGE || rows.length >= total) {
      return { rows, error: null };
    }

    const pending = [];
    for (let from = ROW_FETCH_PAGE; from < total; from += ROW_FETCH_PAGE) {
      pending.push(pageQuery(from, false));
    }

    for (const result of await Promise.all(pending)) {
      if (result.error) return { rows, error: result.error };
      rows.push(...((result.data ?? []) as unknown[]));
    }

    return { rows, error: null };
  };

  let slimSelect = BRIEF_SELECT_SLIM;
  let slimResult = await fetchRows(slimSelect);
  const errMsg = slimResult.error?.message?.toLowerCase() ?? "";
  if (
    errMsg.includes("headline") ||
    errMsg.includes("mesh_terms") ||
    errMsg.includes("admin_setting") ||
    errMsg.includes("authors") ||
    errMsg.includes("ml_priority") ||
    errMsg.includes("rank_score")
  ) {
    if (errMsg.includes("headline")) slimSelect = BRIEF_SELECT_SLIM_NO_HEADLINE;
    if (errMsg.includes("mesh_terms")) {
      slimSelect = slimSelect.replace(", mesh_terms", "");
    }
    if (errMsg.includes("admin_setting")) {
      slimSelect = slimSelect.replace(", admin_setting", "");
    }
    if (errMsg.includes("authors")) {
      slimSelect = slimSelect.replace(", authors", "");
    }
    if (errMsg.includes("ml_priority")) {
      slimSelect = slimSelect.replace(", ml_priority", "");
    }
    if (errMsg.includes("rank_score")) {
      slimSelect = slimSelect.replace(", rank_score", "");
    }
    slimResult = await fetchRows(slimSelect);
  }

  if (slimResult.error) throw new Error(slimResult.error.message);

  type SlimRow = {
    pmid: string;
    headline?: string | null;
    created_at: string;
    subheading?: string | null;
    label?: string | null;
    admin_priority?: number | null;
    ml_priority?: number | null;
    rank_score?: number | null;
    admin_setting?: string | null;
    articles?: {
      title?: string | null;
      journal?: string | null;
      pub_date?: string | null;
      release_date?: string | null;
      fetched_at?: string | null;
      publication_types?: string[] | null;
      keywords?: string[] | null;
      mesh_terms?: string[] | null;
      authors?: string[] | null;
      source?: string | null;
    } | null;
  };

  const slimRows = (slimResult.rows as SlimRow[]).filter((row) => {
    if (!row.articles?.title?.trim()) return false;
    return isPubMedArticle(row.pmid, row.articles.source);
  });

  // Legacy rows without ml_priority need abstracts for handcrafted predict only.
  const needsScorePmids = slimRows
    .filter(
      (row) =>
        row.admin_priority == null && parseStoredMlPriority(row.ml_priority) == null
    )
    .map((row) => row.pmid);

  const abstractForScore = await hydrateAbstractsByPmid(
    supabase,
    needsScorePmids
  );

  // Optional embeddings only for unscored rows (off by default on page loads).
  const embByPmid = new Map<string, number[] | null>();
  if (options?.useEmbeddings === true && needsScorePmids.length > 0) {
    const embItems = needsScorePmids.map((pmid) => {
      const row = slimRows.find((r) => r.pmid === pmid)!;
      return {
        pmid,
        title: row.articles?.title ?? null,
        abstract: abstractForScore.get(pmid) ?? null,
      };
    });
    const embedMaxFresh =
      options?.embedMaxFresh ??
      (articleWindow > 60 || daysBack > 60 ? 0 : 100);
    const embeddings = await getOrCreateEmbeddings(supabase, embItems, {
      maxFresh: embedMaxFresh,
    });
    for (let i = 0; i < embItems.length; i++) {
      const emb = embeddings[i];
      embByPmid.set(embItems[i].pmid, emb ? l2Normalize(emb) : null);
    }
  }

  const candidates: BriefItem[] = [];

  for (const row of slimRows) {
    const authors = (row.articles?.authors ?? [])
      .map((a) => String(a).trim())
      .filter(Boolean);
    const title = row.articles!.title!.trim();
    const storedMl = parseStoredMlPriority(row.ml_priority);
    const abstract = abstractForScore.get(row.pmid) ?? null;

    const rec: PubMedRecord = {
      pmid: row.pmid,
      title,
      abstract,
      journal: row.articles?.journal ?? null,
      pubDate: row.articles?.pub_date ?? null,
      publicationTypes: row.articles?.publication_types ?? [],
      meshTerms: row.articles?.mesh_terms ?? [],
      keywords: row.articles?.keywords ?? [],
      authors,
    };

    const scimago = lookupScimago(row.articles?.journal);
    const jifIsHigh =
      Boolean(scimago) ||
      isQ1Journal(row.articles?.journal) ||
      isHighImpactJournal(row.articles?.journal);

    let predictedPriority: number;
    let prioritySource: BriefItem["prioritySource"];
    if (row.admin_priority != null) {
      predictedPriority = row.admin_priority;
      prioritySource = "admin";
    } else if (storedMl != null) {
      predictedPriority = storedMl;
      prioritySource = "model";
    } else {
      const prediction = predictArticlePriority({
        rec,
        queryString: query_string,
        weights: learnedWeights,
        model: priorityModel,
        embedding: embByPmid.get(row.pmid) ?? null,
      });
      predictedPriority = prediction.priority;
      prioritySource = prediction.source;
    }

    if (!meetsBriefThreshold(row.admin_priority, predictedPriority, minPriority))
      continue;

    const storedRank =
      row.rank_score != null && Number.isFinite(Number(row.rank_score))
        ? Number(row.rank_score)
        : null;
    let relevancePercent: number;
    if (storedRank != null) {
      relevancePercent = normalizeScoreTo100(storedRank);
    } else {
      const breakdown = computeBreakdown(
        query_string,
        rec,
        learnedWeights,
        true,
        jifIsHigh,
        scoringOptions
      );
      relevancePercent = normalizeScoreTo100(breakdown.finalScore);
    }

    const eff = effectivePriority(row.admin_priority, predictedPriority);
    const studyLabelRaw = [row.subheading, row.label]
      .filter(Boolean)
      .join(" · ");
    const studyLabel = formatStudyLabel(studyLabelRaw || null);
    const jifEntry = lookupJif(row.articles?.journal);
    const adminSetting = parseAdminSettingValue(row.admin_setting);

    const feedLike: FeedItem = {
      pmid: row.pmid,
      summary_text: null,
      created_at: row.created_at,
      rank_score: storedRank,
      subheading: row.subheading ?? null,
      label: row.label ?? null,
      jif_2024: jifEntry?.jif ?? null,
      source: "pubmed",
      admin_priority: row.admin_priority ?? null,
      ml_priority: storedMl,
      admin_setting: adminSetting,
      is_q1: Boolean(scimago) || isQ1Journal(row.articles?.journal),
      sjr_scimago: scimago?.sjr ?? null,
      articles: {
        title,
        abstract,
        journal: row.articles?.journal ?? null,
        pub_date: row.articles?.pub_date ?? null,
        release_date: row.articles?.release_date ?? null,
        fetched_at: row.articles?.fetched_at ?? null,
        publication_types: row.articles?.publication_types ?? null,
        keywords: row.articles?.keywords ?? null,
        mesh_terms: row.articles?.mesh_terms ?? null,
        source: row.articles?.source ?? null,
      },
    };

    const item: BriefItem = {
      pmid: row.pmid,
      source: "pubmed",
      headline: resolveStoredHeadline(row.headline, "", title),
      title,
      journal: row.articles?.journal?.trim() ?? null,
      jif: jifEntry?.jif ?? null,
      jifIsHigh,
      isQ1: Boolean(scimago) || isQ1Journal(row.articles?.journal),
      sjrScimago: scimago?.sjr ?? null,
      date: row.articles?.release_date ?? row.articles?.pub_date ?? null,
      createdAt: row.created_at,
      isNew: isWithinHours(row.created_at, 24),
      setting: getItemSetting(feedLike),
      settings: getItemSettings(feedLike),
      adminSetting,
      studyLabel: studyLabel || null,
      methods: null,
      results: null,
      bottomLine: null,
      relevancePercent,
      predictedPriority,
      adminPriority: row.admin_priority ?? null,
      effectivePriority: eff,
      prioritySource,
      pubmedUrl: articleExternalUrl(row.pmid, "pubmed"),
      authors,
      keywords: (row.articles?.keywords ?? []).slice(0, 8),
      meshTerms: (row.articles?.mesh_terms ?? []).slice(0, 12),
      abstractSnippet: null,
    };

    if (!matchesBriefSettingFilter(item, settingFilter)) continue;
    candidates.push(item);
  }

  const priorityFirst =
    options?.rankBy === "priority" || !feedSettings.brief.leadByRecency;

  candidates.sort((a, b) => {
    if (priorityFirst) {
      if (b.effectivePriority !== a.effectivePriority) {
        return b.effectivePriority - a.effectivePriority;
      }
      const tDiff = articleTimestamp(b) - articleTimestamp(a);
      if (tDiff !== 0) return tDiff;
    } else {
      const tDiff = articleTimestamp(b) - articleTimestamp(a);
      if (tDiff !== 0) return tDiff;
      if (b.effectivePriority !== a.effectivePriority) {
        return b.effectivePriority - a.effectivePriority;
      }
    }
    if (b.relevancePercent !== a.relevancePercent) {
      return b.relevancePercent - a.relevancePercent;
    }
    return 0;
  });

  let filtered = candidates;
  if (articleWindow > 0) {
    const cutoff = Date.now() - articleWindow * 24 * 60 * 60 * 1000;
    filtered = candidates.filter((item) => {
      if (!item.date) return false;
      const t = articleTimestamp(item);
      if (t <= 0) return false;
      return t >= cutoff;
    });
  }

  const items = filtered.slice(0, maxItems);

  if (
    minItems > 0 &&
    items.length < minItems &&
    daysBack < maxLookbackDays
  ) {
    const nextDays =
      daysBack < 90
        ? 90
        : daysBack < 180
          ? 180
          : daysBack < 365
            ? 365
            : 730;
    if (nextDays > daysBack) {
      return getBriefItems({
        ...options,
        daysBack: Math.min(maxLookbackDays, nextDays),
        minItems,
        maxLookbackDays,
      });
    }
  }

  // Homepage / digest: hydrate summary + abstract only for survivors.
  // Top 10 (skipHeadlines) keeps slim fields — ranking does not need bodies.
  const abstractByPmid = new Map<string, string>();
  const headlineMetaByPmid = new Map<
    string,
    {
      summaryText: string;
      bottomLine: string | null;
      storedHeadline: string | null | undefined;
    }
  >();

  if (!options?.skipHeadlines && items.length > 0) {
    const bodies = await hydrateBriefBodies(
      supabase,
      topicId,
      items.map((i) => i.pmid)
    );

    for (const item of items) {
      const body = bodies.get(item.pmid);
      if (!body) continue;

      const bullets = parseSummaryBullets(body.summaryText);
      item.methods = bullets?.methods ?? null;
      item.results = bullets?.results ?? null;
      item.bottomLine = bullets?.bottomLine ?? null;
      item.headline = resolveStoredHeadline(
        body.headline,
        body.summaryText,
        item.title
      );
      if (body.abstract) {
        item.abstractSnippet =
          body.abstract.length > 1200
            ? `${body.abstract.slice(0, 1200)}…`
            : body.abstract;
      }

      const slim = slimRows.find((r) => r.pmid === item.pmid);
      const adminSetting = parseAdminSettingValue(slim?.admin_setting);
      const feedLike: FeedItem = {
        pmid: item.pmid,
        summary_text: body.summaryText,
        created_at: item.createdAt,
        rank_score: null,
        subheading: slim?.subheading ?? null,
        label: slim?.label ?? null,
        jif_2024: item.jif,
        source: "pubmed",
        admin_priority: item.adminPriority,
        ml_priority: parseStoredMlPriority(slim?.ml_priority),
        admin_setting: adminSetting,
        is_q1: item.isQ1,
        sjr_scimago: item.sjrScimago,
        articles: {
          title: item.title,
          abstract: body.abstract || null,
          journal: item.journal,
          pub_date: item.date,
          release_date: item.date,
          fetched_at: null,
          publication_types: slim?.articles?.publication_types ?? null,
          keywords: item.keywords,
          mesh_terms: item.meshTerms,
          source: "pubmed",
        },
      };
      item.setting = getItemSetting(feedLike);
      item.settings = getItemSettings(feedLike);
      item.adminSetting = adminSetting;

      abstractByPmid.set(item.pmid, body.abstract);
      headlineMetaByPmid.set(item.pmid, {
        summaryText: body.summaryText,
        bottomLine: bullets?.bottomLine ?? null,
        storedHeadline: body.headline,
      });
    }

    const headlineJobs = items.map((item) => {
      const meta = headlineMetaByPmid.get(item.pmid);
      return {
        pmid: item.pmid,
        title: item.title,
        abstract: abstractByPmid.get(item.pmid) ?? null,
        summaryText: meta?.summaryText ?? "",
        bottomLine: meta?.bottomLine ?? item.bottomLine,
        storedHeadline: meta?.storedHeadline,
        headline: item.headline,
      };
    });

    await ensureBriefHeadlines(topicId, supabase, headlineJobs);

    for (let i = 0; i < items.length; i++) {
      items[i].headline = headlineJobs[i].headline;
    }
  }

  return {
    topicId,
    source: "pubmed",
    query_string,
    daysBack,
    minPriority,
    priorityModelSamples: priorityModel?.sampleCount ?? 0,
    items,
  };
}
