import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mulberry32,
  pickSecondRaterQueue,
  SECOND_RATER_QUEUE_SIZE,
  type SecondRaterCandidate,
} from "@/lib/brief/secondRaterSample";

const PAGE_FETCH = 1000;
const SEED = 20261024;

export type SecondRaterCard = {
  pmid: string;
  position: number;
  rating: number | null;
  title: string;
  journal: string | null;
  date: string | null;
  abstract: string | null;
  url: string;
};

export async function ensureSecondRaterQueue(
  supabase: SupabaseClient,
  topicId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("second_rater_items")
    .select("pmid", { count: "exact", head: true })
    .eq("topic_id", topicId);
  if (error) throw new Error(error.message);
  if ((count ?? 0) >= SECOND_RATER_QUEUE_SIZE) return count ?? 0;

  const already = new Set<string>();
  if ((count ?? 0) > 0) {
    for (let from = 0; ; from += PAGE_FETCH) {
      const { data, error: existingErr } = await supabase
        .from("second_rater_items")
        .select("pmid")
        .eq("topic_id", topicId)
        .range(from, from + PAGE_FETCH - 1);
      if (existingErr) throw new Error(existingErr.message);
      const batch = data ?? [];
      for (const row of batch) {
        const pmid = String((row as { pmid?: string }).pmid ?? "").trim();
        if (pmid) already.add(pmid);
      }
      if (batch.length < PAGE_FETCH) break;
    }
  }

  const candidates: SecondRaterCandidate[] = [];
  for (let from = 0; ; from += PAGE_FETCH) {
    const { data, error: readErr } = await supabase
      .from("summaries")
      .select("pmid, admin_priority, ml_priority")
      .eq("topic_id", topicId)
      .not("admin_priority", "is", null)
      .range(from, from + PAGE_FETCH - 1);
    if (readErr) throw new Error(readErr.message);
    const batch = data ?? [];
    for (const row of batch) {
      const pmid = String((row as { pmid?: string }).pmid ?? "").trim();
      const admin = (row as { admin_priority?: number | null }).admin_priority;
      const ml = (row as { ml_priority?: number | null }).ml_priority;
      if (!pmid || admin == null) continue;
      candidates.push({
        pmid,
        adminPriority: admin,
        mlPriority: ml ?? null,
      });
    }
    if (batch.length < PAGE_FETCH) break;
  }

  const picked = pickSecondRaterQueue(candidates, mulberry32(SEED)).filter(
    (row) => !already.has(row.pmid)
  );
  for (let i = 0; i < picked.length; i += 100) {
    const chunk = picked.slice(i, i + 100).map((row) => ({
      topic_id: topicId,
      pmid: row.pmid,
      position: row.position,
      band: row.band,
      ml_priority: row.mlPriority,
      admin_priority_at_draw: row.adminPriority,
    }));
    const { error: writeErr } = await supabase
      .from("second_rater_items")
      .upsert(chunk, { onConflict: "topic_id,pmid", ignoreDuplicates: true });
    if (writeErr) throw new Error(writeErr.message);
  }
  return already.size + picked.length;
}

export async function secondRaterProgress(
  supabase: SupabaseClient,
  topicId: string
): Promise<{ total: number; rated: number }> {
  const [totalRes, ratedRes] = await Promise.all([
    supabase
      .from("second_rater_items")
      .select("pmid", { count: "exact", head: true })
      .eq("topic_id", topicId),
    supabase
      .from("second_rater_items")
      .select("pmid", { count: "exact", head: true })
      .eq("topic_id", topicId)
      .not("rating", "is", null),
  ]);
  if (totalRes.error) throw new Error(totalRes.error.message);
  if (ratedRes.error) throw new Error(ratedRes.error.message);
  return { total: totalRes.count ?? 0, rated: ratedRes.count ?? 0 };
}

export async function loadSecondRaterCards(options: {
  supabase: SupabaseClient;
  topicId: string;
  page: number;
  pageSize: number;
  unratedOnly: boolean;
  articleUrl: (pmid: string, article: ArticleBits) => string;
}): Promise<{ cards: SecondRaterCard[]; matched: number }> {
  const from = (options.page - 1) * options.pageSize;
  const to = from + options.pageSize - 1;
  let query = options.supabase
    .from("second_rater_items")
    .select("pmid, position, rating", { count: "exact" })
    .eq("topic_id", options.topicId)
    .order("position", { ascending: true })
    .range(from, to);
  if (options.unratedOnly) query = query.is("rating", null);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as {
    pmid: string;
    position: number;
    rating: number | null;
  }[];
  if (rows.length === 0) return { cards: [], matched: count ?? 0 };

  const { data: articles, error: artErr } = await options.supabase
    .from("articles")
    .select(
      "pmid, title, abstract, journal, pub_date, release_date, doi, landing_url, openalex_id, source"
    )
    .in(
      "pmid",
      rows.map((row) => row.pmid)
    );
  if (artErr) throw new Error(artErr.message);
  const byPmid = new Map<string, ArticleBits & { title: string | null }>();
  for (const raw of articles ?? []) {
    const row = raw as ArticleBits & { pmid: string; title: string | null };
    byPmid.set(row.pmid, row);
  }

  const cards = rows.map((row) => {
    const article = byPmid.get(row.pmid);
    return {
      pmid: row.pmid,
      position: row.position,
      rating: row.rating,
      title: article?.title?.trim() || "Untitled",
      journal: article?.journal ?? null,
      date: article?.release_date ?? article?.pub_date ?? null,
      abstract: article?.abstract ?? null,
      url: options.articleUrl(row.pmid, article ?? {}),
    };
  });
  return { cards, matched: count ?? cards.length };
}

type ArticleBits = {
  doi?: string | null;
  landing_url?: string | null;
  openalex_id?: string | null;
  source?: string | null;
  journal?: string | null;
  pub_date?: string | null;
  release_date?: string | null;
  abstract?: string | null;
};

export async function saveSecondRaterScore(options: {
  supabase: SupabaseClient;
  topicId: string;
  pmid: string;
  rating: number | null;
}): Promise<boolean> {
  const { error, data } = await options.supabase
    .from("second_rater_items")
    .update({
      rating: options.rating,
      rated_at: options.rating == null ? null : new Date().toISOString(),
    })
    .eq("topic_id", options.topicId)
    .eq("pmid", options.pmid)
    .select("pmid");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}
