import "server-only";
import { unstable_cache } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

/** ~24 h — head count only; not busted on every rating (egress). */
export const HUMAN_RATED_TOTAL_CACHE_TAG = "human-rated-total";
const HUMAN_RATED_TOTAL_SECONDS = 60 * 60 * 24;

async function fetchHumanRatedTotalUncached(topicId: string): Promise<number> {
  const supabase = getSupabaseServerClient();
  // Exact count, no row bodies — only summaries with a human grade.
  const { count, error } = await supabase
    .from("summaries")
    .select("pmid", { count: "exact", head: true })
    .eq("topic_id", topicId)
    .not("admin_priority", "is", null);

  if (error) {
    console.warn("[humanRatingStats]", error.message);
    return 0;
  }
  return count ?? 0;
}

const loadCached = unstable_cache(
  fetchHumanRatedTotalUncached,
  ["human-rated-total-v1"],
  { revalidate: HUMAN_RATED_TOTAL_SECONDS, tags: [HUMAN_RATED_TOTAL_CACHE_TAG] }
);

/** Total human-rated summaries for a topic (cached ~24h). */
export async function getCachedHumanRatedTotal(
  topicId: string
): Promise<number> {
  if (!topicId.trim()) return 0;
  return loadCached(topicId);
}
