/**
 * Watermark-based incremental ingest for a single topic.
 *
 * Strategy:
 *   1. Look up pubmed_ingest_state for the topic (last successful CRDT max date).
 *   2. Compute the search window:
 *        cold start  → last 30 days
 *        warm run    → watermark − 1 day  →  today   (1-day overlap catches late records)
 *   3. Page through ALL PubMed results (crdt datetype, sort=most+recent).
 *   4. Deduplicate PMIDs, then EFetch records in 100-PMID chunks.
 *   5. Upsert articles.
 *   6. Advance watermark to maxdate ONLY after a successful upsert.
 *   7. Optionally summarize (up to maxSummaries).
 *
 * This replaces the old reldate / fixed-window approach and will reliably
 * capture every new record, even when PubMed indexing is delayed.
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { searchPubMedAllPages } from "@/lib/pubmed/esearch";
import { fetchPubMedRecords } from "@/lib/pubmed/efetch";
import type { PubMedRecord } from "@/lib/pubmed/efetch";
import {
  getTopicWatermark,
  setTopicWatermark,
  computeSearchWindow,
  getDateNDaysAgo,
  getTodayISO,
} from "@/lib/pubmed/watermark";
import { FEED_SLIM_INDEX_CACHE_TAG } from "@/lib/feedCache";
import { BRIEF_HOMEPAGE_CACHE_TAG } from "@/lib/brief/homepageCache";
import { saveLastIngestRunStats } from "@/lib/ingestStats";
import {
  fetchAlreadySummarizedPmids,
  summarizeNewRecords,
} from "@/lib/ingest/summarizeRecords";
import {
  fetchArticlesByDois,
  fetchArticlesByPmids,
  resolvePubmedMergePmid,
} from "@/lib/ingest/mergeArticle";
import { normalizeDoi } from "@/lib/doi";

export const runtime = "nodejs";
export const maxDuration = 300;

// ── Limits ────────────────────────────────────────────────────────────────────

/** Max PMIDs to EFetch / upsert per call. Keeps runtime predictable on Vercel. */
const DEFAULT_MAX_ARTICLES = 200;
const HARD_MAX_ARTICLES = 500;

/**
 * When summarizing, scan more PubMed IDs than we fetch so we can skip PMIDs
 * that already have summaries and prioritize older gaps (year backfill).
 */
const HARD_MAX_PMID_SCAN = 5000;

/**
 * Max summaries to generate per call.
 * Safe to be higher now that we use parallel batches (~4 s per batch of 5)
 * instead of sequential processing (~4 s per article).
 */
const DEFAULT_MAX_SUMMARIES = 5;
/** Raised so a year backfill can summarize in fewer passes. */
const HARD_MAX_SUMMARIES = 250;

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseInteger(
  value: string | number | null | undefined,
  fallback: number
): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = parseInt(value, 10);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

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

