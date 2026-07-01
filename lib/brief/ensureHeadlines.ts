import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateBriefHeadline,
  headlineFromSummaryText,
  headlineNeedsGeneration,
} from "@/lib/brief/generateHeadline";

const CONCURRENCY = 4;

type HeadlineCandidate = {
  pmid: string;
  title: string;
  abstract: string | null;
  summaryText: string;
  bottomLine: string | null;
  storedHeadline: string | null | undefined;
  headline: string;
};

async function persistHeadline(
  supabase: SupabaseClient,
  topicId: string,
  pmid: string,
  headline: string
): Promise<void> {
  const { error } = await supabase
    .from("summaries")
    .update({ headline })
    .eq("topic_id", topicId)
    .eq("pmid", pmid);

  if (error && !error.message.toLowerCase().includes("headline")) {
    console.warn("[ensureHeadlines] persist failed:", pmid, error.message);
  }
}

/**
 * Generate missing headlines via OpenAI and cache in Supabase.
 * Mutates candidates in place.
 */
export async function ensureBriefHeadlines(
  topicId: string,
  supabase: SupabaseClient,
  candidates: HeadlineCandidate[]
): Promise<void> {
  const toGenerate = candidates.filter((c) => {
    if (!c.abstract?.trim()) return false;
    return headlineNeedsGeneration(
      c.storedHeadline,
      c.summaryText,
      c.bottomLine
    );
  });

  if (toGenerate.length === 0) return;

  for (let i = 0; i < toGenerate.length; i += CONCURRENCY) {
    const batch = toGenerate.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (c) => {
        try {
          const headline = await generateBriefHeadline({
            title: c.title,
            abstract: c.abstract!,
          });
          c.headline = headline;
          await persistHeadline(supabase, topicId, c.pmid, headline);
        } catch (err) {
          console.warn(
            "[ensureHeadlines]",
            c.pmid,
            err instanceof Error ? err.message : err
          );
          const fromSummary = headlineFromSummaryText(c.summaryText);
          if (fromSummary) c.headline = fromSummary;
        }
      })
    );
  }
}

export function resolveStoredHeadline(
  storedHeadline: string | null | undefined,
  summaryText: string,
  title: string
): string {
  if (storedHeadline?.trim()) return storedHeadline.trim();
  const fromSummary = headlineFromSummaryText(summaryText);
  if (fromSummary) return fromSummary;
  return title.trim();
}
