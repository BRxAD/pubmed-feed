import "server-only";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { listApprovedNewsForBrief } from "@/lib/news/store";
import {
  dedupeNewsStories,
  newsStoryKeys,
  normalizeNewsTitle,
  normalizeNewsUrl,
} from "@/lib/news/dedupe";
import type { NewsItem } from "@/lib/news/types";

export { dedupeNewsStories } from "@/lib/news/dedupe";

/** News item IDs already included in a prior brief digest email. */
export async function getPreviouslyEmailedNewsIds(): Promise<Set<string>> {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("brief_news_email_sends")
      .select("news_id")
      .limit(5000);

    if (error) {
      if (error.message.toLowerCase().includes("brief_news_email_sends")) {
        return new Set();
      }
      console.warn("[briefNewsSends] load failed:", error.message);
      return new Set();
    }

    return new Set(
      (data ?? [])
        .map((r) => String((r as { news_id?: string }).news_id ?? "").trim())
        .filter(Boolean)
    );
  } catch {
    return new Set();
  }
}

/** Load URL/title keys for news IDs already emailed (so duplicate rows are also skipped). */
async function getPreviouslyEmailedStoryKeys(
  sentIds: Set<string>
): Promise<{ urls: Set<string>; titles: Set<string> }> {
  const urls = new Set<string>();
  const titles = new Set<string>();
  if (sentIds.size === 0) return { urls, titles };

  try {
    const supabase = getSupabaseServerClient();
    const ids = [...sentIds].slice(0, 500);
    const { data, error } = await supabase
      .from("news_items")
      .select("url, title")
      .in("id", ids);

    if (error) {
      console.warn(
        "[briefNewsSends] load sent story keys failed:",
        error.message
      );
      return { urls, titles };
    }

    for (const row of data ?? []) {
      const { urlKey, titleKey } = newsStoryKeys({
        url: String((row as { url?: string }).url ?? ""),
        title: String((row as { title?: string }).title ?? ""),
      });
      if (urlKey) urls.add(urlKey);
      if (titleKey.length >= 20) titles.add(titleKey);
    }
  } catch (err) {
    console.warn("[briefNewsSends] load sent story keys failed:", err);
  }

  return { urls, titles };
}

/** Record that these news items have been included in an email brief. */
export async function recordBriefNewsEmailSends(
  newsIds: string[]
): Promise<void> {
  const unique = [...new Set(newsIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return;

  try {
    const supabase = getSupabaseServerClient();
    const rows = unique.map((news_id) => ({ news_id }));
    const { error } = await supabase
      .from("brief_news_email_sends")
      .upsert(rows, { onConflict: "news_id" });

    if (
      error &&
      !error.message.toLowerCase().includes("brief_news_email_sends")
    ) {
      console.warn("[briefNewsSends] record failed:", error.message);
    }
  } catch (err) {
    console.warn("[briefNewsSends] record failed:", err);
  }
}

/**
 * After a send, also mark other approved rows that are the same story
 * (same URL or same title) so they never appear in a later brief.
 */
async function recordDuplicateNewsAsSent(sentItems: NewsItem[]): Promise<void> {
  if (sentItems.length === 0) return;

  const sentUrls = new Set(
    sentItems.map((i) => normalizeNewsUrl(i.url)).filter(Boolean)
  );
  const sentTitles = new Set(
    sentItems
      .map((i) => normalizeNewsTitle(i.title))
      .filter((t) => t.length >= 20)
  );

  try {
    const pool = await listApprovedNewsForBrief(40);
    const duplicateIds = pool
      .filter((item) => {
        if (sentItems.some((s) => s.id === item.id)) return false;
        const { urlKey, titleKey } = newsStoryKeys(item);
        return (
          (urlKey && sentUrls.has(urlKey)) ||
          (titleKey.length >= 20 && sentTitles.has(titleKey))
        );
      })
      .map((item) => item.id);

    if (duplicateIds.length > 0) {
      await recordBriefNewsEmailSends(duplicateIds);
    }
  } catch (err) {
    console.warn("[briefNewsSends] record duplicates failed:", err);
  }
}

/**
 * Fetch approved news items that have never been sent in a prior email brief.
 * Defaults to up to 3 stories, newest published first.
 * Each story appears at most once (deduped by URL and title across feeds).
 */
export async function getUnsentApprovedNews(limit = 3): Promise<NewsItem[]> {
  try {
    const [allApproved, previouslySent] = await Promise.all([
      listApprovedNewsForBrief(Math.max(24, limit * 6)),
      getPreviouslyEmailedNewsIds(),
    ]);

    const sentKeys = await getPreviouslyEmailedStoryKeys(previouslySent);

    const unsent = allApproved.filter((item) => {
      if (previouslySent.has(item.id)) return false;
      const { urlKey, titleKey } = newsStoryKeys(item);
      if (urlKey && sentKeys.urls.has(urlKey)) return false;
      if (titleKey.length >= 20 && sentKeys.titles.has(titleKey)) return false;
      return true;
    });

    return dedupeNewsStories(unsent).slice(0, Math.max(1, limit));
  } catch (err) {
    console.warn("[briefNewsSends] getUnsentApprovedNews failed:", err);
    return [];
  }
}

/**
 * Record sent news IDs plus any duplicate rows for the same story.
 * Call after a successful brief email dispatch.
 */
export async function recordBriefNewsEmailSendsWithDuplicates(
  items: NewsItem[]
): Promise<void> {
  if (items.length === 0) return;
  await recordBriefNewsEmailSends(items.map((i) => i.id));
  await recordDuplicateNewsAsSent(items);
}
