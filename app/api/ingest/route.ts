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
import { createClient } from "@supabase/supabase-js";
import { searchPubMedAllPages } from "@/lib/pubmed/esearch";
import { fetchPubMedRecords } from "@/lib/pubmed/efetch";
import { summarizeAbstract } from "@/lib/summarize";
import { classifyStudyAbstract } from "@/lib/classifyStudy";
import type { PubMedRecord } from "@/lib/pubmed/efetch";
import {
  getTopicWatermark,
  setTopicWatermark,
  computeSearchWindow,
  getDateNDaysAgo,
  getTodayISO,
} from "@/lib/pubmed/watermark";

export const runtime = "nodejs";
export const maxDuration = 300;

// ── Limits ────────────────────────────────────────────────────────────────────

/** Max PMIDs to ingest per call. Keeps runtime predictable on Vercel. */
const DEFAULT_MAX_ARTICLES = 200;
const HARD_MAX_ARTICLES = 500;

/**
 * Max summaries to generate per call.
 * Safe to be higher now that we use parallel batches (~4 s per batch of 5)
 * instead of sequential processing (~4 s per article).
 */
const DEFAULT_MAX_SUMMARIES = 5;
const HARD_MAX_SUMMARIES = 100;

/** How many articles to summarize in parallel. */
const SUMMARIZE_CONCURRENCY = 5;

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
  return createClient(url, key);
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

type TopicRow = { id: string; name: string; query_string: string };

// ── Request params ────────────────────────────────────────────────────────────

interface IngestParams {
  topicId: string | null;
  topicName: string | null;
  /** Override: manually specify days-back window (ignores watermark). */
  daysBack: number | null;
  maxArticles: number;
  maxSummaries: number;
  summarize: boolean;
}

