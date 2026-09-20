import { revalidateTag } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { searchOpenAlexJournalWorks } from "@/lib/openalex/search";
import {
  computeOpenAlexWindow,
  getOpenAlexWatermark,
  setOpenAlexWatermark,
  OPENALEX_MAX_BACKFILL_DAYS,
} from "@/lib/openalex/watermark";
import { getDateNDaysAgo, getTodayISO } from "@/lib/pubmed/watermark";
import {
  fetchAlreadySummarizedPmids,
  summarizeNewRecords,
} from "@/lib/ingest/summarizeRecords";
import {
  fetchArticlesByDois,
  fetchArticlesByOpenAlexIds,
  fetchArticlesByPmids,
  rekeyArticlePmid,
} from "@/lib/ingest/mergeArticle";
import { isOpenAlexWorkId, normalizeDoi } from "@/lib/doi";
import type { OpenAlexRecord } from "@/lib/openalex/works";
import { FEED_SLIM_INDEX_CACHE_TAG } from "@/lib/feedCache";
import { BRIEF_HOMEPAGE_CACHE_TAG } from "@/lib/brief/homepageCache";
import { saveLastIngestRunStats } from "@/lib/ingestStats";
import { OPENALEX_JOURNAL_LABELS } from "@/lib/openalex/journals";
import { refineOpenAlexRecordDates, toDateOnly } from "@/lib/openalex/dates";

export const OPENALEX_INGEST_MAX_ARTICLES = 200;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing Supabase env: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function clampToToday(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const today = getTodayISO();
  return dateStr > today ? today : dateStr;
}

type TopicRow = {
  id: string;
  name: string;
  query_string: string;
  ranking_weights?: Record<string, unknown> | null;
};

export type OpenAlexIngestResult = {
  ok: boolean;
  error?: string;
  topicId?: string;
  topicName?: string;
  journals?: readonly string[];
  mindate?: string;
  maxdate?: string;
  isFirstRun?: boolean;
  totalWorksFound?: number;
  recordsParsed?: number;
  storedArticles?: number;
  newArticles?: number;
  stampedExisting?: number;
  rekeyed?: number;
  storedSummaries?: number;
  mlPriorityGe5Count?: number;
  summarize?: boolean;
  maxSummaries?: number;
  summarizeAttempted?: number;
  summarizeFailed?: number;
  summarizeErrors?: string[];
  watermarkAdvanced?: boolean;
  pages?: number;
  startedAt?: string;
  completedAt?: string;
};

async function resolveTopic(
  supabase: ReturnType<typeof getSupabase>,
  topicId: string | null,
  topicName: string | null
): Promise<TopicRow> {
  if (topicName?.toLowerCase() === "main") {
    const { data: rows, error } = await supabase
      .from("topics")
      .select("id, name, query_string, ranking_weights")
      .ilike("name", "%antimicrobial stewardship%")
      .limit(10);
    if (error) throw new Error(`Topic lookup failed: ${error.message}`);
    const main = (rows ?? []).find(
      (r: { name?: string | null }) =>
        !String(r.name ?? "").toLowerCase().includes("artificial intelligence")
    );
    if (!main) throw new Error("Main topic not found");
    return main as TopicRow;
  }
  if (topicId) {
    const { data: row, error } = await supabase
      .from("topics")
      .select("id, name, query_string, ranking_weights")
      .eq("id", topicId)
      .single();
    if (error || !row) throw new Error(error?.message ?? "Topic not found");
    return row as TopicRow;
  }
  throw new Error("Provide topicId or topicName=main");
}

