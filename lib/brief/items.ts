import "server-only";
import { getDefaultTopicId, type FeedItem } from "@/lib/feed";
import { computeBreakdown } from "@/lib/ranking";
import { mergeFeedSettings, toRankingWeights, toPenaltyWeights } from "@/lib/brief/feedSettings";
import type { ScoringOptions } from "@/lib/ranking";
import {
  normalizeScoreTo100,
  parseSummaryBullets,
  getItemSetting,
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
  setting: ArticleSetting | null;
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

export async function getBriefItems(options?: {
  daysBack?: number;
  maxItems?: number;
  setting?: BriefSettingFilter;
  /** Skip OpenAI headline backfill (for side panels / ranking lists). */
  skipHeadlines?: boolean;
  /** Expand lookback until at least this many setting-matched items (or maxLookbackDays). */
  minItems?: number;
  /** Cap for lookback expansion (default 365, max 730). */
  maxLookbackDays?: number;
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
  const minPriority = feedSettings.brief.minPriority;
  const minItems = Math.max(0, options?.minItems ?? 0);
  const maxLookbackDays = Math.min(
    730,
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

  let rows: unknown[] | null = null;
  let error: { message: string } | null = null;

  const selectWithHeadline =
    "pmid, summary_text, headline, created_at, subheading, label, admin_priority, admin_setting, articles!inner(title, abstract, journal, pub_date, release_date, fetched_at, publication_types, keywords, mesh_terms, authors, source)";
  const selectWithoutHeadline =
    "pmid, summary_text, created_at, subheading, label, admin_priority, admin_setting, articles!inner(title, abstract, journal, pub_date, release_date, fetched_at, publication_types, keywords, mesh_terms, authors, source)";

  const rowCeiling = articleWindow > 0 || daysBack > 60 ? 20000 : 1000;

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
        .eq("articles.source", "pubmed");

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

    // First page also reports the true total so the rest can be fetched at once
    // instead of discovering the end one round-trip at a time.
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

  const withHeadline = await fetchRows(selectWithHeadline);

  const errMsg = withHeadline.error?.message?.toLowerCase() ?? "";
  if (
    errMsg.includes("headline") ||
    errMsg.includes("mesh_terms") ||
    errMsg.includes("admin_setting") ||
    errMsg.includes("authors")
  ) {
    let selectFallback = selectWithHeadline;
    if (errMsg.includes("headline")) {
      selectFallback = selectWithoutHeadline;
    }
    if (errMsg.includes("mesh_terms")) {
      selectFallback = selectFallback.replace(", mesh_terms", "");
    }
    if (errMsg.includes("admin_setting")) {
      selectFallback = selectFallback.replace(", admin_setting", "");
    }
    if (errMsg.includes("authors")) {
      selectFallback = selectFallback.replace(", authors", "");
    }
    const fallback = await fetchRows(selectFallback);
    rows = fallback.rows;
    error = fallback.error;
  } else {
    rows = withHeadline.rows;
    error = withHeadline.error;
  }

  if (error) throw new Error(error.message);

  const rowList = (rows ?? []) as unknown[];
  const embItems: {
    pmid: string;
    title: string | null;
    abstract: string | null;
  }[] = [];
  for (const raw of rowList) {
    const row = raw as {
      pmid?: string;
      articles?: { title?: string | null; abstract?: string | null } | null;
    };
    if (!row.pmid) continue;
    embItems.push({
      pmid: row.pmid,
      title: row.articles?.title ?? null,
      abstract: row.articles?.abstract ?? null,
    });
  }
  const embeddings = await getOrCreateEmbeddings(supabase, embItems);
  const embByPmid = new Map<string, number[] | null>();
  for (let i = 0; i < embItems.length; i++) {
    const emb = embeddings[i];
    embByPmid.set(embItems[i].pmid, emb ? l2Normalize(emb) : null);
  }

  const candidates: BriefItem[] = [];
  const abstractByPmid = new Map<string, string>();
  const headlineMetaByPmid = new Map<
    string,
    {
      summaryText: string;
      bottomLine: string | null;
      storedHeadline: string | null | undefined;
    }
  >();

  for (const raw of rowList) {
    const row = raw as {
      pmid: string;
      summary_text: string | null;
      headline?: string | null;
      created_at: string;
      subheading?: string | null;
      label?: string | null;
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
        authors?: string[] | null;
        source?: string | null;
      } | null;
    };

    if (!row.articles?.title?.trim() || !row.summary_text?.trim()) continue;
    if (!isPubMedArticle(row.pmid, row.articles.source)) continue;

    const authors = (row.articles.authors ?? [])
      .map((a) => String(a).trim())
      .filter(Boolean);

    const rec: PubMedRecord = {
      pmid: row.pmid,
      title: row.articles.title ?? null,
      abstract: row.articles.abstract ?? null,
      journal: row.articles.journal ?? null,
      pubDate: row.articles.pub_date ?? null,
      publicationTypes: row.articles.publication_types ?? [],
      meshTerms: row.articles.mesh_terms ?? [],
      keywords: row.articles.keywords ?? [],
      authors,
    };

    const scimago = lookupScimago(row.articles.journal);
    const jifIsHigh =
      Boolean(scimago) ||
      isQ1Journal(row.articles.journal) ||
      isHighImpactJournal(row.articles.journal);
    const breakdown = computeBreakdown(
      query_string,
      rec,
      learnedWeights,
      true,
      jifIsHigh,
      scoringOptions
    );
    const relevancePercent = normalizeScoreTo100(breakdown.finalScore);

    let predictedPriority: number;
    let prioritySource: BriefItem["prioritySource"];
    if (row.admin_priority != null) {
      predictedPriority = row.admin_priority;
      prioritySource = "admin";
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

    const eff = effectivePriority(row.admin_priority, predictedPriority);
    const bullets = parseSummaryBullets(row.summary_text);
    const studyLabelRaw = [row.subheading, row.label]
      .filter(Boolean)
      .join(" · ");
    const studyLabel = formatStudyLabel(studyLabelRaw || null);
    const title = row.articles.title!.trim();
    const headline = resolveStoredHeadline(
      row.headline,
      row.summary_text,
      title
    );

    abstractByPmid.set(row.pmid, row.articles.abstract?.trim() ?? "");
    headlineMetaByPmid.set(row.pmid, {
      summaryText: row.summary_text,
      bottomLine: bullets?.bottomLine ?? null,
      storedHeadline: row.headline,
    });

    const jifEntry = lookupJif(row.articles.journal);

    const feedLike: FeedItem = {
      pmid: row.pmid,
      summary_text: row.summary_text,
      created_at: row.created_at,
      rank_score: breakdown.finalScore,
      subheading: row.subheading ?? null,
      label: row.label ?? null,
      jif_2024: jifEntry?.jif ?? null,
      source: "pubmed",
      admin_priority: row.admin_priority ?? null,
      admin_setting: (() => {
        const s = row.admin_setting?.trim();
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
      })(),
      is_q1: Boolean(scimago) || isQ1Journal(row.articles.journal),
      sjr_scimago: scimago?.sjr ?? null,
      articles: {
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
      },
    };

    const item: BriefItem = {
      pmid: row.pmid,
      source: "pubmed",
      headline,
      title,
      journal: row.articles.journal?.trim() ?? null,
      jif: jifEntry?.jif ?? null,
      jifIsHigh,
      isQ1: Boolean(scimago) || isQ1Journal(row.articles.journal),
      sjrScimago: scimago?.sjr ?? null,
      date:
        row.articles.release_date ??
        row.articles.pub_date ??
        null,
      createdAt: row.created_at,
      isNew: isWithinHours(row.created_at, 24),
      setting: getItemSetting(feedLike),
      studyLabel: studyLabel || null,
      methods: bullets?.methods ?? null,
      results: bullets?.results ?? null,
      bottomLine: bullets?.bottomLine ?? null,
      relevancePercent,
      predictedPriority,
      adminPriority: row.admin_priority ?? null,
      effectivePriority: eff,
      prioritySource,
      pubmedUrl: articleExternalUrl(row.pmid, "pubmed"),
      authors,
      keywords: (row.articles.keywords ?? []).slice(0, 8),
      meshTerms: (row.articles.mesh_terms ?? []).slice(0, 12),
      abstractSnippet: (() => {
        const a = row.articles.abstract?.trim() ?? "";
        if (!a) return null;
        // Long enough to reach Results/Discussion in structured abstracts.
        return a.length > 1200 ? `${a.slice(0, 1200)}…` : a;
      })(),
    };

    if (!matchesBriefSettingFilter(item, settingFilter)) continue;
    candidates.push(item);
  }

  const priorityFirst =
    options?.rankBy === "priority" || !feedSettings.brief.leadByRecency;

  candidates.sort((a, b) => {
    // Default: newest article date first, then highest priority within that day/tie.
    // Priority-first: highest priority first, then newest date.
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
      // Require a real article/pub date — do not use summary created_at /
      // fetched_at, or backfill ingest would dominate the brief.
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

  if (!options?.skipHeadlines) {
    const headlineJobs = items.map((item) => {
      const meta = headlineMetaByPmid.get(item.pmid)!;
      return {
        pmid: item.pmid,
        title: item.title,
        abstract: abstractByPmid.get(item.pmid) ?? null,
        summaryText: meta.summaryText,
        bottomLine: meta.bottomLine,
        storedHeadline: meta.storedHeadline,
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