function toDateOnly(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const d = new Date(value.trim());
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

/**
 * Only fetch PMIDs that still need a summary — skip already-summarized hits
 * so later cron slots report genuinely new work, not refreshes.
 */
function prioritizeUnsummarizedPmids(
  pmids: string[],
  alreadySummarized: Set<string>,
  maxFetch: number
): { toFetch: string[]; needingSummary: number; alreadyHaveSummary: number } {
  const need: string[] = [];
  let alreadyHaveSummary = 0;
  for (const pmid of pmids) {
    if (alreadySummarized.has(pmid)) alreadyHaveSummary += 1;
    else need.push(pmid);
  }
  return {
    toFetch: need.slice(0, maxFetch),
    needingSummary: need.length,
    alreadyHaveSummary,
  };
}

// ── Request params ────────────────────────────────────────────────────────────

interface IngestParams {
  topicId: string | null;
  topicName: string | null;
  /** Override: manually specify days-back window (ignores watermark). */
  daysBack: number | null;
  maxArticles: number;
  maxSummaries: number;
  summarize: boolean;
  persistStats: boolean;
}

async function getParams(request: NextRequest): Promise<IngestParams> {
  const url = request.nextUrl;

  const parseFrom = (source: Record<string, string | undefined>): IngestParams => {
    const topicId = source.topicId?.trim() || null;
    const topicName = source.topicName?.trim() || null;
    const daysBackRaw = source.daysBack ? parseInteger(source.daysBack, 0) : null;
    const daysBack =
      daysBackRaw && daysBackRaw > 0 ? Math.min(400, daysBackRaw) : null;
    const maxArticles = Math.min(
      HARD_MAX_ARTICLES,
      Math.max(1, parseInteger(source.maxArticles ?? source.limit, DEFAULT_MAX_ARTICLES))
    );
    const maxSummaries = Math.min(
      HARD_MAX_SUMMARIES,
      Math.max(0, parseInteger(source.maxSummaries, DEFAULT_MAX_SUMMARIES))
    );
    const summarize =
      source.summarize === "true" || source.summarize === "1";
    const persistStats = source.persistStats !== "0" && source.persistStats !== "false";
    return { topicId, topicName, daysBack, maxArticles, maxSummaries, summarize, persistStats };
  };

  const fromQuery: Record<string, string | undefined> = {};
  url.searchParams.forEach((v, k) => {
    fromQuery[k] = v;
  });

  if (request.method === "GET") {
    return parseFrom(fromQuery);
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const src: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(body)) {
      src[k] = v != null ? String(v) : undefined;
    }
    return parseFrom({ ...fromQuery, ...src });
  } catch {
    return {
      topicId: null,
      topicName: null,
      daysBack: null,
      maxArticles: DEFAULT_MAX_ARTICLES,
      maxSummaries: DEFAULT_MAX_SUMMARIES,
      summarize: false,
      persistStats: true,
    };
  }
}

// ── Route handlers ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  return runIngest(request);
}

export async function POST(request: NextRequest) {
  return runIngest(request);
}

// ── Core ingest ───────────────────────────────────────────────────────────────

