import "server-only";
import { unstable_cache } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

/** ~1 h — two head counts only; not busted on every signup (egress). */
export const ACCOUNT_SIGNUP_STATS_CACHE_TAG = "account-signup-stats";
const ACCOUNT_SIGNUP_STATS_SECONDS = 60 * 60;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type AccountSignupStats = {
  total: number;
  thisWeek: number;
};

async function fetchAccountSignupStatsUncached(): Promise<AccountSignupStats> {
  const supabase = getSupabaseServerClient();
  const weekAgoIso = new Date(Date.now() - WEEK_MS).toISOString();

  const [totalRes, weekRes] = await Promise.all([
    supabase.from("auth_users").select("id", { count: "exact", head: true }),
    supabase
      .from("auth_users")
      .select("id", { count: "exact", head: true })
      .gte("created_at", weekAgoIso),
  ]);

  if (totalRes.error) {
    console.warn("[accountSignupStats] total", totalRes.error.message);
  }
  if (weekRes.error) {
    console.warn("[accountSignupStats] week", weekRes.error.message);
  }

  return {
    total: totalRes.count ?? 0,
    thisWeek: weekRes.count ?? 0,
  };
}

const loadCached = unstable_cache(
  fetchAccountSignupStatsUncached,
  ["account-signup-stats-v1"],
  {
    revalidate: ACCOUNT_SIGNUP_STATS_SECONDS,
    tags: [ACCOUNT_SIGNUP_STATS_CACHE_TAG],
  }
);

/** Registered-account totals for /feed (cached ~1h). */
export async function getCachedAccountSignupStats(): Promise<AccountSignupStats> {
  return loadCached();
}
