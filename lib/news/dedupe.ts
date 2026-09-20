import type { NewsItem } from "@/lib/news/types";

/** Strip tracking params and normalize host/path so the same article matches across feeds. */
export function normalizeNewsUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = "";
    for (const key of [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
      "fbclid",
      "gclid",
    ]) {
      u.searchParams.delete(key);
    }
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    const path = u.pathname.replace(/\/+$/, "") || "";
    const search = u.searchParams.toString();
    return `${u.protocol}//${host}${path}${search ? `?${search}` : ""}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

/** Title key for near-duplicate headlines (ignore source suffixes / punctuation). */
export function normalizeNewsTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s*[-–—|•·].*$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function newsStoryKeys(item: Pick<NewsItem, "url" | "title">): {
  urlKey: string;
  titleKey: string;
} {
  return {
    urlKey: normalizeNewsUrl(item.url),
    titleKey: normalizeNewsTitle(item.title),
  };
}

/**
 * Keep the first occurrence of each story (list should already be newest-first).
 * Dedupes by normalized URL and by normalized title when the title is long enough.
 */
export function dedupeNewsStories(items: NewsItem[]): NewsItem[] {
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const out: NewsItem[] = [];

  for (const item of items) {
    const { urlKey, titleKey } = newsStoryKeys(item);

    if (urlKey && seenUrls.has(urlKey)) continue;
    if (titleKey.length >= 20 && seenTitles.has(titleKey)) continue;

    if (urlKey) seenUrls.add(urlKey);
    if (titleKey.length >= 20) seenTitles.add(titleKey);
    out.push(item);
  }

  return out;
}
