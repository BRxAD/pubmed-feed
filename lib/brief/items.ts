import "server-only";
import { getDefaultTopicId, type FeedItem } from "@/lib/feed";
import { computeBreakdown } from "@/lib/ranking";
import { mergeLearnedWeights } from "@/lib/relevanceLearning";
import {
  normalizeScoreTo100,
  parseSummaryBullets,
  getItemSetting,
  formatStudyLabel,
} from "@/lib/filters";
import type { ArticleSetting } from "@/lib/classifySetting";
import { isHighImpactJournal, lookupJif } from "@/lib/jif";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { articleExternalUrl } from "@/lib/feedSource";
import type { PubMedRecord } from "@/lib/pubmed/efetch";
import {
  effectivePriority,
  meetsBriefThreshold,
} from "@/lib/brief/priority";
import {
  parsePriorityModel,
  predictArticlePriority,
  type PriorityPredictionSource,
} from "@/lib/brief/priorityModel";

/** Rolling window for the daily brief (summaries created within this period). */
export const DEFAULT_BRIEF_DAYS_BACK = 7;

export type BriefItem = {
  pmid: string;
  source: "pubmed";
  title: string;
  journal: string | null;
  jif: number | null;
  jifIsHigh: boolean;
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
  keywords: string[];
};

export type BriefFeedResult = {
  topicId: string;
  source: "pubmed";
  query_string: string;
  daysBack: number;
  minPriority: number;
  newSinceYesterday: number;
  priorityModelSamples: number;
  items: BriefItem[];
};

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
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

export async function getBriefItems(options?: {
  daysBack?: number;
  maxItems?: number;
}): Promise<BriefFeedResult> {
  const daysBack = Math.min(
    30,
    Math.max(1, options?.daysBack ?? DEFAULT_BRIEF_DAYS_BACK)
  );
  const maxItems = Math.min(100, Math.max(1, options?.maxItems ?? 50));

  const topicId = await getDefaultTopicId();
  if (!topicId) {
    throw new Error("Default topic not found");
  }

  const supabase = getSupabaseServerClient();
  const since = isoDaysAgo(daysBack);

  const { data: topic, error: topicError } = await supabase
    .from("topics")
    .select("query_string, ranking_weights, priority_model")
    .eq("id", topicId)
    .maybeSingle();

  if (topicError || !topic) {
    throw new Error("Topic not found");
  }

  const query_string = String(topic.query_string ?? "").trim();
  const learnedWeights = mergeLearnedWeights(
    (topic as { ranking_weights?: Record<string, unknown> | null }).ranking_weights
  );
  const priorityModel = parsePriorityModel(
    (topic as { priority_model?: unknown }).priority_model
  );

  const { data: rows, error } = await supabase
    .from("summaries")
    .select(
      "pmid, summary_text, created_at, subheading, label, admin_priority, articles!inner(title, abstract, journal, pub_date, release_date, fetched_at, publication_types, keywords, source)"
    )
    .eq("topic_id", topicId)
    .eq("articles.source", "pubmed")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) throw new Error(error.message);

  const candidates: BriefItem[] = [];

  for (const raw of rows ?? []) {
    const row = raw as {
      pmid: string;
      summary_text: string | null;
      created_at: string;
      subheading?: string | null;
      label?: string | null;
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

    if (!row.articles?.title?.trim() || !row.summary_text?.trim()) continue;
    if (!isPubMedArticle(row.pmid, row.articles.source)) continue;

    const rec: PubMedRecord = {
      pmid: row.pmid,
      title: row.articles.title ?? null,
      abstract: row.articles.abstract ?? null,
      journal: row.articles.journal ?? null,
      pubDate: row.articles.pub_date ?? null,
      publicationTypes: row.articles.publication_types ?? [],
      meshTerms: [],
      keywords: row.articles.keywords ?? [],
      authors: [],
    };

    const jifIsHigh = isHighImpactJournal(row.articles.journal);
    const breakdown = computeBreakdown(
      query_string,
      rec,
      learnedWeights,
      true,
      jifIsHigh
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
      });
      predictedPriority = prediction.priority;
      prioritySource = prediction.source;
    }

    if (!meetsBriefThreshold(row.admin_priority, predictedPriority)) continue;

    const eff = effectivePriority(row.admin_priority, predictedPriority);
    const bullets = parseSummaryBullets(row.summary_text);
    const studyLabelRaw = [row.subheading, row.label]
      .filter(Boolean)
      .join(" · ");
    const studyLabel = formatStudyLabel(studyLabelRaw || null);

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
      articles: {
        title: row.articles.title ?? null,
        abstract: row.articles.abstract ?? null,
        journal: row.articles.journal ?? null,
        pub_date: row.articles.pub_date ?? null,
        release_date: row.articles.release_date ?? null,
        fetched_at: row.articles.fetched_at ?? null,
        publication_types: row.articles.publication_types ?? null,
        keywords: row.articles.keywords ?? null,
        source: row.articles.source ?? null,
      },
    };

    candidates.push({
      pmid: row.pmid,
      source: "pubmed",
      title: row.articles.title!.trim(),
      journal: row.articles.journal?.trim() ?? null,
      jif: jifEntry?.jif ?? null,
      jifIsHigh,
      date:
        row.articles.release_date ??
        row.articles.pub_date ??
        row.articles.fetched_at?.slice(0, 10) ??
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
      keywords: (row.articles.keywords ?? []).slice(0, 8),
    });
  }

  candidates.sort((a, b) => {
    if (b.effectivePriority !== a.effectivePriority) {
      return b.effectivePriority - a.effectivePriority;
    }
    return b.relevancePercent - a.relevancePercent;
  });

  const items = candidates.slice(0, maxItems);
  const newSinceYesterday = candidates.filter((i) => i.isNew).length;

  return {
    topicId,
    source: "pubmed",
    query_string,
    daysBack,
    minPriority: 5,
    newSinceYesterday,
    priorityModelSamples: priorityModel?.sampleCount ?? 0,
    items,
  };
}
