import "server-only";
import { unstable_cache } from "next/cache";
import { getBriefItems, type BriefFeedResult } from "@/lib/brief/items";
import { BRIEF_ARTICLE_WINDOW_DAYS } from "@/lib/brief/priority";
import type { BriefSettingFilter } from "@/lib/brief/settingFilter";

/** Bust on ingest and admin priority changes. */
export const BRIEF_HOMEPAGE_CACHE_TAG = "brief-homepage";
const BRIEF_HOMEPAGE_CACHE_SECONDS = 600;

async function loadHomepageBriefItems(
  setting: BriefSettingFilter
): Promise<BriefFeedResult> {
  return getBriefItems({
    setting,
    // Article-date window is authoritative; created_at is not used as a
    // gate here (backfill would crowd out recent pubs).
    daysBack: 90,
    maxLookbackDays: 90,
    maxItems: 50,
    articleDateWithinDays: BRIEF_ARTICLE_WINDOW_DAYS,
  });
}

const loadCachedHomepageBriefItems = unstable_cache(
  loadHomepageBriefItems,
  ["brief-homepage-items-v1"],
  { revalidate: BRIEF_HOMEPAGE_CACHE_SECONDS, tags: [BRIEF_HOMEPAGE_CACHE_TAG] }
);

/** Cached Brief candidate pool for the homepage (~10 min). */
export async function getCachedHomepageBriefItems(
  setting: BriefSettingFilter = ""
): Promise<BriefFeedResult> {
  return loadCachedHomepageBriefItems(setting);
}
