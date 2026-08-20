import "server-only";
import { XMLParser } from "fast-xml-parser";

export type ParsedRssItem = {
  guid: string;
  title: string;
  url: string;
  publishedAt: string | null;
  summary: string | null;
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

/**
 * Parse RSS 2.0 or Atom XML into slim items (title, link, date, short summary).
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
        const url =
          textOf(item.link) ||
          textOf(item.guid) ||
          textOf((item["atom:link"] as { "@_href"?: string })?.["@_href"]);
        const guid =
          textOf(item.guid) || url || `${title}|${textOf(item.pubDate)}`;
        const summary = truncate(
          stripHtml(textOf(item.description) || textOf(item["content:encoded"])),
          280
        );
        if (!title || !url) return null;
        return {
          guid,
          title,
          url,
          publishedAt: parseDate(textOf(item.pubDate) || textOf(item.published)),
          summary: summary || null,
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
      let url = "";
      for (const link of links) {
        if (typeof link === "string") {
          url = link;
          break;
        }
        const o = link as Record<string, unknown>;
        const href = textOf(o["@_href"]);
        const rel = textOf(o["@_rel"]) || "alternate";
        if (href && (rel === "alternate" || !url)) url = href;
      }
      const guid = textOf(entry.id) || url || title;
      const summary = truncate(
        stripHtml(textOf(entry.summary) || textOf(entry.content)),
        280
      );
      if (!title || !url) return null;
      return {
        guid,
        title,
        url,
        publishedAt: parseDate(
          textOf(entry.published) || textOf(entry.updated)
        ),
        summary: summary || null,
      } satisfies ParsedRssItem;
    })
    .filter((x): x is ParsedRssItem => x != null);
}
