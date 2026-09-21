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

const ARTICLE_REKEY_COLUMNS =
  "pmid, title, abstract, journal, pub_date, publication_types, mesh_terms, keywords, authors, source, fetched_at, study_subheading, study_label, article_date, epub_date, pubmed_date, release_date, relevance_score, corresponding_author_email, corresponding_author_name, doi, openalex_id, landing_url";

async function movePmidOnTable(
  supabase: SupabaseClient,
  table: "summaries" | "relevance_feedback",
  oldPmid: string,
  newPmid: string
): Promise<void> {
  const { error } = await supabase
    .from(table)
    .update({ pmid: newPmid })
    .eq("pmid", oldPmid);
  if (error) {
    throw new Error(`rekey ${table} failed: ${error.message}`);
  }
}

async function movePmidOnKeyedTable(
  supabase: SupabaseClient,
  table: "saved_articles" | "brief_email_sends" | "author_outreach",
  oldPmid: string,
  newPmid: string
): Promise<void> {
  const { error: updErr } = await supabase
    .from(table)
    .update({ pmid: newPmid })
    .eq("pmid", oldPmid);
  if (updErr) {
    console.warn(`[ingest] rekey ${table}:`, updErr.message);
  }
  const { error: delErr } = await supabase
    .from(table)
    .delete()
    .eq("pmid", oldPmid);
  if (delErr) {
    console.warn(`[ingest] rekey ${table} leftover:`, delErr.message);
  }
}

/**
 * Rewrite a temporary OpenAlex work-id PK to a PubMed PMID.
 * Copies without doi/openalex_id first so unique indexes are not tripped
 * while the old row still exists.
 */
export async function rekeyArticlePmid(
  supabase: SupabaseClient,
  oldPmid: string,
  newPmid: string
): Promise<void> {
  if (oldPmid === newPmid) return;

  const { data: old, error: readErr } = await supabase
    .from("articles")
    .select(ARTICLE_REKEY_COLUMNS)
    .eq("pmid", oldPmid)
    .maybeSingle();
  if (readErr) {
    throw new Error(`rekey_article_pmid failed: ${readErr.message}`);
  }
  if (!old) {
    throw new Error(`rekey_article_pmid failed: source article ${oldPmid} not found`);
  }

  const { data: target, error: targetErr } = await supabase
    .from("articles")
    .select("pmid")
    .eq("pmid", newPmid)
    .maybeSingle();
  if (targetErr) {
    throw new Error(`rekey_article_pmid failed: ${targetErr.message}`);
  }
  if (target) {
    throw new Error(`rekey_article_pmid failed: target pmid ${newPmid} already exists`);
  }

  const keptDoi = typeof old.doi === "string" ? old.doi : null;
  const keptOpenalex =
    typeof old.openalex_id === "string" ? old.openalex_id : null;

  const { error: insErr } = await supabase.from("articles").insert({
    ...old,
    pmid: newPmid,
    doi: null,
    openalex_id: null,
  });
  if (insErr) {
    throw new Error(`rekey_article_pmid failed: ${insErr.message}`);
  }

  await movePmidOnTable(supabase, "summaries", oldPmid, newPmid);
  await movePmidOnTable(supabase, "relevance_feedback", oldPmid, newPmid);
  await movePmidOnKeyedTable(supabase, "saved_articles", oldPmid, newPmid);
  await movePmidOnKeyedTable(supabase, "brief_email_sends", oldPmid, newPmid);
  await movePmidOnKeyedTable(supabase, "author_outreach", oldPmid, newPmid);

  const { error: delErr } = await supabase
    .from("articles")
    .delete()
    .eq("pmid", oldPmid);
  if (delErr) {
    throw new Error(`rekey_article_pmid failed: ${delErr.message}`);
  }

  const { error: restoreErr } = await supabase
    .from("articles")
    .update({ doi: keptDoi, openalex_id: keptOpenalex })
    .eq("pmid", newPmid);
  if (restoreErr) {
    throw new Error(`rekey_article_pmid failed: ${restoreErr.message}`);
  }
}

