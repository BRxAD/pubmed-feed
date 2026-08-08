import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PubMedRecord } from "@/lib/pubmed/efetch";
import type { RankingWeights } from "@/lib/ranking";
import {
  getOrCreateEmbeddings,
  l2Normalize,
} from "@/lib/brief/embeddings";
import {
  loadPriorityModel,
  predictArticlePriority,
} from "@/lib/brief/priorityModel";

/**
 * First ML rating for newly summarized articles: mint/load embeddings once,
 * apply the stored priority model (incl. PCA), return 1–10 scores in order.
 * Intended for ingest — not page loads.
 */
export async function scoreFirstMlPriorities(
  supabase: SupabaseClient,
  topicId: string,
  items: { rec: PubMedRecord; queryString: string; weights: RankingWeights }[]
): Promise<(number | null)[]> {
  if (items.length === 0) return [];

  const model = await loadPriorityModel(supabase, topicId);
  let embeddings: (number[] | null)[] = items.map(() => null);
  try {
    embeddings = await getOrCreateEmbeddings(
      supabase,
      items.map(({ rec }) => ({
        pmid: rec.pmid,
        title: rec.title,
        abstract: rec.abstract,
      }))
    );
  } catch (err) {
    console.warn(
      "[firstRating] embeddings failed; scoring handcrafted-only:",
      err instanceof Error ? err.message : err
    );
  }

  return items.map((item, i) => {
    try {
      const emb = embeddings[i];
      const { priority } = predictArticlePriority({
        rec: item.rec,
        queryString: item.queryString,
        weights: item.weights,
        model,
        embedding: emb ? l2Normalize(emb) : null,
      });
      return priority;
    } catch (err) {
      console.warn(
        `[firstRating] predict failed ${item.rec.pmid}:`,
        err instanceof Error ? err.message : err
      );
      return null;
    }
  });
}
