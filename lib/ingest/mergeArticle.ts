import type { SupabaseClient } from "@supabase/supabase-js";
import { isNumericPmid, isOpenAlexWorkId, normalizeDoi } from "@/lib/doi";

export type ExistingArticleMerge = {
  pmid: string;
  fetchedAt: string | null;
  doi: string | null;
  openalexId: string | null;
  landingUrl: string | null;
  correspondingEmail: string | null;
  correspondingName: string | null;
};

const CHUNK = 200;

async function selectArticleMergeRows(
  supabase: SupabaseClient,
  column: "pmid" | "doi" | "openalex_id",
  values: string[]
): Promise<ExistingArticleMerge[]> {
  const out: ExistingArticleMerge[] = [];
  for (let i = 0; i < values.length; i += CHUNK) {
    const chunk = values.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("articles")
      .select(
        "pmid, fetched_at, doi, openalex_id, landing_url, corresponding_author_email, corresponding_author_name"
      )
      .in(column, chunk);
    if (error) {
      const msg = error.message.toLowerCase();
      if (
        msg.includes("doi") ||
        msg.includes("openalex_id") ||
        msg.includes("landing_url") ||
        msg.includes("corresponding_author")
      ) {
        const fallback = await supabase
          .from("articles")
          .select("pmid, fetched_at")
          .in(column === "pmid" ? "pmid" : column, chunk);
        if (fallback.error) {
          console.warn("[ingest] article merge lookup failed:", fallback.error.message);
          continue;
        }
        for (const row of fallback.data ?? []) {
          if (!row?.pmid) continue;
          out.push({
            pmid: String(row.pmid),
            fetchedAt: typeof row.fetched_at === "string" ? row.fetched_at : null,
            doi: null,
            openalexId: null,
            landingUrl: null,
            correspondingEmail: null,
            correspondingName: null,
          });
        }
        continue;
      }
      console.warn("[ingest] article merge lookup failed:", error.message);
      continue;
    }
    for (const row of data ?? []) {
      if (!row?.pmid) continue;
      out.push({
        pmid: String(row.pmid),
        fetchedAt: typeof row.fetched_at === "string" ? row.fetched_at : null,
        doi: typeof row.doi === "string" ? row.doi : null,
        openalexId: typeof row.openalex_id === "string" ? row.openalex_id : null,
        landingUrl: typeof row.landing_url === "string" ? row.landing_url : null,
        correspondingEmail:
          typeof row.corresponding_author_email === "string"
            ? row.corresponding_author_email
            : null,
        correspondingName:
          typeof row.corresponding_author_name === "string"
            ? row.corresponding_author_name
            : null,
      });
    }
  }
  return out;
}

export async function fetchArticlesByPmids(
  supabase: SupabaseClient,
  pmids: string[]
): Promise<Map<string, ExistingArticleMerge>> {
  const map = new Map<string, ExistingArticleMerge>();
  const rows = await selectArticleMergeRows(supabase, "pmid", pmids);
  for (const row of rows) map.set(row.pmid, row);
  return map;
}

export async function fetchArticlesByDois(
  supabase: SupabaseClient,
  dois: string[]
): Promise<Map<string, ExistingArticleMerge>> {
  const map = new Map<string, ExistingArticleMerge>();
  const normalized = [...new Set(dois.map((d) => normalizeDoi(d)).filter((d): d is string => Boolean(d)))];
  if (normalized.length === 0) return map;
  const rows = await selectArticleMergeRows(supabase, "doi", normalized);
  for (const row of rows) {
    const doi = normalizeDoi(row.doi);
    if (doi) map.set(doi, row);
  }
  return map;
}

export async function fetchArticlesByOpenAlexIds(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Map<string, ExistingArticleMerge>> {
  const map = new Map<string, ExistingArticleMerge>();
  const cleaned = [...new Set(ids.map((id) => id.trim().toUpperCase()).filter(Boolean))];
  if (cleaned.length === 0) return map;
  const rows = await selectArticleMergeRows(supabase, "openalex_id", cleaned);
  for (const row of rows) {
    if (row.openalexId) map.set(row.openalexId.toUpperCase(), row);
  }
  return map;
}

/** Rewrite a temporary OpenAlex work-id PK to a PubMed PMID. */
export async function rekeyArticlePmid(
  supabase: SupabaseClient,
  oldPmid: string,
  newPmid: string
): Promise<void> {
  if (oldPmid === newPmid) return;
  const { error } = await supabase.rpc("rekey_article_pmid", {
    old_pmid: oldPmid,
    new_pmid: newPmid,
  });
  if (error) {
    throw new Error(`rekey_article_pmid failed: ${error.message}`);
  }
}

/**
 * When PubMed arrives for an OpenAlex-first row, rewrite W-id -> PMID.
 * Returns the row id to upsert (always the PubMed PMID when we have one).
 */
export async function resolvePubmedMergePmid(options: {
  supabase: SupabaseClient;
  pubmedPmid: string;
  doi: string | null;
  byPmid: Map<string, ExistingArticleMerge>;
  byDoi: Map<string, ExistingArticleMerge>;
}): Promise<{ pmid: string; existing: ExistingArticleMerge | null; rekeyed: boolean }> {
  const { supabase, pubmedPmid, doi, byPmid, byDoi } = options;
  const existingPmid = byPmid.get(pubmedPmid) ?? null;
  const existingDoi = doi ? byDoi.get(doi) ?? null : null;

  if (
    existingDoi &&
    isOpenAlexWorkId(existingDoi.pmid) &&
    existingDoi.pmid !== pubmedPmid
  ) {
    if (existingPmid) {
      console.warn(
        `[ingest] DOI ${doi} already on ${existingDoi.pmid}; PMID ${pubmedPmid} also exists — keeping PubMed row`
      );
      await supabase
        .from("articles")
        .update({ doi: null })
        .eq("pmid", existingDoi.pmid);
      return { pmid: pubmedPmid, existing: existingPmid, rekeyed: false };
    }
    await rekeyArticlePmid(supabase, existingDoi.pmid, pubmedPmid);
    const merged: ExistingArticleMerge = {
      ...existingDoi,
      pmid: pubmedPmid,
    };
    byPmid.set(pubmedPmid, merged);
    byDoi.set(doi!, merged);
    return { pmid: pubmedPmid, existing: merged, rekeyed: true };
  }

  return {
    pmid: pubmedPmid,
    existing: existingPmid ?? existingDoi,
    rekeyed: false,
  };
}

export function shouldSkipOpenAlexInsert(existing: ExistingArticleMerge | null): boolean {
  if (!existing) return false;
  return isNumericPmid(existing.pmid) || Boolean(existing.doi);
}
