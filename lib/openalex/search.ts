import { openAlexFetch } from "@/lib/openalex/client";
import { openAlexIdFromUrl, openAlexWorkToRecord } from "@/lib/openalex/works";
import type { PubMedRecord } from "@/lib/pubmed/efetch";

const PER_PAGE = 200;
const PAGE_DELAY_MS = 120;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type WorksListResponse = {
  meta?: { count?: number; next_cursor?: string | null };
  results?: unknown[];
};

/**
 * Search OpenAlex works in a publication-date window, newest first.
 * Returns deduplicated work IDs (stored as pmid) and parsed records.
 */
export async function searchOpenAlexAllPages(options: {
  search: string;
  mindate: string;
  maxdate: string;
  maxTotal?: number;
}): Promise<{
  workIds: string[];
  records: PubMedRecord[];
  count: number;
  pages: number;
}> {
  const { search, mindate, maxdate, maxTotal = 200 } = options;
  const filter = `from_publication_date:${mindate},to_publication_date:${maxdate}`;
  const seen = new Set<string>();
  const workIds: string[] = [];
  const records: PubMedRecord[] = [];
  let cursor: string | null = null;
  let pages = 0;
  let totalCount = 0;

  while (workIds.length < maxTotal) {
    const params = new URLSearchParams({
      search,
      filter,
      sort: "publication_date:desc",
      "per-page": String(PER_PAGE),
    });
    if (cursor) params.set("cursor", cursor);

    const data = (await openAlexFetch(`/works?${params.toString()}`)) as WorksListResponse;
    pages++;

    totalCount = data.meta?.count ?? totalCount;
    const results = data.meta ? (data.results ?? []) : [];

    for (const raw of results) {
      const work = raw as Parameters<typeof openAlexWorkToRecord>[0];
      const id = openAlexIdFromUrl(work.id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      workIds.push(id);
      const rec = openAlexWorkToRecord(work);
      if (rec) records.push(rec);
      if (workIds.length >= maxTotal) break;
    }

    cursor = data.meta?.next_cursor ?? null;
    if (!cursor || results.length === 0) break;
    await delay(PAGE_DELAY_MS);
  }

  return { workIds, records, count: totalCount, pages };
}
