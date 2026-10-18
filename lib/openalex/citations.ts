import { openAlexFetch } from "@/lib/openalex/client";
import {
  isNumericPmid,
  isOpenAlexWorkId,
  normalizeDoi,
  pmidFromOpenAlexIdField,
} from "@/lib/doi";
import { openAlexIdFromUrl } from "@/lib/openalex/works";

/** OpenAlex OR filters accept at most 100 values. */
export const CITATION_LOOKUP_BATCH = 100;

const SELECT = "id,doi,cited_by_count,ids";

type CitationWork = {
  id?: string;
  doi?: string | null;
  cited_by_count?: number | null;
  ids?: { pmid?: string | null; doi?: string | null; openalex?: string | null };
};

type WorksList = {
  meta?: { next_cursor?: string | null };
  results?: CitationWork[];
};

export type CitationTarget = {
  pmid: string;
  doi: string | null;
  openalexId: string | null;
};

export type CitationHit = {
  pmid: string;
  /** Null when OpenAlex has no matching work. */
  citedByCount: number | null;
};

type LookupKind = "doi" | "pmid" | "openalex";

type LookupTarget = {
  pmid: string;
  kind: LookupKind;
  key: string;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** One lookup key per article: DOI, else OpenAlex work id, else numeric PMID. */
export function citationLookupTarget(row: CitationTarget): LookupTarget | null {
  const pmid = row.pmid.trim();
  if (!pmid) return null;

  const doi = normalizeDoi(row.doi);
  if (doi && !/[,|]/.test(doi)) {
    return { pmid, kind: "doi", key: doi };
  }

  const openalexId = openAlexIdFromUrl(row.openalexId ?? undefined);
  if (openalexId && isOpenAlexWorkId(openalexId)) {
    return { pmid, kind: "openalex", key: openalexId };
  }

  if (isNumericPmid(pmid)) {
    return { pmid, kind: "pmid", key: pmid };
  }
  if (isOpenAlexWorkId(pmid)) {
    return { pmid, kind: "openalex", key: pmid.toUpperCase() };
  }
  return null;
}

function filterFor(kind: LookupKind, keys: string[]): string {
  const joined = keys.join("|");
  if (kind === "doi") return `doi:${joined}`;
  if (kind === "pmid") return `ids.pmid:${joined}`;
  return `ids.openalex:${joined}`;
}

function indexWorks(works: CitationWork[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const work of works) {
    const raw = work.cited_by_count;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) continue;
    const count = Math.round(raw);
    const doi = normalizeDoi(work.doi ?? work.ids?.doi);
    if (doi) map.set(`doi:${doi}`, count);
    const pmid = pmidFromOpenAlexIdField(work.ids?.pmid);
    if (pmid) map.set(`pmid:${pmid}`, count);
    const openalexId = openAlexIdFromUrl(work.id ?? work.ids?.openalex ?? undefined);
    if (openalexId) map.set(`openalex:${openalexId}`, count);
  }
  return map;
}

async function fetchWorks(filter: string): Promise<{
  works: CitationWork[];
  truncated: boolean;
}> {
  const params = new URLSearchParams();
  params.set("filter", filter);
  params.set("select", SELECT);
  params.set("per-page", String(CITATION_LOOKUP_BATCH));

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const data = (await openAlexFetch(`/works?${params.toString()}`)) as WorksList;
      const works = Array.isArray(data.results) ? data.results : [];
      return {
        works,
        truncated: Boolean(data.meta?.next_cursor) && works.length >= CITATION_LOOKUP_BATCH,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === 0) await delay(1500);
    }
  }
  throw lastError ?? new Error("OpenAlex citation lookup failed");
}

/**
 * Citation counts for up to a few thousand articles.
 * Asks OpenAlex only for id, doi, and cited_by_count, in batches of 100.
 * A miss is citedByCount null. A truncated page is left unstamped for those misses.
 */
export async function lookupCitationCounts(
  rows: CitationTarget[]
): Promise<CitationHit[]> {
  const targets: LookupTarget[] = [];
  for (const row of rows) {
    const target = citationLookupTarget(row);
    if (target) targets.push(target);
  }

  const hits: CitationHit[] = [];
  const kinds: LookupKind[] = ["doi", "pmid", "openalex"];

  for (const kind of kinds) {
    const group = targets.filter((target) => target.kind === kind);
    const batches = chunk(group, CITATION_LOOKUP_BATCH);
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      if (i > 0) await delay(120);
      const { works, truncated } = await fetchWorks(
        filterFor(kind, batch.map((target) => target.key))
      );
      const found = indexWorks(works);
      for (const target of batch) {
        const count = found.get(`${kind}:${target.key}`);
        if (count != null) {
          hits.push({ pmid: target.pmid, citedByCount: count });
        } else if (!truncated) {
          hits.push({ pmid: target.pmid, citedByCount: null });
        }
      }
    }
  }

  return hits;
}
