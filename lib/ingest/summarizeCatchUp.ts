import type { SupabaseClient } from "@supabase/supabase-js";
import type { PubMedRecord } from "@/lib/pubmed/efetch";
import {
  fetchAlreadySummarizedPmids,
  summarizeNewRecords,
  type SummarizeBatchResult,
} from "@/lib/ingest/summarizeRecords";
import { summaryRunFailedCompletely } from "@/lib/ingest/summaryRun";

export { summaryRunFailedCompletely };

/** Papers saved in this window with an abstract and no summary are retried. */
export const UNSUMMARIZED_CATCHUP_DAYS = 7;
const CANDIDATE_SCAN = 500;

export function emptySummarizeResult(): SummarizeBatchResult {
  return {
    storedSummaries: 0,
    summarizeAttempted: 0,
    summarizeFailed: 0,
    mlPriorityGe5Count: 0,
    summarizeErrors: [],
  };
}

type ArticleRow = {
  pmid?: string | null;
  title?: string | null;
  abstract?: string | null;
  journal?: string | null;
  publication_types?: string[] | null;
  keywords?: string[] | null;
  mesh_terms?: string[] | null;
  authors?: string[] | null;
  doi?: string | null;
};

function asRecord(row: ArticleRow): PubMedRecord | null {
  const pmid = String(row.pmid ?? "").trim();
  const abstract = String(row.abstract ?? "").trim();
  if (!pmid || abstract.length < 40) return null;
  return {
    pmid,
    title: row.title ?? null,
    abstract,
    journal: row.journal ?? null,
    pubDate: null,
    publicationTypes: row.publication_types ?? [],
    meshTerms: row.mesh_terms ?? [],
    keywords: row.keywords ?? [],
    authors: row.authors ?? [],
    doi: row.doi ?? null,
  };
}

/**
 * Summarize recent papers that were stored and then left without a summary.
 * Uses the same cap as the rest of the ingest. Skips story photos so the
 * repair finishes inside the cron time limit.
 */
export async function summarizeRecentUnsummarized(options: {
  supabase: SupabaseClient;
  topicId: string;
  queryString: string;
  rankingWeights: Record<string, unknown> | null | undefined;
  maxSummaries: number;
  sinceIso?: string;
}): Promise<SummarizeBatchResult> {
  const maxSummaries = Math.max(0, Math.floor(options.maxSummaries));
  if (maxSummaries === 0) return emptySummarizeResult();

  const since =
    options.sinceIso ??
    new Date(
      Date.now() - UNSUMMARIZED_CATCHUP_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

  const { data: idRows, error: idErr } = await options.supabase
    .from("articles")
    .select("pmid")
    .gte("fetched_at", since)
    .not("abstract", "is", null)
    .order("fetched_at", { ascending: false })
    .limit(CANDIDATE_SCAN);
  if (idErr) {
    throw new Error(`Unsummarized lookup failed: ${idErr.message}`);
  }

  const pmids = (idRows ?? [])
    .map((row) => String((row as { pmid?: string }).pmid ?? "").trim())
    .filter(Boolean);
  if (pmids.length === 0) return emptySummarizeResult();

  const already = await fetchAlreadySummarizedPmids(
    options.supabase,
    options.topicId,
    pmids
  );
  const need = pmids.filter((pmid) => !already.has(pmid)).slice(0, maxSummaries);
  if (need.length === 0) return emptySummarizeResult();

  const { data: full, error: fullErr } = await options.supabase
    .from("articles")
    .select(
      "pmid, title, abstract, journal, publication_types, keywords, mesh_terms, authors, doi"
    )
    .in("pmid", need);
  if (fullErr) {
    throw new Error(`Unsummarized hydrate failed: ${fullErr.message}`);
  }

  const byPmid = new Map<string, PubMedRecord>();
  for (const row of full ?? []) {
    const record = asRecord(row as ArticleRow);
    if (record) byPmid.set(record.pmid, record);
  }
  const records = need
    .map((pmid) => byPmid.get(pmid))
    .filter((record): record is PubMedRecord => Boolean(record));
  if (records.length === 0) return emptySummarizeResult();

  return summarizeNewRecords({
    supabase: options.supabase,
    topicId: options.topicId,
    queryString: options.queryString,
    rankingWeights: options.rankingWeights,
    records,
    maxSummaries,
    alreadySummarized: already,
    skipStoryImages: true,
  });
}
