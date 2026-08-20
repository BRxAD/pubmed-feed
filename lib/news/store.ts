import "server-only";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import {
  fetchArticleImageUrl,
  parseRssXml,
} from "@/lib/news/parseRss";
import { NEWS_SOURCES, matchesNewsTopic } from "@/lib/news/sources";
import type { NewsItem, NewsItemStatus } from "@/lib/news/types";
import { isHttpUrl } from "@/lib/news/url";

export type { NewsItem, NewsItemStatus };

const FETCH_TIMEOUT_MS = 12_000;
const MAX_PER_FEED = 25;
/** Cap HTML og:image lookups per cron run (external sites, not Supabase). */
const MAX_OG_IMAGE_FETCHES = 12;
/** Homepage + approval queue only keep items from this many days. */
export const NEWS_MAX_AGE_DAYS = 7;

const NEWS_SELECT =
  "id, source_id, guid, title, url, published_at, summary, image_url, status, approved_at, created_at";

function newsCutoffIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - NEWS_MAX_AGE_DAYS);
  return d.toISOString();
}

/** Prefer publish date; fall back to ingest time. */
function newsItemInstant(item: {
  publishedAt: string | null;
  createdAt: string;
}): number | null {
  const raw = item.publishedAt || item.createdAt;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : t;
}

function isWithinNewsWindow(item: {
  publishedAt: string | null;
  createdAt: string;
}): boolean {
  const t = newsItemInstant(item);
  if (t == null) return false;
  return t >= Date.parse(newsCutoffIso());
}

/** Newest first by publish (then created). */
function sortNewsNewestFirst(items: NewsItem[]): NewsItem[] {
  return [...items].sort((a, b) => {
    const ta = newsItemInstant(a) ?? 0;
    const tb = newsItemInstant(b) ?? 0;
    return tb - ta;
  });
}

type NewsRow = {
  id: string;
  source_id: string;
  guid: string;
  title: string;
  url: string;
  published_at: string | null;
  summary: string | null;
  image_url: string | null;
  status: string;
  approved_at: string | null;
  created_at: string;
};

function mapRow(row: NewsRow): NewsItem {
  return {
    id: row.id,
    sourceId: row.source_id,
    guid: row.guid,
    title: row.title,
    url: row.url,
    publishedAt: row.published_at,
    summary: row.summary,
    imageUrl: row.image_url ?? null,
    status: row.status as NewsItemStatus,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
  };
}

async function fetchFeedXml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      Accept:
        "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      "User-Agent": "StewardshipBrief/1.0 (+https://www.stewardshipbrief.com)",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    throw new Error(`RSS HTTP ${res.status} for ${url}`);
  }
  return res.text();
}

/** Poll allowlisted feeds; upsert new rows as pending only. */
export async function ingestNewsFeeds(): Promise<{
  ok: boolean;
  sources: Array<{
    sourceId: string;
    fetched: number;
    kept: number;
    inserted: number;
    error?: string;
  }>;
  insertedTotal: number;
}> {
  const supabase = getSupabaseServerClient();
  const sources: Array<{
    sourceId: string;
    fetched: number;
    kept: number;
    inserted: number;
    error?: string;
  }> = [];
  let insertedTotal = 0;
  let ogFetches = 0;

  for (const source of NEWS_SOURCES) {
    try {
      const xml = await fetchFeedXml(source.feedUrl);
      const parsed = parseRssXml(xml).slice(0, MAX_PER_FEED);
      const kept = parsed.filter((item) => {
        if (!source.requireTopicMatch) return true;
        const hay = `${item.title}\n${item.summary ?? ""}`;
        return matchesNewsTopic(hay);
      });

      let inserted = 0;
      for (const item of kept) {
        if (!isHttpUrl(item.url)) continue;
        // Skip stale RSS items outside the rolling window.
        if (item.publishedAt) {
          const t = Date.parse(item.publishedAt);
          if (!Number.isNaN(t) && t < Date.parse(newsCutoffIso())) continue;
        }

        let imageUrl = item.imageUrl;
        if (!imageUrl && ogFetches < MAX_OG_IMAGE_FETCHES) {
          ogFetches += 1;
          imageUrl = await fetchArticleImageUrl(item.url);
        }

        const { error, data } = await supabase
          .from("news_items")
          .upsert(
            {
              source_id: source.id,
              guid: item.guid.slice(0, 500),
              title: item.title.slice(0, 500),
              url: item.url.slice(0, 2000),
              published_at: item.publishedAt,
              summary: item.summary,
              image_url: imageUrl,
              // Do not overwrite status on conflict — only insert new guids.
            },
            {
              onConflict: "source_id,guid",
              ignoreDuplicates: true,
            }
          )
          .select("id");

        if (error) {
          // Table missing or RLS — surface once per source.
          if (error.message.toLowerCase().includes("news_items")) {
            throw error;
          }
          console.warn("[news] upsert", source.id, error.message);
          continue;
        }
        if (data && data.length > 0) inserted += data.length;
      }

      insertedTotal += inserted;
      sources.push({
        sourceId: source.id,
        fetched: parsed.length,
        kept: kept.length,
        inserted,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[news] feed failed", source.id, message);
      sources.push({
        sourceId: source.id,
        fetched: 0,
        kept: 0,
        inserted: 0,
        error: message,
      });
    }
  }

  return { ok: true, sources, insertedTotal };
}

export async function listNewsItems(options: {
  status: NewsItemStatus | "all";
  limit?: number;
}): Promise<NewsItem[]> {
  const supabase = getSupabaseServerClient();
  const limit = Math.min(100, Math.max(1, options.limit ?? 40));
  let q = supabase
    .from("news_items")
    .select(NEWS_SELECT)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (options.status !== "all") {
    q = q.eq("status", options.status);
  }

  const { data, error } = await q;
  if (error) {
    if (error.message.toLowerCase().includes("news_items")) return [];
    throw new Error(error.message);
  }
  return sortNewsNewestFirst(
    ((data ?? []) as NewsRow[])
      .map(mapRow)
      .filter((item) => isHttpUrl(item.url) && isWithinNewsWindow(item))
  );
}

export async function listApprovedNewsForBrief(
  limit = 6
): Promise<NewsItem[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("news_items")
    .select(NEWS_SELECT)
    .eq("status", "approved")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(Math.min(40, Math.max(1, limit * 3)));

  if (error) {
    if (error.message.toLowerCase().includes("news_items")) return [];
    throw new Error(error.message);
  }
  return sortNewsNewestFirst(
    ((data ?? []) as NewsRow[])
      .map(mapRow)
      .filter((item) => isHttpUrl(item.url) && isWithinNewsWindow(item))
  ).slice(0, Math.min(12, Math.max(1, limit)));
}

export async function setNewsItemStatus(
  id: string,
  status: "approved" | "rejected" | "pending"
): Promise<NewsItem | null> {
  const supabase = getSupabaseServerClient();
  const patch: Record<string, unknown> = { status };
  if (status === "approved") {
    patch.approved_at = new Date().toISOString();
  } else {
    patch.approved_at = null;
  }

  const { data, error } = await supabase
    .from("news_items")
    .update(patch)
    .eq("id", id)
    .select(NEWS_SELECT)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapRow(data as NewsRow);
}
