/**
 * Watermark-based incremental ingest from OpenAlex (same flow as PubMed ingest).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { passesClinicalInclusionFilter } from "@/lib/openalex/filter";
import { searchOpenAlexAllPages } from "@/lib/openalex/search";
import {
  getOpenAlexSearch,
  topicExcludesClinicalNoise,
  type TopicRow as TopicQueryRow,
} from "@/lib/topicQuery";
import {
  computeOpenAlexWindow,
  getOpenAlexWatermark,
  getDateNDaysAgo,
  getTodayISO,
  setOpenAlexWatermark,
} from "@/lib/openalex/watermark";
import { summarizeAbstract } from "@/lib/summarize";
import { classifyStudyAbstract } from "@/lib/classifyStudy";
import type { PubMedRecord } from "@/lib/pubmed/efetch";

export const runtime = "nodejs";
export const maxDuration = 300;

const DEFAULT_MAX_ARTICLES = 200;
const HARD_MAX_ARTICLES = 500;
const DEFAULT_MAX_SUMMARIES = 5;
const HARD_MAX_SUMMARIES = 100;
const SUMMARIZE_CONCURRENCY = 5;

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

type TopicRow = TopicQueryRow;

interface IngestParams {
  topicId: string | null;
  topicName: string | null;
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
    url.searchParams.forEach((v, k) => {
      src[k] = v;
    });
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

export async function GET(request: NextRequest) {
  return runIngest(request);
}

export async function POST(request: NextRequest) {
  return runIngest(request);
}

async function runIngest(request: NextRequest): Promise<NextResponse> {
  const startedAt = new Date().toISOString();
  console.log("[ingest/openalex] Start");

  try {
    const params = await getParams(request);
    const { topicId, topicName, daysBack, maxArticles, maxSummaries, summarize } =
      params;

    const supabase = getSupabase();

    let topic: TopicRow;

    if (topicName?.toLowerCase() === "main") {
      const { data: rows, error } = await supabase
        .from("topics")
        .select("id, name, query_string, openalex_query_string")
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
        .select("id, name, query_string, openalex_query_string")
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

    const pubmedQuery = topic.query_string?.trim();
    if (!pubmedQuery) {
      return NextResponse.json({ ok: false, error: "Topic has no query_string" }, { status: 400 });
    }

    const searchQuery = getOpenAlexSearch(topic);
    const excludeNoise = topicExcludesClinicalNoise(pubmedQuery);

    let mindate: string;
    let maxdate: string;
    let isFirstRun = false;
    let watermarkUsed: string | null = null;

    if (daysBack != null) {
      mindate = getDateNDaysAgo(daysBack);
      maxdate = getTodayISO();
    } else {
      watermarkUsed = await getOpenAlexWatermark(topic.id, supabase);
      const window = computeOpenAlexWindow(watermarkUsed);
      mindate = window.mindate;
      maxdate = window.maxdate;
      isFirstRun = window.isFirstRun;
    }

    console.log("[ingest/openalex] Search", { searchQuery, mindate, maxdate, maxArticles });

    const searchResult = await searchOpenAlexAllPages({
      search: searchQuery,
      mindate,
      maxdate,
      maxTotal: maxArticles,
    });

    const records = searchResult.records.filter((r) =>
      passesClinicalInclusionFilter(r, excludeNoise)
    );
    const totalFound = searchResult.count;
    const recordsParsed = records.length;

    if (records.length === 0) {
      await setOpenAlexWatermark(topic.id, maxdate, supabase);
      return NextResponse.json({
        ok: true,
        source: "openalex",
        topicId: topic.id,
        topicName: topic.name,
        searchQuery,
        mindate,
        maxdate,
        isFirstRun,
        totalFound,
        recordsParsed: 0,
        storedArticles: 0,
        storedSummaries: 0,
        watermarkAdvanced: true,
      });
    }

    const fetchedAt = new Date().toISOString();
    const todayStr = getTodayISO();

    const articleRows = records.map((r: PubMedRecord) => {
      const pubDate = toDateOnly(r.pubDate);
      const releaseDate = clampToToday(pubDate) ?? todayStr;
      return {
        pmid: r.pmid,
        title: r.title ?? null,
        abstract: r.abstract ?? null,
        journal: r.journal ?? null,
        pub_date: pubDate,
        release_date: releaseDate,
        publication_types: r.publicationTypes ?? [],
        keywords: r.keywords ?? [],
        mesh_terms: r.meshTerms ?? [],
        authors: r.authors ?? [],
        fetched_at: fetchedAt,
        source: "openalex",
      };
    });

    const UPSERT_CHUNK = 100;
    let storedArticles = 0;

    for (let i = 0; i < articleRows.length; i += UPSERT_CHUNK) {
      const chunk = articleRows.slice(i, i + UPSERT_CHUNK);
      const { error } = await supabase
        .from("articles")
        .upsert(chunk, { onConflict: "pmid" });

      if (error) {
        throw new Error(`Articles upsert failed (chunk ${i}): ${error.message}`);
      }
      storedArticles += chunk.length;
    }

    await setOpenAlexWatermark(topic.id, maxdate, supabase);

    let storedSummaries = 0;

    if (summarize && maxSummaries > 0) {
      const withAbstract = records.filter((r) => Boolean(r.abstract?.trim()));
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
          if (res.status === "fulfilled") storedSummaries++;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      source: "openalex",
      topicId: topic.id,
      topicName: topic.name,
      startedAt,
      completedAt: new Date().toISOString(),
      searchQuery,
      mindate,
      maxdate,
      isFirstRun,
      watermarkBefore: watermarkUsed,
      watermarkAfter: maxdate,
      totalFound,
      recordsParsed,
      storedArticles,
      storedSummaries,
      watermarkAdvanced: true,
      pages: searchResult.pages,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[ingest/openalex] Error", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