export async function runOpenAlexIngest(options: {
  topicId?: string | null;
  topicName?: string | null;
  daysBack?: number | null;
  maxArticles?: number;
  maxSummaries?: number;
  summarize?: boolean;
  persistStats?: boolean;
}): Promise<OpenAlexIngestResult> {
  const startedAt = new Date().toISOString();
  const maxArticles = Math.min(
    OPENALEX_INGEST_MAX_ARTICLES,
    Math.max(1, options.maxArticles ?? 200)
  );
  const maxSummaries = Math.max(0, options.maxSummaries ?? 0);
  const summarize = Boolean(options.summarize) && maxSummaries > 0;
  const persistStats = options.persistStats !== false;

  const supabase = getSupabase();
  const topic = await resolveTopic(
    supabase,
    options.topicId ?? null,
    options.topicName ?? null
  );

  let mindate: string;
  let maxdate: string;
  let isFirstRun = false;

  if (options.daysBack != null && options.daysBack > 0) {
    const days = Math.min(OPENALEX_MAX_BACKFILL_DAYS, options.daysBack);
    mindate = getDateNDaysAgo(days);
    maxdate = getTodayISO();
  } else {
    const watermarkUsed = await getOpenAlexWatermark(topic.id, supabase);
    const window = computeOpenAlexWindow(watermarkUsed);
    mindate = window.mindate;
    maxdate = window.maxdate;
    isFirstRun = window.isFirstRun;
  }

  console.log("[openalex ingest] Searching journals", {
    journals: OPENALEX_JOURNAL_LABELS,
    mindate,
    maxdate,
    maxArticles,
    summarize,
    maxSummaries,
  });

  const searchResult = await searchOpenAlexJournalWorks({
    mindate,
    maxdate,
    maxTotal: maxArticles,
  });

  const records = searchResult.records;
  await refineOpenAlexRecordDates(records);
  const dois = records
    .map((r) => r.doi)
    .filter((d): d is string => Boolean(d));
  const openalexIds = records.map((r) => r.openalexId);
  const pubmedPmids = records
    .map((r) => r.pubmedPmid)
    .filter((p): p is string => Boolean(p));

  const [byDoi, byOpenAlex, byPmid] = await Promise.all([
    fetchArticlesByDois(supabase, dois),
    fetchArticlesByOpenAlexIds(supabase, openalexIds),
    fetchArticlesByPmids(supabase, pubmedPmids),
  ]);

  const fetchedAt = new Date().toISOString();
  const todayStr = getTodayISO();
  const toInsert: OpenAlexRecord[] = [];
  const summarizeCandidates: OpenAlexRecord[] = [];
  let stampedExisting = 0;
  let rekeyed = 0;

  for (const rec of records) {
    const doi = normalizeDoi(rec.doi);
    if (!doi) continue;

    const existing =
      byDoi.get(doi) ??
      byOpenAlex.get(rec.openalexId) ??
      (rec.pubmedPmid ? byPmid.get(rec.pubmedPmid) ?? null : null);

    if (existing) {
      if (
        rec.pubmedPmid &&
        isOpenAlexWorkId(existing.pmid) &&
        existing.pmid !== rec.pubmedPmid &&
        !byPmid.has(rec.pubmedPmid)
      ) {
        await rekeyArticlePmid(supabase, existing.pmid, rec.pubmedPmid);
        existing.pmid = rec.pubmedPmid;
        rekeyed += 1;
      }

      const patch: Record<string, unknown> = {
        doi,
        openalex_id: rec.openalexId,
        landing_url: rec.landingUrl ?? existing.landingUrl,
      };
      const { error } = await supabase
        .from("articles")
        .update(patch)
        .eq("pmid", existing.pmid);
      if (error) {
        console.warn("[openalex ingest] stamp existing failed:", error.message);
      }
      stampedExisting += 1;
      rec.pmid = existing.pmid;
      summarizeCandidates.push(rec);
      continue;
    }

    toInsert.push(rec);
    summarizeCandidates.push(rec);
  }

  const articleRows = toInsert.map((r) => {
    const pubDate = toDateOnly(r.pubDate);
    const releaseDate = clampToToday(pubDate) ?? todayStr;
    return {
      pmid: r.pmid,
      title: r.title ?? null,
      abstract: r.abstract ?? null,
      journal: r.journal ?? null,
      pub_date: pubDate,
      article_date: pubDate,
      epub_date: pubDate,
      release_date: releaseDate,
      publication_types: r.publicationTypes ?? [],
      keywords: r.keywords ?? [],
      mesh_terms: r.meshTerms ?? [],
      authors: r.authors ?? [],
      source: "openalex",
      fetched_at: fetchedAt,
      doi: r.doi,
      openalex_id: r.openalexId,
      landing_url: r.landingUrl,
    };
  });

  const UPSERT_CHUNK = 100;
  let storedArticles = 0;
  for (let i = 0; i < articleRows.length; i += UPSERT_CHUNK) {
    const chunk = articleRows.slice(i, i + UPSERT_CHUNK);
    const { error } = await supabase.from("articles").upsert(chunk, {
      onConflict: "pmid",
    });
    if (error) {
      throw new Error(`OpenAlex articles upsert failed: ${error.message}`);
    }
    storedArticles += chunk.length;
  }

  await setOpenAlexWatermark(topic.id, maxdate, supabase);

  let storedSummaries = 0;
  let summarizeAttempted = 0;
  let summarizeFailed = 0;
  let mlPriorityGe5Count = 0;
  let summarizeErrors: string[] | undefined;

  if (summarize && summarizeCandidates.length > 0) {
    const already = await fetchAlreadySummarizedPmids(
      supabase,
      topic.id,
      summarizeCandidates.map((r) => r.pmid)
    );
    const batch = await summarizeNewRecords({
      supabase,
      topicId: topic.id,
      queryString: topic.query_string,
      rankingWeights: topic.ranking_weights,
      records: summarizeCandidates,
      maxSummaries,
      alreadySummarized: already,
    });
    storedSummaries = batch.storedSummaries;
    summarizeAttempted = batch.summarizeAttempted;
    summarizeFailed = batch.summarizeFailed;
    mlPriorityGe5Count = batch.mlPriorityGe5Count;
    summarizeErrors = batch.summarizeErrors.length
      ? batch.summarizeErrors
      : undefined;
  }

  const completedAt = new Date().toISOString();
  if (persistStats) {
    await saveLastIngestRunStats(supabase, {
      topicId: topic.id,
      ranAt: completedAt,
      newArticles: articleRows.length,
      newSummaries: storedSummaries,
      mlPriorityGe5: mlPriorityGe5Count,
    });
  }

  try {
    revalidateTag(FEED_SLIM_INDEX_CACHE_TAG, "max");
    revalidateTag(BRIEF_HOMEPAGE_CACHE_TAG, "max");
  } catch (err) {
    console.warn(
      "[openalex ingest] revalidateTag skipped:",
      err instanceof Error ? err.message : err
    );
  }

  return {
    ok: true,
    topicId: topic.id,
    topicName: topic.name,
    journals: OPENALEX_JOURNAL_LABELS,
    startedAt,
    completedAt,
    mindate,
    maxdate,
    isFirstRun,
    totalWorksFound: searchResult.count,
    recordsParsed: records.length,
    storedArticles,
    newArticles: articleRows.length,
    stampedExisting,
    rekeyed,
    storedSummaries,
    mlPriorityGe5Count,
    summarize,
    maxSummaries,
    summarizeAttempted,
    summarizeFailed,
    summarizeErrors,
    watermarkAdvanced: true,
    pages: searchResult.pages,
  };
}
