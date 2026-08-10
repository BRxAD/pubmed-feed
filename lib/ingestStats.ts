import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type IngestRunStats = {
  /** When the last PubMed ingest batch finished (ISO). */
  lastAt: string | null;
  /** Articles upserted in that batch (same fetched_at stamp). */
  ingestedCount: number;
  /** Distinct PMIDs newly summarized for this topic during that ingest window. */
  summarizedCount: number;
  /** Of those new summaries, how many have stored ml_priority ≥ 5. */
  mlPriorityGe5Count: number;
  /** Next scheduled ingest cron (ISO). */
  nextAt: string;
};

/**
 * PubMed ingest cron hours in UTC (Eastern Daylight: UTC−4):
 * 06:00 / 12:00 / 17:00 Eastern → 10:00 / 16:00 / 21:00 UTC.
 */
const INGEST_CRON_UTC_HOURS = [10, 16, 21] as const;

/** Next scheduled ingest instant after `now`. */
export function nextIngestAt(now = new Date()): Date {
  const candidates: Date[] = [];
  for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
    for (const hour of INGEST_CRON_UTC_HOURS) {
      const d = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() + dayOffset,
          hour,
          0,
          0,
          0
        )
      );
      if (d.getTime() > now.getTime()) candidates.push(d);
    }
  }
  candidates.sort((a, b) => a.getTime() - b.getTime());
  return candidates[0] ?? new Date(now.getTime() + 60 * 60 * 1000);
}

/**
 * Slim last-ingest stats for feed / dashboard.
 * Uses count-only + a small summaries slice (pmid + ml_priority) — not full
 * article/summary bodies. Safe for page loads on the free-tier egress budget.
 */
export async function loadLastIngestStats(
  supabase: SupabaseClient,
  topicId: string
): Promise<IngestRunStats> {
  const nextAt = nextIngestAt().toISOString();
  const empty: IngestRunStats = {
    lastAt: null,
    ingestedCount: 0,
    summarizedCount: 0,
    mlPriorityGe5Count: 0,
    nextAt,
  };

  const { data: newest } = await supabase
    .from("articles")
    .select("fetched_at")
    .eq("source", "pubmed")
    .not("fetched_at", "is", null)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const batchFetchedAt =
    typeof newest?.fetched_at === "string" ? newest.fetched_at : null;

  const { data: stateRow } = await supabase
    .from("pubmed_ingest_state")
    .select("updated_at")
    .eq("topic_id", topicId)
    .maybeSingle();

  const stateUpdated =
    typeof (stateRow as { updated_at?: string } | null)?.updated_at === "string"
      ? (stateRow as { updated_at: string }).updated_at
      : null;

  const lastAt = batchFetchedAt ?? stateUpdated;
  if (!batchFetchedAt) {
    return { ...empty, lastAt, nextAt };
  }

  // Count only — no article rows egressed.
  const { count: ingestedCount } = await supabase
    .from("articles")
    .select("pmid", { count: "exact", head: true })
    .eq("source", "pubmed")
    .eq("fetched_at", batchFetchedAt);

  const windowEnd = new Date(
    new Date(batchFetchedAt).getTime() + 45 * 60 * 1000
  ).toISOString();

  // Tiny rows: pmid + ml_priority for summaries created in this ingest window.
  const { data: sumRows } = await supabase
    .from("summaries")
    .select("pmid, ml_priority")
    .eq("topic_id", topicId)
    .gte("created_at", batchFetchedAt)
    .lte("created_at", windowEnd);

  const seen = new Set<string>();
  let mlPriorityGe5Count = 0;
  for (const row of sumRows ?? []) {
    const pmid = String((row as { pmid?: string }).pmid ?? "");
    if (!pmid || seen.has(pmid)) continue;
    seen.add(pmid);
    const ml = (row as { ml_priority?: number | null }).ml_priority;
    if (typeof ml === "number" && Number.isFinite(ml) && ml >= 5) {
      mlPriorityGe5Count += 1;
    }
  }

  return {
    lastAt,
    ingestedCount: ingestedCount ?? 0,
    summarizedCount: seen.size,
    mlPriorityGe5Count,
    nextAt,
  };
}
