import "server-only";
import { unstable_cache } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import type { FeedSourceFilter } from "@/lib/feedSource";
import {
  FEED_SELECT_KEYWORD_INDEX,
  FEED_SELECT_SLIM,
} from "@/lib/feedSelect";

/** Bust on ingest only (not every admin rating) to limit egress. */
export const FEED_SLIM_INDEX_CACHE_TAG = "feed-slim-index";
/** ~3 hours — filtered / keyword views; default browse uses SQL paging. */
const FEED_SLIM_INDEX_SECONDS = 60 * 60 * 3;

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
  source: FeedSourceFilter,
  mode: "corpus" | "keyword"
): Promise<Record<string, unknown>[]> {
  const topicIds = topicIdsKey.split(",").filter(Boolean);
  if (topicIds.length === 0) return [];

  const supabase = getSupabaseServerClient();
  const rows: Record<string, unknown>[] = [];
  let selectColumns =
    mode === "keyword" ? FEED_SELECT_KEYWORD_INDEX : FEED_SELECT_SLIM;

  for (let from = 0; from < SUPABASE_FETCH_SAFETY_MAX; from += SUPABASE_FETCH_PAGE) {
    let query = supabase
      .from("summaries")
      .select(selectColumns)
      .in("topic_id", topicIds)
      .order("created_at", { ascending: false })
      .range(from, from + SUPABASE_FETCH_PAGE - 1);

    query = applySourceFilter(query, source);

    let { data, error } = await query;
    const errMsg = error?.message?.toLowerCase() ?? "";
    if (
      errMsg.includes("ml_priority") ||
      errMsg.includes("auto_settings") ||
      errMsg.includes("admin_setting")
    ) {
      selectColumns = selectColumns
        .replace(", ml_priority", "")
        .replace(", auto_settings", "")
        .replace(", admin_setting", "");
      let retry = supabase
        .from("summaries")
        .select(selectColumns)
        .in("topic_id", topicIds)
        .order("created_at", { ascending: false })
        .range(from, from + SUPABASE_FETCH_PAGE - 1);
      retry = applySourceFilter(retry, source);
      const result = await retry;
      data = result.data;
      error = result.error;
    }
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as unknown as Record<string, unknown>[];
    rows.push(...batch);
    if (batch.length < SUPABASE_FETCH_PAGE) break;
  }

  return rows;
}

const loadCachedSlimSummaryRows = unstable_cache(
  fetchSlimSummaryRowsUncached,
  ["feed-slim-index-v3"],
  { revalidate: FEED_SLIM_INDEX_SECONDS, tags: [FEED_SLIM_INDEX_CACHE_TAG] }
);

/** Slim corpus for a topic set + source filter (cached ~3 h). */
export async function getCachedSlimSummaryRows(
  topicIds: string[],
  source: FeedSourceFilter,
  mode: "corpus" | "keyword" = "corpus"
): Promise<Record<string, unknown>[]> {
  const topicIdsKey = [...topicIds].sort().join(",");
  return loadCachedSlimSummaryRows(topicIdsKey, source, mode);
}