/**
 * PMID row already exists; drop the OpenAlex W-id copy so DOI is unique.
 */
async function absorbOpenAlexIntoPubmed(
  supabase: SupabaseClient,
  openAlexPmid: string,
  pubmedPmid: string
): Promise<void> {
  const { data: oa, error: readErr } = await supabase
    .from("articles")
    .select("openalex_id, landing_url, doi, fetched_at")
    .eq("pmid", openAlexPmid)
    .maybeSingle();
  if (readErr) {
    throw new Error(`absorb OpenAlex row failed: ${readErr.message}`);
  }

  const { data: pubmedSums } = await supabase
    .from("summaries")
    .select("pmid")
    .eq("pmid", pubmedPmid)
    .limit(1);
  if (!pubmedSums?.length) {
    await movePmidOnTable(supabase, "summaries", openAlexPmid, pubmedPmid);
  } else {
    await supabase.from("summaries").delete().eq("pmid", openAlexPmid);
  }
  const { error: fbErr } = await supabase
    .from("relevance_feedback")
    .update({ pmid: pubmedPmid })
    .eq("pmid", openAlexPmid);
  if (fbErr) {
    await supabase.from("relevance_feedback").delete().eq("pmid", openAlexPmid);
  }
  await movePmidOnKeyedTable(supabase, "saved_articles", openAlexPmid, pubmedPmid);
  await movePmidOnKeyedTable(supabase, "brief_email_sends", openAlexPmid, pubmedPmid);
  await movePmidOnKeyedTable(supabase, "author_outreach", openAlexPmid, pubmedPmid);

  const { error: delErr } = await supabase
    .from("articles")
    .delete()
    .eq("pmid", openAlexPmid);
  if (delErr) {
    throw new Error(`absorb OpenAlex row failed: ${delErr.message}`);
  }

  if (oa) {
    const { error: stampErr } = await supabase
      .from("articles")
      .update({
        openalex_id: oa.openalex_id,
        landing_url: oa.landing_url,
        doi: oa.doi,
      })
      .eq("pmid", pubmedPmid);
    if (stampErr) {
      console.warn("[ingest] absorb stamp failed:", stampErr.message);
    }
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
}): Promise<{
  pmid: string;
  existing: ExistingArticleMerge | null;
  rekeyed: boolean;
  omitDoi: boolean;
}> {
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
      await absorbOpenAlexIntoPubmed(supabase, existingDoi.pmid, pubmedPmid);
      const merged: ExistingArticleMerge = {
        ...existingPmid,
        doi: existingDoi.doi ?? existingPmid.doi,
        openalexId: existingDoi.openalexId ?? existingPmid.openalexId,
        landingUrl: existingDoi.landingUrl ?? existingPmid.landingUrl,
      };
      byPmid.set(pubmedPmid, merged);
      byDoi.set(doi!, merged);
      return { pmid: pubmedPmid, existing: merged, rekeyed: false, omitDoi: false };
    }
    await rekeyArticlePmid(supabase, existingDoi.pmid, pubmedPmid);
    const merged: ExistingArticleMerge = {
      ...existingDoi,
      pmid: pubmedPmid,
    };
    byPmid.set(pubmedPmid, merged);
    byDoi.set(doi!, merged);
    return { pmid: pubmedPmid, existing: merged, rekeyed: true, omitDoi: false };
  }

  if (
    existingDoi &&
    existingDoi.pmid !== pubmedPmid &&
    !isOpenAlexWorkId(existingDoi.pmid)
  ) {
    console.warn(
      `[ingest] DOI ${doi} already on ${existingDoi.pmid}; omitting on ${pubmedPmid}`
    );
    return { pmid: pubmedPmid, existing: existingPmid, rekeyed: false, omitDoi: true };
  }

  return {
    pmid: pubmedPmid,
    existing: existingPmid ?? existingDoi,
    rekeyed: false,
    omitDoi: false,
  };
}

export function shouldSkipOpenAlexInsert(existing: ExistingArticleMerge | null): boolean {
  if (!existing) return false;
  return isNumericPmid(existing.pmid) || Boolean(existing.doi);
}
