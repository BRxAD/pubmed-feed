import type { OpenAlexRecord } from "@/lib/openalex/works";
import { normalizeDoi } from "@/lib/doi";

const CROSSREF_DELAY_MS = 80;
const CROSSREF_ROWS = 100;
/** Safety cap: 28 days of these journals never needs this many pages. */
const CROSSREF_MAX_PAGES = 8;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** YYYY-MM-DD, or null if unparseable. */
export function toDateOnly(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  if (/^\d{4}$/.test(trimmed)) return `${trimmed}-01-01`;
  const d = new Date(trimmed.includes("T") ? trimmed : `${trimmed}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * OpenAlex often copies a Crossref year-only `issued` date as YYYY-01-01.
 * Real online dates (DOI / created) are later in the year.
 */
export function isCoarseOpenAlexDate(
  publicationDate: string | null | undefined,
  createdDate: string | null | undefined
): boolean {
  const raw = publicationDate?.trim() ?? "";
  if (!raw) return true;
  if (/^\d{4}$/.test(raw)) return true;
  const pub = toDateOnly(raw);
  if (!pub) return true;
  if (!pub.endsWith("-01-01")) return false;
  const created = toDateOnly(createdDate);
  if (!created) return true;
  return created > pub;
}

function datePartsToIso(parts: unknown): string | null {
  if (!Array.isArray(parts) || parts.length < 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (
    !Number.isInteger(y) ||
    !Number.isInteger(m) ||
    !Number.isInteger(d) ||
    m < 1 ||
    m > 12 ||
    d < 1 ||
    d > 31
  ) {
    return null;
  }
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function fromCrossrefDate(field: unknown): string | null {
  if (!field || typeof field !== "object") return null;
  const parts = (field as { "date-parts"?: unknown })["date-parts"];
  if (!Array.isArray(parts) || !Array.isArray(parts[0])) return null;
  return datePartsToIso(parts[0]);
}

function politeMailto(): string | null {
  const mail =
    process.env.OPENALEX_MAILTO?.trim() || process.env.NCBI_EMAIL?.trim();
  return mail?.includes("@") ? mail : null;
}

function crossrefHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  const mailto = politeMailto();
  if (mailto) {
    headers["User-Agent"] = `StewardshipBrief/1.0 (mailto:${mailto})`;
  }
  return headers;
}

/** DOI Crossref published-online (day precision), else Crossref created. */
export async function fetchCrossrefOnlineDate(
  doi: string
): Promise<string | null> {
  const id = normalizeDoi(doi);
  if (!id) return null;

  let res: Response;
  try {
    res = await fetch(
      `https://api.crossref.org/works/${encodeURIComponent(id)}`,
      { headers: crossrefHeaders(), next: { revalidate: 0 } }
    );
  } catch (err) {
    console.warn(
      "[openalex dates] Crossref fetch failed:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
  if (!res.ok) return null;

  let body: { message?: Record<string, unknown> };
  try {
    body = (await res.json()) as { message?: Record<string, unknown> };
  } catch {
    return null;
  }
  const msg = body.message ?? {};
  return (
    fromCrossrefDate(msg["published-online"]) ??
    fromCrossrefDate(msg.published) ??
    fromCrossrefDate(msg.created)
  );
}

/**
 * DOIs in our journals with a real Crossref published-online date in the window.
 * OpenAlex often stamps these as YYYY-01-01, so they miss the publication-date filter.
 */
export async function listCrossrefOnlineDois(options: {
  issns: readonly string[];
  mindate: string;
  maxdate: string;
}): Promise<Map<string, string>> {
  const { issns, mindate, maxdate } = options;
  const out = new Map<string, string>();
  const uniqueIssns = [...new Set(issns)];

  for (const issn of uniqueIssns) {
    let cursor: string | null = "*";
    let pages = 0;
    while (cursor && pages < CROSSREF_MAX_PAGES) {
      const params = new URLSearchParams({
        filter: [
          `issn:${issn}`,
          `from-online-pub-date:${mindate}`,
          `until-online-pub-date:${maxdate}`,
          "type:journal-article",
        ].join(","),
        rows: String(CROSSREF_ROWS),
        cursor,
        select: "DOI,published-online,created",
      });
      let res: Response;
      try {
        res = await fetch(`https://api.crossref.org/works?${params.toString()}`, {
          headers: crossrefHeaders(),
          next: { revalidate: 0 },
        });
      } catch (err) {
        console.warn(
          "[openalex dates] Crossref list failed:",
          issn,
          err instanceof Error ? err.message : err
        );
        break;
      }
      if (!res.ok) {
        console.warn(
          "[openalex dates] Crossref list HTTP",
          res.status,
          issn
        );
        break;
      }
      const body = (await res.json()) as {
        message?: {
          items?: Record<string, unknown>[];
          "next-cursor"?: string | null;
        };
      };
      const items = body.message?.items ?? [];
      for (const item of items) {
        const doi = normalizeDoi(
          typeof item.DOI === "string" ? item.DOI : null
        );
        const online =
          fromCrossrefDate(item["published-online"]) ??
          fromCrossrefDate(item.created);
        if (doi && online) out.set(doi, online);
      }
      pages++;
      // Crossref still sends next-cursor on the last page. Stop when the
      // page is short, or we would walk the cap on every ISSN (~minutes).
      if (items.length === 0 || items.length < CROSSREF_ROWS) break;
      const next = body.message?.["next-cursor"] || null;
      if (!next || next === cursor) break;
      cursor = next;
      await delay(CROSSREF_DELAY_MS);
    }
  }

  return out;
}

/**
 * Replace year-only OpenAlex dates with the DOI online date (Crossref),
 * else OpenAlex created_date.
 */
export async function refineOpenAlexRecordDates(
  records: OpenAlexRecord[]
): Promise<void> {
  for (const rec of records) {
    if (!isCoarseOpenAlexDate(rec.pubDate, rec.createdDate)) continue;
    let fromDoi: string | null = null;
    if (rec.doi) {
      fromDoi = await fetchCrossrefOnlineDate(rec.doi);
      await delay(CROSSREF_DELAY_MS);
    }
    rec.pubDate = fromDoi ?? rec.createdDate ?? rec.pubDate;
  }
}
