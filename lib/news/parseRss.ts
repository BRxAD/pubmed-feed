import "server-only";
import { XMLParser } from "fast-xml-parser";
import {
  firstHttpHrefFromHtml,
  isHttpUrl,
  pickHttpUrl,
} from "@/lib/news/url";

export type ParsedRssItem = {
  guid: string;
  title: string;
  url: string;
  publishedAt: string | null;
  summary: string | null;
  imageUrl: string | null;
};

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function textOf(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object" && v !== null) {
    const o = v as Record<string, unknown>;
    if (typeof o["#text"] === "string") return o["#text"].trim();
    if (typeof o["@_href"] === "string") return o["@_href"].trim();
    if (typeof o["@_url"] === "string") return o["@_url"].trim();
    if (typeof o.url === "string") return o.url.trim();
  }
  return "";
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trim()}…`;
}

function parseDate(raw: string): string | null {
  if (!raw.trim()) return null;
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}

function normalizeImageUrl(raw: string): string | null {
  const u = raw.trim();
  if (!/^https?:\/\//i.test(u)) return null;
  // Skip tracking pixels / tiny icons.
  if (/\b(1x1|pixel|spacer|blank)\b/i.test(u)) return null;
  return u.slice(0, 2000);
}

function imageFromHtml(html: string): string | null {
  if (!html) return null;
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (!match?.[1]) return null;
  return normalizeImageUrl(match[1]);
}

function mediaUrl(node: unknown): string | null {
  if (node == null) return null;
  for (const entry of asArray(node)) {
    if (typeof entry === "string") {
      const u = normalizeImageUrl(entry);
      if (u) return u;
      continue;
    }
    const o = entry as Record<string, unknown>;
    const type = textOf(o["@_type"]) || textOf(o.type);
    const medium = textOf(o["@_medium"]) || textOf(o.medium);
    const url =
      textOf(o["@_url"]) ||
      textOf(o.url) ||
      textOf(o["@_href"]) ||
      textOf(o["#text"]);
    const looksImage =
      !type ||
      type.startsWith("image/") ||
      medium === "image" ||
      /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url);
    if (url && looksImage) {
      const u = normalizeImageUrl(url);
      if (u) return u;
    }
  }
  return null;
}

/** Prefer RSS media tags, enclosure, then first <img> in description HTML. */
export function extractRssImage(item: Record<string, unknown>): string | null {
  const fromMedia =
    mediaUrl(item["media:thumbnail"]) ||
    mediaUrl(item["media:content"]) ||
    mediaUrl(item.thumbnail) ||
    mediaUrl(item.enclosure);
  if (fromMedia) return fromMedia;

  const descRaw =
    (typeof item.description === "string" ? item.description : "") ||
    (typeof item["content:encoded"] === "string"
      ? item["content:encoded"]
      : "") ||
    textOf(item.description) ||
    textOf(item["content:encoded"]);
  return imageFromHtml(descRaw);
}

/**
 * Best-effort og:image / twitter:image from the article page.
 * Used only at ingest when RSS has no image. Short timeout; failures are fine.
 */
export async function fetchArticleImageUrl(
  articleUrl: string
): Promise<string | null> {
  try {
    const res = await fetch(articleUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "User-Agent":
          "StewardshipBrief/1.0 (+https://www.stewardshipbrief.com)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(5_000),
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("html") && !ct.includes("xml") && ct !== "") {
      // Some CDNs omit content-type; still try a small body sniff.
      if (!ct.includes("text") && ct.length > 0) return null;
    }
    const html = (await res.text()).slice(0, 120_000);
    const patterns = [
      /property=["']og:image:secure_url["'][^>]*content=["']([^"']+)["']/i,
      /property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
      /content=["']([^"']+)["'][^>]*property=["']og:image["']/i,
      /name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i,
      /content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i,
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m?.[1]) {
        const u = normalizeImageUrl(m[1]);
        if (u) return u;
      }
    }
    return imageFromHtml(html);
  } catch {
    return null;
  }
}

function linkCandidates(item: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const link of asArray(item.link as unknown)) {
    if (typeof link === "string") {
      out.push(link);
      continue;
    }
    const o = link as Record<string, unknown>;
    const href =
      textOf(o["@_href"]) || textOf(o["#text"]) || textOf(o.url);
    if (href) out.push(href);
  }
  const atom = item["atom:link"] ?? item["a10:link"];
  for (const link of asArray(atom as unknown)) {
    if (typeof link === "string") {
      out.push(link);
      continue;
    }
    const o = link as Record<string, unknown>;
    const href = textOf(o["@_href"]);
    if (href) out.push(href);
  }
  const guid = textOf(item.guid);
  if (guid) out.push(guid);
  const descRaw =
    (typeof item.description === "string" ? item.description : "") ||
    (typeof item["content:encoded"] === "string"
      ? item["content:encoded"]
      : "") ||
    textOf(item.description) ||
    textOf(item["content:encoded"]);
  const fromHtml = firstHttpHrefFromHtml(descRaw);
  if (fromHtml) out.push(fromHtml);
  return out;
}

/**
 * Parse RSS 2.0 or Atom XML into slim items (title, link, date, short summary, image).
 */
export function parseRssXml(xml: string): ParsedRssItem[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: true,
  });
  const doc = parser.parse(xml) as Record<string, unknown>;

  const channel = (doc.rss as { channel?: unknown } | undefined)?.channel as
    | Record<string, unknown>
    | undefined;
  const atomFeed = doc.feed as Record<string, unknown> | undefined;

  const rssItems = asArray(channel?.item as unknown);
  if (rssItems.length > 0) {
    return rssItems
      .map((raw) => {
        const item = raw as Record<string, unknown>;
        const title = stripHtml(textOf(item.title));
        const url = pickHttpUrl(...linkCandidates(item));
        const guid =
          textOf(item.guid) || url || `${title}|${textOf(item.pubDate)}`;
        const summary = truncate(
          stripHtml(
            textOf(item.description) || textOf(item["content:encoded"])
          ),
          280
        );
        if (!title || !url || !isHttpUrl(url)) return null;
        return {
          guid,
          title,
          url,
          publishedAt: parseDate(textOf(item.pubDate) || textOf(item.published)),
          summary: summary || null,
          imageUrl: extractRssImage(item),
        } satisfies ParsedRssItem;
      })
      .filter((x): x is ParsedRssItem => x != null);
  }

  const atomEntries = asArray(atomFeed?.entry as unknown);
  return atomEntries
    .map((raw) => {
      const entry = raw as Record<string, unknown>;
      const title = stripHtml(textOf(entry.title));
      const links = asArray(entry.link as unknown);
      const hrefs: string[] = [];
      for (const link of links) {
        if (typeof link === "string") {
          hrefs.push(link);
          continue;
        }
        const o = link as Record<string, unknown>;
        const href = textOf(o["@_href"]);
        const rel = textOf(o["@_rel"]) || "alternate";
        if (href && (rel === "alternate" || rel === "")) hrefs.unshift(href);
        else if (href) hrefs.push(href);
      }
      const summaryRaw = textOf(entry.summary) || textOf(entry.content);
      const url = pickHttpUrl(
        ...hrefs,
        firstHttpHrefFromHtml(summaryRaw),
        textOf(entry.id)
      );
      const guid = textOf(entry.id) || url || title;
      const summary = truncate(stripHtml(summaryRaw), 280);
      if (!title || !url || !isHttpUrl(url)) return null;
      return {
        guid,
        title,
        url,
        publishedAt: parseDate(
          textOf(entry.published) || textOf(entry.updated)
        ),
        summary: summary || null,
        imageUrl:
          extractRssImage(entry) ||
          mediaUrl(entry["media:thumbnail"]) ||
          mediaUrl(entry["media:content"]),
      } satisfies ParsedRssItem;
    })
    .filter((x): x is ParsedRssItem => x != null);
}
