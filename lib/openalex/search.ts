import { openAlexFetch } from "@/lib/openalex/client";
import { openAlexJournalFilter } from "@/lib/openalex/journals";
import {
  openAlexIdFromUrl,
  openAlexWorkToRecord,
  type OpenAlexRecord,
  type OpenAlexWork,
} from "@/lib/openalex/works";
import { passesClinicalInclusionFilter } from "@/lib/openalex/filter";

const PER_PAGE = 200;
const PAGE_DELAY_MS = 120;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type WorksListResponse = {
  meta?: { count?: number; next_cursor?: string | null };
  results?: unknown[];
};

const SELECT_FIELDS = [
  "id",
  "doi",
  "display_name",
  "publication_date",
  "type",
  "primary_location",
  "best_oa_location",
  "abstract_inverted_index",
  "authorships",
  "ids",
  "keywords",
  "concepts",
].join(",");

/**
 * Page OpenAlex works for the CID / OFID / ASHE / ICHE / CMI journal allowlist.
 */
export async function searchOpenAlexJournalWorks(options: {
  mindate: string;
  maxdate: string;
  maxTotal?: number;
}): Promise<{
  workIds: string[];
  records: OpenAlexRecord[];
  count: number;
  pages: number;
}> {
  const { mindate, maxdate, maxTotal = 200 } = options;
  const filter = [
    openAlexJournalFilter(),
    `from_publication_date:${mindate}`,
    `to_publication_date:${maxdate}`,
  ].join(",");

  const seen = new Set<string>();
  const workIds: string[] = [];
  const records: OpenAlexRecord[] = [];
  let cursor: string | null = "*";
  let pages = 0;
  let totalCount = 0;

  while (workIds.length < maxTotal) {
    const params = new URLSearchParams({
      filter,
      sort: "publication_date:desc",
      "per-page": String(PER_PAGE),
      select: SELECT_FIELDS,
      cursor,
    });

    const data = (await openAlexFetch(
      `/works?${params.toString()}`
    )) as WorksListResponse;
    pages++;

    totalCount = data.meta?.count ?? totalCount;
    const results = data.results ?? [];

    for (const raw of results) {
      const work = raw as OpenAlexWork;
      const id = openAlexIdFromUrl(work.id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      workIds.push(id);
      const rec = openAlexWorkToRecord(work);
      if (rec && passesClinicalInclusionFilter(rec, true)) {
        records.push(rec);
      }
      if (workIds.length >= maxTotal) break;
    }

    cursor = data.meta?.next_cursor ?? null;
    if (!cursor || results.length === 0) break;
    await delay(PAGE_DELAY_MS);
  }

  return { workIds, records, count: totalCount, pages };
}
