/**
 * Admin daily-run endpoint.
 *
 * Ingests and summarizes articles for both the main stewardship feed
 * and the AI stewardship feed. Requires DAILY_RUN_SECRET for auth.
 *
 * Usage:
 *   GET /api/admin/daily-run?secret=<DAILY_RUN_SECRET>
 *   GET /api/admin/daily-run?secret=<DAILY_RUN_SECRET>&daysBack=14&maxSummaries=30
 *   Authorization: Bearer <DAILY_RUN_SECRET>
 *
 * Query params:
 *   secret        - auth secret (alternative to Authorization header)
 *   daysBack      - how many days back to search (default 14, max 60)
 *   limit         - max articles to ingest per feed (default 100, max 200)
 *   maxSummaries  - max summaries to generate per feed (default 20, max 100)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { searchPubMed } from "@/lib/pubmed/esearch";
import { fetchPubMedRecords } from "@/lib/pubmed/efetch";
import { summarizeAbstract } from "@/lib/summarize";
import { classifyStudyAbstract } from "@/lib/classifyStudy";

export const runtime = "nodejs";
export const maxDuration = 300;

const DEFAULT_DAYS_BACK = 14;
const DEFAULT_LIMIT = 500;
const DEFAULT_MAX_SUMMARIES = 20;
const MAX_LIMIT = 1000;
const MAX_SUMMARIES_CAP = 100;
const EFETCH_CHUNK_DELAY_MS = 11_000;

/** Parallel OpenAI calls per batch — keeps total time ~4 s per batch of 5. */
const SUMMARIZE_CONCURRENCY = 5;

type TopicRow = { id: string; name: string; query_string: string };

type RunResult = {
  topicId: string;
  topicName: string;
  found: number;
  processed: number;
  inserted: number;
  skipped: number;
  summarized: number;
  errors: string[];
};

function parseInteger(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key);
}

function toDateOnly(value: string | null | undefined): string | null {
  if (!value || !String(value).trim()) return null;
  const d = new Date(String(value).trim());
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function clampToToday(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const today = new Date().toISOString().slice(0, 10);
  return dateStr > today ? today : dateStr;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runOneTopic(
  supabase: ReturnType<typeof getSupabase>,
  topic: TopicRow,
  daysBack: number,
  limit: number,
  maxSummaries: number
): Promise<RunResult> {
  const errors: string[] = [];
  const result: RunResult = {
    topicId: topic.id,
    topicName: topic.name,
    found: 0,
    processed: 0,
    inserted: 0,
    skipped: 0,
    summarized: 0,
    errors,
  };

  // --- Search ---
  let pmids: string[] = [];
  try {
    pmids = await searchPubMed(topic.query_string, daysBack, limit);
  } catch (err) {
    errors.push(`searchPubMed: ${err instanceof Error ? err.message : String(err)}`);
    return result;
  }

  result.found = pmids.length;
  if (pmids.length === 0) return result;

  // --- Fetch records ---
  let records: Awaited<ReturnType<typeof fetchPubMedRecords>> = [];
  try {
    records = await fetchPubMedRecords(pmids);
  } catch (err) {
    errors.push(`fetchPubMedRecords: ${err instanceof Error ? err.message : String(err)}`);
    return result;
  }

  const validRecords = records.filter((r) => r?.pmid && /^\d+$/.test(r.pmid));
  result.processed = validRecords.length;

  const fetchedAt = new Date().toISOString();
  const todayStr = new Date().toISOString().slice(0, 10);

  const articleRows = validRecords.map((r) => {
    const pubDate = toDateOnly(r.pubDate);
    const articleDate = toDateOnly(r.articleDate ?? null);
    const epubDate = toDateOnly(r.epubDate ?? null);
    const pubmedDate = toDateOnly(r.pubmedDate ?? null);
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

  // --- Upsert articles ---
  const UPSERT_CHUNK = 50;
  let inserted = 0;
  for (let i = 0; i < articleRows.length; i += UPSERT_CHUNK) {
    const chunk = articleRows.slice(i, i + UPSERT_CHUNK);
    const { error } = await supabase.from("articles").upsert(chunk, { onConflict: "pmid" });
    if (error) {
      errors.push(`articles upsert chunk ${i}: ${error.message}`);
    } else {
      inserted += chunk.length;
    }
  }
  result.inserted = inserted;
  result.skipped = Math.max(0, result.processed - inserted);

  // --- Summarize ---
  if (maxSummaries <= 0) return result;

  const withAbstract = validRecords.filter((r) => Boolean(r.abstract?.trim()));

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

  console.log(`[daily-run] ${topic.name}: summarizing ${toSummarize.length} new`,
    `(skipping ${alreadySummarized.size} already done)`);

  let summarized = 0;

  // Process in parallel batches — ~4 s per batch of 5 vs. ~4 s per article
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

        if (sumErr) throw new Error(`upsert ${r.pmid}: ${sumErr.message}`);
        return r.pmid;
      })
    );

    for (const res of batchResults) {
      if (res.status === "fulfilled") {
        summarized++;
      } else {
        errors.push(`summarize: ${res.reason instanceof Error ? res.reason.message : String(res.reason)}`);
      }
    }
  }

  result.summarized = summarized;
  return result;
}

