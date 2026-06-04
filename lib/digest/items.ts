import "server-only";
import type { FeedSource } from "@/lib/feedSource";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { computeBreakdown } from "@/lib/ranking";
import { mergeLearnedWeights, priorityScoreBoost } from "@/lib/relevanceLearning";
import { normalizeScoreTo100, parseSummaryBullets } from "@/lib/filters";
import { isHighImpactJournal } from "@/lib/jif";
import { articleExternalUrl } from "@/lib/feedSource";
import type { PubMedRecord } from "@/lib/pubmed/efetch";

export type DigestItem = {
  pmid: string;
  title: string;
  journal: string | null;
  date: string | null;
  source: FeedSource;
  relevancePercent: number;
  studyLabel: string | null;
  methods: string | null;
  results: string | null;
  bottomLine: string | null;
  url: string;
};

function rowSource(raw: string | null | undefined): FeedSource {
  return raw === "openalex" ? "openalex" : "pubmed";
}

/**
 * Summaries for articles ingested or summarized since `sinceIso`, scored and
 * filtered by minimum normalized relevance (0–100).
 */
export async function getDigestItems(options: {
  topicId: string;
  sinceIso: string;
  minRelevancePercent?: number;
  maxItems?: number;
}): Promise<{ query_string: string; items: DigestItem[] }> {
  const {
    topicId,
    sinceIso,
    minRelevancePercent = 20,
    maxItems = 50,
  } = options;

  const supabase = getSupabaseServerClient();

  const { data: topic, error: topicError } = await supabase
    .from("topics")
    .select("query_string, ranking_weights")
    .eq("id", topicId)
    .maybeSingle();

  if (topicError || !topic) {
    throw new Error("Topic not found");
  }

  const query_string = String(topic.query_string ?? "").trim();
  const learnedWeights = mergeLearnedWeights(
    (topic as { ranking_weights?: Record<string, unknown> | null }).ranking_weights
  );

  const { data: rows, error } = await supabase
    .from("summaries")
    .select(
      "pmid, summary_text, subheading, label, admin_priority, created_at, articles!inner(title, abstract, journal, pub_date, release_date, fetched_at, publication_types, keywords, source)"
    )
    .eq("topic_id", topicId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);

  const items: DigestItem[] = [];

  for (const raw of rows ?? []) {
    const row = raw as {
      pmid: string;
      summary_text: string | null;
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

    const source = rowSource(row.articles.source);
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

    const breakdown = computeBreakdown(
      query_string,
      rec,
      learnedWeights,
      true,
      isHighImpactJournal(row.articles.journal)
    );
    const score = breakdown.finalScore + priorityScoreBoost(row.admin_priority);
    const relevancePercent = normalizeScoreTo100(score);

    if (relevancePercent < minRelevancePercent) continue;

    const bullets = parseSummaryBullets(row.summary_text);
    const studyLabel = [row.subheading, row.label]
      .filter(Boolean)
      .join(" · ")
      .replace(/_/g, " ")
      .trim();

    items.push({
      pmid: row.pmid,
      title: row.articles.title!.trim(),
      journal: row.articles.journal?.trim() ?? null,
      date:
        row.articles.release_date ??
        row.articles.pub_date ??
        row.articles.fetched_at?.slice(0, 10) ??
        null,
      source,
      relevancePercent,
      studyLabel: studyLabel || null,
      methods: bullets?.methods ?? null,
      results: bullets?.results ?? null,
      bottomLine: bullets?.bottomLine ?? null,
      url: articleExternalUrl(row.pmid, source),
    });
  }

  items.sort((a, b) => b.relevancePercent - a.relevancePercent);

  return {
    query_string,
    items: items.slice(0, maxItems),
  };
}

export function digestSinceIso(hoursBack = 24): string {
  const d = new Date();
  d.setHours(d.getHours() - hoursBack);
  return d.toISOString();
}

export function parseRecipientEmails(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return [
    ...new Set(
      raw
        .split(/[,;\s]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes("@"))
    ),
  ];
}
