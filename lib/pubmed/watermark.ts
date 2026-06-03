import type { SupabaseClient } from "@supabase/supabase-js";

// ── Date helpers ──────────────────────────────────────────────────────────────

/** Today as YYYY-MM-DD (UTC). */
export function getTodayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** N days ago as YYYY-MM-DD (UTC). */
export function getDateNDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Convert YYYY-MM-DD → YYYY/MM/DD for the PubMed API. */
export function formatDateForPubMed(date: string): string {
  return date.trim().replace(/-/g, "/");
}

// ── Watermark read/write ──────────────────────────────────────────────────────

type IngestStateRow = { last_crdt_max: string };

/**
 * Return the last successfully ingested CRDT max date for this topic,
 * or null if no watermark exists yet (first run) or the table is missing.
 */
export async function getTopicWatermark(
  topicId: string,
  supabase: SupabaseClient
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("pubmed_ingest_state")
      .select("last_crdt_max")
      .eq("topic_id", topicId)
      .maybeSingle();

    if (error) {
      console.warn("[watermark] getTopicWatermark error:", error.message);
      return null;
    }
    return (data as IngestStateRow | null)?.last_crdt_max ?? null;
  } catch (err) {
    console.warn("[watermark] getTopicWatermark threw:", err);
    return null;
  }
}

/**
 * Persist the new CRDT max date after a successful ingest.
 * Call only after articles have been durably upserted.
 */
export async function setTopicWatermark(
  topicId: string,
  maxdate: string,
  supabase: SupabaseClient
): Promise<void> {
  try {
    const { error } = await supabase.from("pubmed_ingest_state").upsert(
      {
        topic_id: topicId,
        last_crdt_max: maxdate,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "topic_id" }
    );
    if (error) {
      console.warn("[watermark] setTopicWatermark error:", error.message);
    }
  } catch (err) {
    console.warn("[watermark] setTopicWatermark threw:", err);
  }
}

// ── Window computation ────────────────────────────────────────────────────────

/**
 * How many days back to search when there is no prior watermark (first run).
 * 30 days gives a reasonable cold-start coverage without hitting rate limits.
 */
const DEFAULT_INITIAL_DAYS_BACK = 30;

/**
 * Overlap before the last watermark to catch any records that arrived late
 * (e.g. PubMed indexing delays).
 */
const OVERLAP_DAYS = 1;

/**
 * Compute the CRDT date window for this ingest run.
 *
 * - Cold start (no watermark): mindate = 30 days ago, maxdate = today
 * - Warm run (watermark exists): mindate = watermark − 1 day, maxdate = today
 *
 * The 1-day overlap handles PubMed's occasional late-arriving records.
 */
export function computeSearchWindow(lastCrdtMax: string | null): {
  mindate: string;
  maxdate: string;
  isFirstRun: boolean;
} {
  const maxdate = getTodayISO();

  if (lastCrdtMax) {
    const d = new Date(lastCrdtMax);
    if (!Number.isNaN(d.getTime())) {
      d.setUTCDate(d.getUTCDate() - OVERLAP_DAYS);
      return { mindate: d.toISOString().slice(0, 10), maxdate, isFirstRun: false };
    }
  }

  return {
    mindate: getDateNDaysAgo(DEFAULT_INITIAL_DAYS_BACK),
    maxdate,
    isFirstRun: true,
  };
}