async function runDailyRun(request: NextRequest): Promise<NextResponse> {
  // --- Auth ---
  const secret = process.env.DAILY_RUN_SECRET;
  if (!secret || !secret.trim()) {
    return NextResponse.json({ ok: false, error: "DAILY_RUN_SECRET not configured" }, { status: 500 });
  }

  const url = request.nextUrl;
  const secretParam = url.searchParams.get("secret") ?? "";
  const authHeader = request.headers.get("authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const provided = secretParam || bearerToken;

  if (!provided || provided !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // --- Params ---
  const daysBack = Math.min(
    60,
    Math.max(1, parseInteger(url.searchParams.get("daysBack"), DEFAULT_DAYS_BACK))
  );
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInteger(url.searchParams.get("limit"), DEFAULT_LIMIT))
  );
  const maxSummaries = Math.min(
    MAX_SUMMARIES_CAP,
    Math.max(0, parseInteger(url.searchParams.get("maxSummaries"), DEFAULT_MAX_SUMMARIES))
  );

  const supabase = getSupabase();

  // --- Look up both topics ---
  const { data: allTopics, error: topicErr } = await supabase
    .from("topics")
    .select("id, name, query_string")
    .ilike("name", "%antimicrobial stewardship%")
    .limit(10);

  if (topicErr || !allTopics?.length) {
    return NextResponse.json(
      { ok: false, error: topicErr?.message ?? "No stewardship topics found" },
      { status: 404 }
    );
  }

  // Main feed: stewardship WITHOUT "artificial intelligence"
  const mainTopic = allTopics.find(
    (r: { name?: string | null }) =>
      !String(r.name ?? "").toLowerCase().includes("artificial intelligence")
  ) as TopicRow | undefined;

  // AI feed: stewardship WITH "artificial intelligence"
  const aiTopic = allTopics.find(
    (r: { name?: string | null }) =>
      String(r.name ?? "").toLowerCase().includes("artificial intelligence")
  ) as TopicRow | undefined;

  const startedAt = new Date().toISOString();
  const results: RunResult[] = [];

  if (mainTopic) {
    console.log("[daily-run] Starting main feed:", mainTopic.name);
    const mainResult = await runOneTopic(supabase, mainTopic, daysBack, limit, maxSummaries);
    results.push(mainResult);
    console.log("[daily-run] Main feed done:", mainResult);
    // Delay between feeds to respect NCBI rate limits
    if (aiTopic) await delay(EFETCH_CHUNK_DELAY_MS);
  }

  if (aiTopic) {
    console.log("[daily-run] Starting AI feed:", aiTopic.name);
    const aiResult = await runOneTopic(supabase, aiTopic, daysBack, limit, maxSummaries);
    results.push(aiResult);
    console.log("[daily-run] AI feed done:", aiResult);
  }

  if (!mainTopic && !aiTopic) {
    return NextResponse.json({ ok: false, error: "Neither main nor AI topic found" }, { status: 404 });
  }

  const totalErrors = results.flatMap((r) => r.errors);

  return NextResponse.json({
    ok: true,
    startedAt,
    completedAt: new Date().toISOString(),
    params: { daysBack, limit, maxSummaries },
    results,
    totalErrors: totalErrors.length > 0 ? totalErrors : undefined,
  });
}

export async function GET(request: NextRequest) {
  return runDailyRun(request);
}
