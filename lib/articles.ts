import "server-only";
import type { PubMedRecord } from "@/lib/pubmed/efetch";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

function toYYYYMMDD(pubDate: string | null): string | null {
  if (!pubDate || !pubDate.trim()) return null;
  const d = new Date(pubDate.trim());
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function upsertArticles(
  records: PubMedRecord[]
): Promise<number> {
  if (records.length === 0) return 0;

  const byPmid = new Map<string, PubMedRecord>();
  for (const r of records) {
    if (!byPmid.has(r.pmid)) byPmid.set(r.pmid, r);
  }
  const deduped = Array.from(byPmid.values());

  const supabase = getSupabaseServerClient();

  const rows = deduped.map((r) => ({
    pmid: r.pmid,
    title: r.title,
    abstract: r.abstract,
    journal: r.journal,
    pub_date: toYYYYMMDD(r.pubDate),
    publication_types: r.publicationTypes,
    mesh_terms: r.meshTerms,
    keywords: r.keywords,
    authors: r.authors,
  }));

  const { data, error } = await supabase
    .from("articles")
    .upsert(rows, { onConflict: "pmid" })
    .select("pmid");

  if (error) throw new Error(`Supabase upsert failed: ${error.message}`);

  return data?.length ?? deduped.length;
}