async function getParams(request: NextRequest): Promise<IngestParams> {
  const url = request.nextUrl;

  const parseFrom = (source: Record<string, string | undefined>): IngestParams => {
    const topicId = source.topicId?.trim() || null;
    const topicName = source.topicName?.trim() || null;
    const daysBackRaw = source.daysBack ? parseInteger(source.daysBack, 0) : null;
    const daysBack = daysBackRaw && daysBackRaw > 0 ? Math.min(365, daysBackRaw) : null;
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
    return { topicId, topicName, daysBack, maxArticles, maxSummaries, summarize };
  };

  if (request.method === "GET") {
    const src: Record<string, string | undefined> = {};
    url.searchParams.forEach((v, k) => { src[k] = v; });
    return parseFrom(src);
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const src: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(body)) {
      src[k] = v != null ? String(v) : undefined;
    }
    return parseFrom(src);
  } catch {
    return {
      topicId: null,
      topicName: null,
      daysBack: null,
      maxArticles: DEFAULT_MAX_ARTICLES,
      maxSummaries: DEFAULT_MAX_SUMMARIES,
      summarize: false,
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
    const { topicId, topicName, daysBack, maxArticles, maxSummaries, summarize } = params;

    const supabase = getSupabase();

    // ── 1. Resolve topic ──────────────────────────────────────────────────────

    let topic: TopicRow;

    if (topicName?.toLowerCase() === "main") {
      const { data: rows, error } = await supabase
        .from("topics")
        .select("id, name, query_string")
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
        .select("id, name, query_string")
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

    // ── 3. Page through all PubMed results ────────────────────────────────────

    console.log("[ingest] Searching PubMed (crdt)", { mindate, maxdate, maxArticles });

    const searchResult = await searchPubMedAllPages({
      query: queryString,
      mindate,
      maxdate,
      maxTotal: maxArticles,
    });

    const totalPmidsFound = searchResult.count;      // total matching on PubMed
    const pmids = searchResult.pmids;                // deduplicated, capped at maxArticles
    const totalPmidsAfterDedupe = pmids.length;

    console.log("[ingest] Search complete", {
      totalPmidsFound,
      totalPmidsAfterDedupe,
      pages: searchResult.pages,
    });

    if (pmids.length === 0) {
      // No new records — still advance watermark so we don't re-scan unnecessarily
      await setTopicWatermark(topic.id, maxdate, supabase);
      return NextResponse.json({
        ok: true,
        topicId: topic.id,
        topicName: topic.name,
        mindate,
        maxdate,
        isFirstRun,
        totalPmidsFound,
        totalPmidsAfterDedupe: 0,
        recordsParsed: 0,
        storedArticles: 0,
        storedSummaries: 0,
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

    // ── 5. Build article rows ─────────────────────────────────────────────────

    const fetchedAt = new Date().toISOString();
    const todayStr = getTodayISO();

    const articleRows = records.map((r) => {
      const pubDate = toDateOnly(r.pubDate);
      const articleDate = toDateOnly((r as PubMedRecord & { articleDate?: string | null }).articleDate ?? null);
      const epubDate = toDateOnly((r as PubMedRecord & { epubDate?: string | null }).epubDate ?? null);
      const pubmedDate = toDateOnly((r as PubMedRecord & { pubmedDate?: string | null }).pubmedDate ?? null);
      const releaseDateRaw = articleDate ?? epubDate ?? pubmedDate ?? pubDate ?? todayStr;
      const releaseDate = clampToToday(releaseDateRaw) ?? todayStr;

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
        fetched_at: fetchedAt,
        source: "pubmed",
      };
    });

    // ── 6. Upsert articles (in chunks to avoid payload limits) ────────────────

    console.log("[ingest] Upserting articles", { count: articleRows.length });
    const UPSERT_CHUNK = 100;
    let storedArticles = 0;

    for (let i = 0; i < articleRows.length; i += UPSERT_CHUNK) {
      const chunk = articleRows.slice(i, i + UPSERT_CHUNK);
      const { error } = await supabase
        .from("articles")
        .upsert(chunk, { onConflict: "pmid" });

      if (error) throw new Error(`Articles upsert failed (chunk ${i}): ${error.message}`);
      storedArticles += chunk.length;
    }

    // ── 7. Advance watermark (only after durable upsert) ──────────────────────

    await setTopicWatermark(topic.id, maxdate, supabase);
    console.log("[ingest] Watermark advanced to", maxdate);

    // ── 8. Optional summarization ─────────────────────────────────────────────

    let storedSummaries = 0;

    if (summarize && maxSummaries > 0) {
      // Only attempt articles that have an abstract
      const withAbstract = records.filter((r) => Boolean(r.abstract?.trim()));

      // Skip PMIDs that already have a summary for this topic
      const candidatePmids = withAbstract.map((r) => r.pmid);
      const { data: existingRows } = await supabase
        .from("summaries")
        .select("pmid")
        .eq("topic_id", topic.id)
        .in("pmid", candidatePmids.slice(0, 1000));

      const alreadySummarized = new Set(
        (existingRows ?? []).map((row: { pmid: string }) => row.pmid)
      );

      const toSummarize = withAbstract
        .filter((r) => !alreadySummarized.has(r.pmid))
        .slice(0, maxSummaries);

      console.log("[ingest] Summarizing", toSummarize.length, "new records",
        `(skipping ${alreadySummarized.size} already done)`);

      // ── Parallel batches ──────────────────────────────────────────────────
      // Process SUMMARIZE_CONCURRENCY articles at a time to stay well within
      // Vercel's 300 s limit: 5 parallel × ~4 s each = ~4 s per batch.
      // 100 articles / 5 = 20 batches × 4 s ≈ 80 s total.

      for (let i = 0; i < toSummarize.length; i += SUMMARIZE_CONCURRENCY) {
        const batch = toSummarize.slice(i, i + SUMMARIZE_CONCURRENCY);

        const batchResults = await Promise.allSettled(
          batch.map(async (r) => {
            const summaryText = await summarizeAbstract(r.abstract!);
            const classification = await classifyStudyAbstract({
              title: r.title,
              abstract: r.abstract,
              publicationTypes: r.publicationTypes,
            });

            const { error: sumErr } = await supabase.from("summaries").upsert(
              {
                topic_id: topic.id,
                pmid: r.pmid,
                summary_text: summaryText,
                subheading: classification.study_subheading,
                label: classification.study_label,
              },
              { onConflict: "topic_id,pmid" }
            );

            if (sumErr) throw new Error(`upsert failed: ${sumErr.message}`);
            return r.pmid;
          })
        );

        for (const res of batchResults) {
          if (res.status === "fulfilled") {
            storedSummaries++;
          } else {
            console.warn("[ingest] Summary batch error:", res.reason);
          }
        }

        console.log(`[ingest] Summaries: batch ${Math.floor(i / SUMMARIZE_CONCURRENCY) + 1} done`,
          `(${storedSummaries} / ${toSummarize.length} so far)`);
      }
    }

    console.log("[ingest] Complete", { storedArticles, storedSummaries });

    return NextResponse.json({
      ok: true,
      topicId: topic.id,
      topicName: topic.name,
      startedAt,
      completedAt: new Date().toISOString(),
      // Window
      mindate,
      maxdate,
      isFirstRun,
      watermarkBefore: watermarkUsed,
      watermarkAfter: maxdate,
      // Counts
      totalPmidsFound,
      totalPmidsAfterDedupe,
      recordsParsed,
      storedArticles,
      storedSummaries,
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
