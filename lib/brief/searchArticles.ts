import "server-only";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { sanitizePmid } from "@/lib/savedArticleTypes";
import { getBriefItemsForSaved } from "@/lib/brief/savedBriefItems";
import type { BriefItem } from "@/lib/brief/items";

/**
 * Searches the PubMed article corpus by title and abstract using
 * PostgreSQL full-text search (GIN indexed) with fallback to ILIKE.
 *
 * Hydrates only the top matching rows to keep Supabase egress minimal.
 */
export async function searchBriefArticles(
  rawQuery: string,
  limit: number = 40
): Promise<BriefItem[]> {
  const query = rawQuery.trim();
  if (!query) return [];

  const supabase = getSupabaseServerClient();
  const directPmid = sanitizePmid(query);

  // If query is an exact PMID, prioritize direct lookup
  if (directPmid) {
    const directItems = await getBriefItemsForSaved([
      {
        pmid: directPmid,
        title: `PMID ${directPmid}`,
        pubmedUrl: `https://pubmed.ncbi.nlm.nih.gov/${directPmid}/`,
      },
    ]);
    if (directItems.length > 0) return directItems;
  }

  // 1. Try full-text search on title and abstract using the GIN fts index
  const { data: ftsRows, error: ftsError } = await supabase
    .from("articles")
    .select("pmid")
    .textSearch("fts", query, { type: "websearch", config: "english" })
    .order("pub_date", { ascending: false, nullsFirst: false })
    .limit(limit);

  let pmids: string[] = [];

  if (!ftsError && ftsRows && ftsRows.length > 0) {
    pmids = ftsRows.map((r) => String(r.pmid));
  } else {
    // 2. Fallback to ILIKE if websearch parser didn't match (e.g. partial words, symbols)
    const cleanPattern = query.replace(/[%_,]/g, " ").trim();
    if (cleanPattern) {
      const { data: ilikeRows } = await supabase
        .from("articles")
        .select("pmid")
        .or(`title.ilike.%${cleanPattern}%,abstract.ilike.%${cleanPattern}%`)
        .order("pub_date", { ascending: false, nullsFirst: false })
        .limit(limit);

      if (ilikeRows) {
        pmids = ilikeRows.map((r) => String(r.pmid));
      }
    }
  }

  if (pmids.length === 0) return [];

  const uniquePmids = [...new Set(pmids)];
  return getBriefItemsForSaved(
    uniquePmids.map((pmid) => ({
      pmid,
      title: `PMID ${pmid}`,
      pubmedUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    }))
  );
}
