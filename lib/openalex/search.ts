import { openAlexFetch } from "@/lib/openalex/client";
import { OPENALEX_JOURNAL_ISSNS, openAlexJournalFilter } from "@/lib/openalex/journals";
import {
  isCoarseOpenAlexDate,
  listCrossrefOnlineDois,
} from "@/lib/openalex/dates";
import {
  openAlexIdFromUrl,
  openAlexWorkToRecord,
  type OpenAlexRecord,
  type OpenAlexWork,
} from "@/lib/openalex/works";
import { passesClinicalInclusionFilter } from "@/lib/openalex/filter";
import { normalizeDoi } from "@/lib/doi";

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
  "created_date",
  "type",
  "primary_location",
  "best_oa_location",
  "abstract_inverted_index",
  "authorships",
  "ids",
  "keywords",
  "concepts",
].join(",");

async function fetchOpenAlexWorkByDoi(
  doi: string
): Promise<OpenAlexWork | null> {
  try {
    return (await openAlexFetch(`/works/doi:${doi}`)) as OpenAlexWork;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("404")) {
      console.warn("[openalex search] DOI lookup failed:", doi, msg);
    }
    return null;
  }
}

/**
 * Page OpenAlex works for the CID / OFID / ASHE / ICHE / CMI journal allowlist.
 * Also pulls Crossref published-online DOIs in the same window so year-stamped
 * FirstView papers (OpenAlex YYYY-01-01) are not skipped.
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

  const seenIds = new Set<string>();
  const seenDois = new Set<string>();
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
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      workIds.push(id);
      const rec = openAlexWorkToRecord(work);
      if (rec && passesClinicalInclusionFilter(rec, true)) {
        if (rec.doi) seenDois.add(rec.doi);
        records.push(rec);
      }
      if (workIds.length >= maxTotal) break;
    }

    cursor = data.meta?.next_cursor ?? null;
    if (!cursor || results.length === 0) break;
    await delay(PAGE_DELAY_MS);
  }

  const onlineByDoi = await listCrossrefOnlineDois({
    issns: OPENALEX_JOURNAL_ISSNS,
    mindate,
    maxdate,
  });

  for (const rec of records) {
    const online = rec.doi ? onlineByDoi.get(rec.doi) : undefined;
    if (
      online &&
      isCoarseOpenAlexDate(rec.pubDate, rec.createdDate)
    ) {
      rec.pubDate = online;
    }
  }

  for (const [doi, onlineDate] of onlineByDoi) {
    if (workIds.length >= maxTotal) break;
    if (seenDois.has(doi)) continue;
    const work = await fetchOpenAlexWorkByDoi(doi);
    await delay(PAGE_DELAY_MS);
    if (!work) continue;
    const id = openAlexIdFromUrl(work.id);
    if (!id || seenIds.has(id)) continue;
    const rec = openAlexWorkToRecord(work);
    if (!rec || !passesClinicalInclusionFilter(rec, true)) continue;
    rec.pubDate = onlineDate;
    seenIds.add(id);
    seenDois.add(doi);
    workIds.push(id);
    records.push(rec);
  }

  return { workIds, records, count: workIds.length, pages };
}
