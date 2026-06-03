import { formatDateForPubMed } from "@/lib/pubmed/watermark";

const ESEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";

/**
 * PMIDs returned per ESearch page. 500 is a safe size:
 * - well within NCBI's 10,000 cap
 * - query-string is short enough for GET requests
 * - response JSON is fast to parse
 */
const PAGE_SIZE = 500;

/**
 * Conservative inter-page delay (ms).
 * NCBI rate limit: 3 req/s without API key, 10 req/s with key.
 * 400 ms = 2.5 req/s — stays safe regardless of key presence.
 */
const PAGE_DELAY_MS = 400;

// ── Shared helpers ────────────────────────────────────────────────────────────

function addNcbiCredentials(params: URLSearchParams): void {
  const tool = process.env.NCBI_TOOL;
  const email = process.env.NCBI_EMAIL;
  const apiKey = process.env.NCBI_API_KEY;
  if (tool) params.set("tool", tool);
  if (email) params.set("email", email);
  if (apiKey) params.set("api_key", apiKey);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function esearchFetch(
  params: URLSearchParams
): Promise<{ pmids: string[]; count: number; queryUrl: string }> {
  const queryUrl = `${ESEARCH_URL}?${params.toString()}`;

  let res: Response;
  try {
    res = await fetch(queryUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`PubMed ESearch request failed: ${msg}`);
  }

  if (!res.ok) {
    throw new Error(`PubMed ESearch HTTP error: ${res.status} ${res.statusText}`);
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error("PubMed ESearch: malformed JSON response");
  }

  const root = data as Record<string, unknown>;
  const er = root?.esearchresult as Record<string, unknown> | undefined;
  if (!er) throw new Error("PubMed ESearch: missing esearchresult in response");

  const count = parseInt(String(er.count ?? "0"), 10) || 0;

  const idList = er.idlist;
  if (!Array.isArray(idList)) throw new Error("PubMed ESearch: missing idlist in response");

  const pmids = idList.filter((id): id is string => typeof id === "string");
  return { pmids, count, queryUrl };
}

// ── Primary API: crdt-based windowed search ───────────────────────────────────

/**
 * Single-page CRDT search. Returns the PMIDs for this page, the total result
 * count (across all pages), and the exact URL used (for debugging).
 *
 * Uses:
 *   datetype=crdt  — PubMed Create Date (not publication date)
 *   sort=most+recent — newest first, so page 0 has the freshest records
 */
export async function searchPubMedPage(options: {
  query: string;
  mindate?: string | null;
  maxdate?: string | null;
  retmax?: number;
  retstart?: number;
}): Promise<{ pmids: string[]; count: number; queryUrl: string }> {
  const { query, mindate, maxdate, retmax = PAGE_SIZE, retstart = 0 } = options;

  const params = new URLSearchParams({
    db: "pubmed",
    term: query,
    retmode: "json",
    datetype: "crdt",
    sort: "most+recent",
    retmax: String(Math.min(retmax, 10_000)),
    retstart: String(retstart),
  });

  if (mindate) params.set("mindate", formatDateForPubMed(mindate));
  if (maxdate) params.set("maxdate", formatDateForPubMed(maxdate));

  addNcbiCredentials(params);

  return esearchFetch(params);
}

/**
 * Page through ALL results for a CRDT-windowed search, deduplicating PMIDs.
 *
 * - Fetches page 0 first to get total `count`
 * - Continues paging until all results are collected or `maxTotal` is reached
 * - Applies PAGE_DELAY_MS between each page request
 * - Deduplicates via a Set — overlap between pages is silently discarded
 *
 * @param maxTotal  Hard cap on unique PMIDs collected (default 1000).
 */
export async function searchPubMedAllPages(options: {
  query: string;
  mindate?: string | null;
  maxdate?: string | null;
  maxTotal?: number;
}): Promise<{ pmids: string[]; count: number; pages: number; queryUrl: string }> {
  const { query, mindate, maxdate, maxTotal = 1000 } = options;

  const first = await searchPubMedPage({
    query,
    mindate,
    maxdate,
    retmax: PAGE_SIZE,
    retstart: 0,
  });

  const seen = new Set<string>(first.pmids);
  const totalAvailable = Math.min(first.count, maxTotal);
  let pages = 1;

  let retstart = PAGE_SIZE;
  while (retstart < totalAvailable && seen.size < maxTotal) {
    await delay(PAGE_DELAY_MS);

    const remaining = Math.min(PAGE_SIZE, maxTotal - seen.size);
    const page = await searchPubMedPage({
      query,
      mindate,
      maxdate,
      retmax: remaining,
      retstart,
    });

    for (const id of page.pmids) seen.add(id);
    pages++;
    retstart += PAGE_SIZE;
  }

  return {
    pmids: Array.from(seen),
    count: first.count,
    pages,
    queryUrl: first.queryUrl,
  };
}

// ── Legacy: reldate-based search (kept for backward compatibility) ─────────────

/**
 * @deprecated Use searchPubMedAllPages with a crdt window instead.
 * Kept so existing callers (cron routes, admin daily-run) don't break.
 */
export async function searchPubMed(
  query: string,
  daysBack: number,
  retmax: number
): Promise<string[]> {
  const params = new URLSearchParams({
    db: "pubmed",
    term: query,
    retmode: "json",
    reldate: String(daysBack),
    datetype: "pdat",
    retmax: String(retmax),
  });
  addNcbiCredentials(params);
  const result = await esearchFetch(params);
  return result.pmids;
}

/**
 * @deprecated Use searchPubMedAllPages with explicit crdt dates instead.
 * Kept for one-time backfill scripts.
 */
export async function searchPubMedDateRange(
  query: string,
  mindate: string,
  maxdate: string,
  retmax: number
): Promise<string[]> {
  const params = new URLSearchParams({
    db: "pubmed",
    term: query,
    retmode: "json",
    datetype: "pdat",
    mindate: formatDateForPubMed(mindate),
    maxdate: formatDateForPubMed(maxdate),
    retmax: String(retmax),
  });
  addNcbiCredentials(params);
  const result = await esearchFetch(params);
  return result.pmids;
}
