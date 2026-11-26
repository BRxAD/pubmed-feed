/**
 * Write summaries for recent papers that were stored without one.
 * Skips story photos. Repeats until the window is clear or a batch saves nothing.
 *
 *   npx tsx --tsconfig scripts/priority-eval/tsconfig.json --env-file=.env.local scripts/summarize-unsummarized-recent.ts 2026-11-26T05:00:00.000Z
 */
import { createClient } from "@supabase/supabase-js";
import { summarizeRecentUnsummarized } from "@/lib/ingest/summarizeCatchUp";

const MAIN_TOPIC_ID = "435b819a-2d8b-441f-b24a-e09ab79c212e";
const BATCH = 10;

async function main() {
  const sinceIso = process.argv[2]?.trim() || "2026-11-26T05:00:00.000Z";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: topic, error: topicErr } = await supabase
    .from("topics")
    .select("id, query_string, ranking_weights")
    .eq("id", MAIN_TOPIC_ID)
    .single();
  if (topicErr || !topic) throw new Error(topicErr?.message ?? "topic missing");

  let stored = 0;
  for (let pass = 1; pass <= 12; pass++) {
    const result = await summarizeRecentUnsummarized({
      supabase,
      topicId: topic.id,
      queryString: String(topic.query_string ?? ""),
      rankingWeights: topic.ranking_weights as Record<string, unknown> | null,
      maxSummaries: BATCH,
      sinceIso,
    });
    stored += result.storedSummaries;
    console.log(
      `pass ${pass}: attempted ${result.summarizeAttempted}, stored ${result.storedSummaries}, failed ${result.summarizeFailed}`
    );
    if (result.summarizeErrors.length > 0) {
      console.log(result.summarizeErrors.join("\n"));
    }
    if (result.summarizeAttempted === 0) break;
    if (result.storedSummaries === 0) {
      throw new Error(
        result.summarizeErrors[0] ?? "Summaries were attempted and none were saved"
      );
    }
  }
  console.log(`done. stored ${stored} since ${sinceIso}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
