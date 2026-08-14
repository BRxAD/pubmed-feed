import "server-only";
import { unstable_cache } from "next/cache";
import { getBriefItems, type BriefItem } from "@/lib/brief/items";
import { BRIEF_ARTICLE_WINDOW_DAYS } from "@/lib/brief/priority";
import { applyStickyHomepageLead } from "@/lib/brief/leadStory";
import {
  assignStoryImages,
  type StoryImageMatch,
} from "@/lib/brief/storyImages";

/** Bust on ingest and admin priority/setting changes. */
export const BRIEF_HOMEPAGE_CACHE_TAG = "brief-homepage";

/** Ready payload (All pool + sticky lead + story images) — ~1 h TTL. */
const HOMEPAGE_READY_CACHE_SECONDS = 3600;

export type HomepageReadyPayload = {
  items: BriefItem[];
  images: Record<string, StoryImageMatch | null>;
};

async function loadHomepageReady(): Promise<HomepageReadyPayload> {
  const brief = await getBriefItems({
    setting: "",
    // Article-date window is authoritative; created_at is not used as a
    // gate here (backfill would crowd out recent pubs).
    daysBack: 90,
    maxLookbackDays: 90,
    maxItems: 50,
    articleDateWithinDays: BRIEF_ARTICLE_WINDOW_DAYS,
  });
  const items = await applyStickyHomepageLead(brief.items, "");
  const images = await assignStoryImages(items);
  return { items, images };
}

const loadCachedHomepageReady = unstable_cache(
  loadHomepageReady,
  ["brief-homepage-ready-v2"],
  {
    revalidate: HOMEPAGE_READY_CACHE_SECONDS,
    tags: [BRIEF_HOMEPAGE_CACHE_TAG],
  }
);

/** Cached All-pool Brief + sticky lead + story images (~1 h). */
export async function getCachedHomepageReady(): Promise<HomepageReadyPayload> {
  return loadCachedHomepageReady();
}