async function runIngest(request: NextRequest): Promise<NextResponse> {
  const startedAt = new Date().toISOString();
  console.log("[ingest] Start");

  try {
    const params = await getParams(request);
    const { topicId, topicName, daysBack, maxArticles, maxSummaries, summarize, persistStats } = params;

    const supabase = getSupabase();

    // ── 1. Resolve topic ──────────────────────────────────────────────────────

    let topic: TopicRow;

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

      if (!main) {
        return NextResponse.json({ ok: false, error: "Main topic not found" }, { status: 404 });
      }
      topic = main as TopicRow;
    } else if (topicId) {
      const { data: row, error } = await supabase
        .from("topics")
        .select("id, name, query_string, ranking_weights")
        .eq("id", topicId)
        .single();

      if (error || !row) {
        return NextResponse.json(
          { ok: false, error: error?.message ?? "Topic not found" },
          { status: 404 }
        );
      }
      topic = row as TopicRow;
    } else {
      return NextResponse.json(
        { ok: false, error: "Provide topicId or topicName=main" },
        { status: 400 }
      );
    }

    const queryString = topic.query_string?.trim();
    if (!queryString) {
      return NextResponse.json({ ok: false, error: "Topic has no query_string" }, { status: 400 });
    }

    // ── 2. Compute search window ──────────────────────────────────────────────

    let mindate: string;
    let maxdate: string;
    let isFirstRun = false;
    let watermarkUsed: string | null = null;

    if (daysBack != null) {
      // Manual override: explicit days-back window (useful for testing)
      mindate = getDateNDaysAgo(daysBack);
      maxdate = getTodayISO();
      console.log("[ingest] Using manual daysBack override", { daysBack, mindate, maxdate });
    } else {
      // Watermark-based incremental window
      watermarkUsed = await getTopicWatermark(topic.id, supabase);
      const window = computeSearchWindow(watermarkUsed);
      mindate = window.mindate;
      maxdate = window.maxdate;
      isFirstRun = window.isFirstRun;
      console.log("[ingest] Watermark window", { watermarkUsed, mindate, maxdate, isFirstRun });
    }

    // ── 3. Page through PubMed results ─────────────────────────────────────────
    // When summarizing, scan far more IDs than we EFetch so we can skip PMIDs
    // that already have summaries (otherwise year backfill only hits the newest
    // 500 — which are usually already summarized — and stores 0 new summaries).

    const pmidScanCap =
      summarize && maxSummaries > 0
        ? // Year / manual windows: scan as many IDs as Vercel time allows so we
          // can pick unsummarized gaps instead of re-hitting the newest 500.
          daysBack != null
            ? HARD_MAX_PMID_SCAN
            : Math.min(HARD_MAX_PMID_SCAN, Math.max(maxArticles, maxSummaries * 15))
        : maxArticles;

    console.log("[ingest] Searching PubMed (crdt)", {
      mindate,
      maxdate,
      maxArticles,
      pmidScanCap,
      summarize,
      maxSummaries,
    });

    const searchResult = await searchPubMedAllPages({
      query: queryString,
      mindate,
      maxdate,
      maxTotal: pmidScanCap,
    });

    const totalPmidsFound = searchResult.count;
    let pmids = searchResult.pmids;
    const totalPmidsScanned = pmids.length;

    let needingSummaryAmongScanned = 0;
    let alreadyHaveSummaryAmongScanned = 0;

    if (summarize && maxSummaries > 0 && pmids.length > 0) {
      const already = await fetchAlreadySummarizedPmids(supabase, topic.id, pmids);
      const prioritized = prioritizeUnsummarizedPmids(pmids, already, maxArticles);
      pmids = prioritized.toFetch;
      needingSummaryAmongScanned = prioritized.needingSummary;
      alreadyHaveSummaryAmongScanned = prioritized.alreadyHaveSummary;
      console.log("[ingest] Prioritized unsummarized PMIDs", {
        scanned: totalPmidsScanned,
        needingSummary: needingSummaryAmongScanned,
        alreadyHaveSummary: alreadyHaveSummaryAmongScanned,
        fetching: pmids.length,
      });
    } else {
      pmids = pmids.slice(0, maxArticles);
    }

    const totalPmidsAfterDedupe = pmids.length;

    console.log("[ingest] Search complete", {
      totalPmidsFound,
      totalPmidsScanned,
      totalPmidsAfterDedupe,
      pages: searchResult.pages,
    });

    if (pmids.length === 0) {
      // No genuinely new records — still advance watermark.
      await setTopicWatermark(topic.id, maxdate, supabase);
      const completedAt = new Date().toISOString();
      if (persistStats) {
        await saveLastIngestRunStats(supabase, {
          topicId: topic.id,
          ranAt: completedAt,
          newArticles: 0,
          newSummaries: 0,
          mlPriorityGe5: 0,
        });
      }
      return NextResponse.json({
        ok: true,
        topicId: topic.id,
        topicName: topic.name,
        mindate,
        maxdate,
        isFirstRun,
        totalPmidsFound,
        totalPmidsScanned,
        totalPmidsAfterDedupe: 0,
        needingSummaryAmongScanned,
        alreadyHaveSummaryAmongScanned,
        recordsParsed: 0,
        storedArticles: 0,
        newArticles: 0,
        storedSummaries: 0,
        summarize,
        maxSummaries,
        watermarkAdvanced: true,
      });
    }

    // ── 4. EFetch records ─────────────────────────────────────────────────────

    console.log("[ingest] Fetching records via EFetch", { count: pmids.length });
    const rawRecords = await fetchPubMedRecords(pmids);

    // Deduplicate by pmid (Set-based; EFetch should already be clean but be safe)
    const seenPmids = new Set<string>();
    const records: PubMedRecord[] = [];
    for (const r of rawRecords) {
      if (!r?.pmid || !/^\d+$/.test(r.pmid)) continue;
      if (seenPmids.has(r.pmid)) continue;
      seenPmids.add(r.pmid);
      records.push(r);
    }

    const recordsParsed = records.length;
    console.log("[ingest] Records parsed after dedupe", recordsParsed);

    // ── 5. Merge OpenAlex-first rows on DOI, then build article rows ──────────

    const fetchedAt = new Date().toISOString();
    const todayStr = getTodayISO();
    const dois = records
      .map((r) => normalizeDoi(r.doi ?? null))
      .filter((d): d is string => Boolean(d));
    const [existingMeta, byDoi] = await Promise.all([
      fetchArticlesByPmids(
        supabase,
        records.map((r) => r.pmid)
      ),
      fetchArticlesByDois(supabase, dois),
    ]);

    let rekeyed = 0;
    const omitDoiPmids = new Set<string>();
    for (const r of records) {
      const doi = normalizeDoi(r.doi ?? null);
      const merged = await resolvePubmedMergePmid({
        supabase,
        pubmedPmid: r.pmid,
        doi,
        byPmid: existingMeta,
        byDoi,
      });
      if (merged.rekeyed) rekeyed += 1;
      if (merged.omitDoi) omitDoiPmids.add(r.pmid);
    }

    const newArticleCount = records.filter((r) => !existingMeta.has(r.pmid)).length;

    type ArticleRow = {
      pmid: string;
      title: string | null;
      abstract: string | null;
      journal: string | null;
      pub_date: string | null;
      article_date: string | null;
      epub_date: string | null;
      pubmed_date: string | null;
      release_date: string;
      publication_types: string[];
      keywords: string[];
      mesh_terms: string[];
      authors: string[];
      source: string;
      /** Always set — PostgREST upsert nulls omitted NOT NULL columns on update. */
      fetched_at: string;
      corresponding_author_email: string | null;
      corresponding_author_name: string | null;
      doi: string | null;
      openalex_id: string | null;
      landing_url: string | null;
    };

    const articleRows: ArticleRow[] = records.map((r) => {
      const pubDate = toDateOnly(r.pubDate);
      const articleDate = toDateOnly(r.articleDate ?? null);
      const epubDate = toDateOnly(r.epubDate ?? null);
      const pubmedDate = toDateOnly(r.pubmedDate ?? null);
      const releaseDateRaw = articleDate ?? epubDate ?? pubmedDate ?? pubDate ?? todayStr;
      const releaseDate = clampToToday(releaseDateRaw) ?? todayStr;
      const prior = existingMeta.get(r.pmid) ?? (r.doi ? byDoi.get(normalizeDoi(r.doi) ?? "") : undefined);
      const parsedEmail = r.correspondingAuthorEmail?.trim() || null;
      const parsedName = r.correspondingAuthorName?.trim() || null;
      const doi = omitDoiPmids.has(r.pmid)
        ? null
        : normalizeDoi(r.doi ?? null) ?? prior?.doi ?? null;

      return {
        pmid: r.pmid,
        title: r.title ?? null,
        abstract: r.abstract ?? null,
        journal: r.journal ?? null,
        pub_date: pubDate,
        article_date: articleDate,
        epub_date: epubDate,
        pubmed_date: pubmedDate,
        release_date: releaseDate,
        publication_types: r.publicationTypes ?? [],
        keywords: r.keywords ?? [],
        mesh_terms: r.meshTerms ?? [],
        authors: r.authors ?? [],
        source: "pubmed",
        // Preserve first-seen stamp on refresh; stamp now only for brand-new PMIDs.
        fetched_at: prior?.fetchedAt ?? fetchedAt,
        corresponding_author_email: parsedEmail ?? prior?.correspondingEmail ?? null,
        corresponding_author_name: parsedName ?? prior?.correspondingName ?? null,
        doi,
        openalex_id: prior?.openalexId ?? null,
        landing_url: prior?.landingUrl ?? null,
      };
    });

    const doiOwner = new Map<string, string>();
    for (const [d, row] of byDoi) {
      if (d && row.pmid) doiOwner.set(d, row.pmid);
    }
    const seenDois = new Set<string>();
    for (const row of articleRows) {
      if (!row.doi) continue;
      const owner = doiOwner.get(row.doi);
      if ((owner && owner !== row.pmid) || seenDois.has(row.doi)) {
        row.doi = null;
        continue;
      }
      seenDois.add(row.doi);
      doiOwner.set(row.doi, row.pmid);
    }

    // ── 6. Upsert articles (in chunks to avoid payload limits) ────────────────

    console.log("[ingest] Upserting articles", {
      count: articleRows.length,
      newArticles: newArticleCount,
      rekeyed,
    });
    const UPSERT_CHUNK = 100;
    let storedArticles = 0;

    for (let i = 0; i < articleRows.length; i += UPSERT_CHUNK) {
      const chunk = articleRows.slice(i, i + UPSERT_CHUNK);
      const { error } = await supabase
        .from("articles")
        .upsert(chunk, { onConflict: "pmid" });

      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes("corresponding_author")) {
          const slim = chunk.map(
            ({
              corresponding_author_email,
              corresponding_author_name,
              ...rest
            }) => {
              void corresponding_author_email;
              void corresponding_author_name;
              return rest;
            }
          );
          const retry = await supabase
            .from("articles")
            .upsert(slim, { onConflict: "pmid" });
          if (retry.error) {
            throw new Error(
              `Articles upsert failed (chunk ${i}): ${retry.error.message}`
            );
          }
        } else {
          throw new Error(`Articles upsert failed (chunk ${i}): ${error.message}`);
        }
      }
      storedArticles += chunk.length;
    }

    // ── 7. Advance watermark (only after durable upsert) ──────────────────────

    await setTopicWatermark(topic.id, maxdate, supabase);
    console.log("[ingest] Watermark advanced to", maxdate);

    // ── 8. Optional summarization ─────────────────────────────────────────────

    let storedSummaries = 0;
    let summarizeAttempted = 0;
    let summarizeFailed = 0;
    let mlPriorityGe5Count = 0;
    let summarizeErrors: string[] | undefined;

    if (summarize && maxSummaries > 0) {
      const batch = await summarizeNewRecords({
        supabase,
        topicId: topic.id,
        queryString,
        rankingWeights: topic.ranking_weights,
        records,
        maxSummaries,
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
    console.log("[ingest] Complete", {
      storedArticles,
      newArticles: newArticleCount,
      storedSummaries,
      mlPriorityGe5Count,
      rekeyed,
    });

    if (persistStats) {
      await saveLastIngestRunStats(supabase, {
        topicId: topic.id,
        ranAt: completedAt,
        newArticles: newArticleCount,
        newSummaries: storedSummaries,
        mlPriorityGe5: mlPriorityGe5Count,
      });
    }

    // Cache bust is best-effort — durable ingest already succeeded. Outside a
    // Next request context (scripts) revalidateTag throws; never fail the run.
    try {
      revalidateTag(FEED_SLIM_INDEX_CACHE_TAG, "max");
      revalidateTag(BRIEF_HOMEPAGE_CACHE_TAG, "max");
    } catch (err) {
      console.warn(
        "[ingest] revalidateTag skipped:",
        err instanceof Error ? err.message : err
      );
    }

    return NextResponse.json({
      ok: true,
      topicId: topic.id,
      topicName: topic.name,
      startedAt,
      completedAt,
      // Window
      mindate,
      maxdate,
      isFirstRun,
      watermarkBefore: watermarkUsed,
      watermarkAfter: maxdate,
      // Counts
      totalPmidsFound,
      totalPmidsScanned,
      totalPmidsAfterDedupe,
      needingSummaryAmongScanned,
      alreadyHaveSummaryAmongScanned,
      recordsParsed,
      storedArticles,
      newArticles: newArticleCount,
      storedSummaries,
      mlPriorityGe5Count,
      rekeyed,
      summarize,
      maxSummaries,
      summarizeAttempted,
      summarizeFailed,
      summarizeErrors,
      // Flags
      watermarkAdvanced: true,
      pages: searchResult.pages,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[ingest] Error", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
