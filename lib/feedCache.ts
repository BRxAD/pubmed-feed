import "server-only";
import { unstable_cache } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import type { FeedSourceFilter } from "@/lib/feedSource";
import { FEED_SELECT_SLIM } from "@/lib/feedSelect";

/** Bust on ingest and admin priority changes. */
export const FEED_SLIM_INDEX_CACHE_TAG = "feed-slim-index";
const FEED_SLIM_INDEX_SECONDS = 600;

const SUPABASE_FETCH_PAGE = 500;
const SUPABASE_FETCH_SAFETY_MAX = 20_000;

function applySourceFilter<T extends { eq: Function; or: Function }>(
  query: T,
  source: FeedSourceFilter
): T {
  if (source === "all") return query;
  if (source === "pubmed") {
    return query.or("source.eq.pubmed,source.is.null", {
      foreignTable: "articles",
    }) as T;
  }
  return query.eq("articles.source", source) as T;
}

async function fetchSlimSummaryRowsUncached(
  topicIdsKey: string,
  source: FeedSourceFilter
): Promise<Record<string, unknown>[]> {
  const topicIds = topicIdsKey.split(",").filter(Boolean);
  if (topicIds.length === 0) return [];

  const supabase = getSupabaseServerClient();
  const rows: Record<string, unknown>[] = [];

  for (let from = 0; from < SUPABASE_FETCH_SAFETY_MAX; from += SUPABASE_FETCH_PAGE) {
    let query = supabase
      .from("summaries")
      .select(FEED_SELECT_SLIM)
      .in("topic_id", topicIds)
      .order("created_at", { ascending: false })
      .range(from, from + SUPABASE_FETCH_PAGE - 1);

    query = applySourceFilter(query, source);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as unknown as Record<string, unknown>[];
    rows.push(...batch);
    if (batch.length < SUPABASE_FETCH_PAGE) break;
  }

  return rows;
}

const loadCachedSlimSummaryRows = unstable_cache(
  fetchSlimSummaryRowsUncached,
  ["feed-slim-index-v2"],
  { revalidate: FEED_SLIM_INDEX_SECONDS, tags: [FEED_SLIM_INDEX_CACHE_TAG] }
);

/** Slim corpus for a topic set + source filter (cached ~10 min). */
export async function getCachedSlimSummaryRows(
  topicIds: string[],
  source: FeedSourceFilter
): Promise<Record<string, unknown>[]> {
  const topicIdsKey = [...topicIds].sort().join(",");
  return loadCachedSlimSummaryRows(topicIdsKey, source);
}
