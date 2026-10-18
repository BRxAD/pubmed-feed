import type { SupabaseClient } from "@supabase/supabase-js";
import {
  citationLookupTarget,
  lookupCitationCounts,
  CITATION_LOOKUP_BATCH,
  type CitationHit,
  type CitationTarget,
} from "@/lib/openalex/citations";

/** Recent papers are checked again after a week. Older papers, after a month. */
const RECENT_STALE_DAYS = 7;
const OLD_STALE_DAYS = 30;
const RECENT_WINDOW_DAYS = 365;

/** Default cron pass. A full corpus of ~11k is a few nights, then only stale rows. */
export const CITATION_SYNC_MAX_BATCHES = 40;

const PAGE = 1000;

type ArticleRow = {
  pmid: string;
  doi: string | null;
  openalex_id: string | null;
};

export type CitationSyncResult = {
  checked: number;
  matched: number;
  notFound: number;
  batches: number;
};

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

function dateDaysAgo(days: number): string {
  return isoDaysAgo(days).slice(0, 10);
}

async function loadRows(
  supabase: SupabaseClient,
  build: (
    from: number,
    to: number
  ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  limit: number
): Promise<ArticleRow[]> {
  const rows: ArticleRow[] = [];
  for (let from = 0; rows.length < limit; from += PAGE) {
    const to = Math.min(from + PAGE, limit) - 1;
    const { data, error } = await build(from, to);
    if (error) throw new Error(`Citation candidate read failed: ${error.message}`);
    const page = (data ?? []) as ArticleRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows.slice(0, limit);
}

async function loadCandidates(
  supabase: SupabaseClient,
  limit: number
): Promise<CitationTarget[]> {
  const select = "pmid, doi, openalex_id";
  const seen = new Set<string>();
  const out: CitationTarget[] = [];

  const push = (rows: ArticleRow[]) => {
    for (const row of rows) {
      if (!row.pmid || seen.has(row.pmid)) continue;
      seen.add(row.pmid);
      out.push({
        pmid: row.pmid,
        doi: row.doi,
        openalexId: row.openalex_id,
      });
      if (out.length >= limit) return;
    }
  };

  const unchecked = await loadRows(
    supabase,
    (from, to) =>
      supabase
        .from("articles")
        .select(select)
        .is("cited_by_at", null)
        .order("pmid", { ascending: true })
        .range(from, to),
    limit
  );
  push(unchecked);
  if (out.length >= limit) return out;

  const recentSince = dateDaysAgo(RECENT_WINDOW_DAYS);
  const recentStale = isoDaysAgo(RECENT_STALE_DAYS);
  const recent = await loadRows(
    supabase,
    (from, to) =>
      supabase
        .from("articles")
        .select(select)
        .lt("cited_by_at", recentStale)
        .or(`release_date.gte.${recentSince},pub_date.gte.${recentSince}`)
        .order("cited_by_at", { ascending: true })
        .range(from, to),
    limit - out.length
  );
  push(recent);
  if (out.length >= limit) return out;

  const oldStale = isoDaysAgo(OLD_STALE_DAYS);
  const older = await loadRows(
    supabase,
    (from, to) =>
      supabase
        .from("articles")
        .select(select)
        .lt("cited_by_at", oldStale)
        .order("cited_by_at", { ascending: true })
        .range(from, to),
    limit - out.length
  );
  push(older);
  return out;
}

async function writeHits(
  supabase: SupabaseClient,
  hits: CitationHit[]
): Promise<void> {
  for (let i = 0; i < hits.length; i += CITATION_LOOKUP_BATCH) {
    const payload = hits.slice(i, i + CITATION_LOOKUP_BATCH).map((hit) => ({
      pmid: hit.pmid,
      count: hit.citedByCount,
    }));
    const { error } = await supabase.rpc("set_article_citation_counts", {
      payload,
    });
    if (error) {
      throw new Error(`Citation count write failed: ${error.message}`);
    }
  }
}

/**
 * Fill cited_by_count from OpenAlex.
 * Reads only pmid / doi / openalex id. Writes one integer and a timestamp.
 * Does not download abstracts or citation lists.
 */
export async function syncCitationCounts(
  supabase: SupabaseClient,
  options?: { maxBatches?: number }
): Promise<CitationSyncResult> {
  const maxBatches = Math.max(
    1,
    options?.maxBatches ?? CITATION_SYNC_MAX_BATCHES
  );
  const candidates = await loadCandidates(
    supabase,
    maxBatches * CITATION_LOOKUP_BATCH
  );
  if (candidates.length === 0) {
    return { checked: 0, matched: 0, notFound: 0, batches: 0 };
  }

  let matched = 0;
  let notFound = 0;
  let batches = 0;
  for (let i = 0; i < candidates.length; i += CITATION_LOOKUP_BATCH) {
    const slice = candidates.slice(i, i + CITATION_LOOKUP_BATCH);
    const resolvable: CitationTarget[] = [];
    const hits: CitationHit[] = [];
    for (const row of slice) {
      if (citationLookupTarget(row)) resolvable.push(row);
      else hits.push({ pmid: row.pmid, citedByCount: null });
    }
    if (resolvable.length > 0) {
      hits.push(...(await lookupCitationCounts(resolvable)));
    }
    await writeHits(supabase, hits);
    batches += 1;
    for (const hit of hits) {
      if (hit.citedByCount == null) notFound += 1;
      else matched += 1;
    }
  }

  return {
    checked: matched + notFound,
    matched,
    notFound,
    batches,
  };
}
