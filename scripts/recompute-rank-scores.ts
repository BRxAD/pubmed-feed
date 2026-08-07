/**
 * Backfill summaries.rank_score from title/abstract + topic weights.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/recompute-rank-scores.ts
 *   npx tsx --env-file=.env.local scripts/recompute-rank-scores.ts --topic=main
 *   npx tsx --env-file=.env.local scripts/recompute-rank-scores.ts --limit=500
 */
import { createClient } from "@supabase/supabase-js";
import { computeStoredRankScore } from "../lib/rankScore";
import {
  mergeLearnedWeights,
  mergeStoredFeedSettings,
} from "../lib/relevanceLearning";
import { toPenaltyWeights } from "../lib/brief/feedSettings";
import type { PubMedRecord } from "../lib/pubmed/efetch";

function getEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

async function main() {
  const args = process.argv.slice(2);
  const topicArg =
    args.find((a) => a.startsWith("--topic="))?.slice("--topic=".length) ??
    "main";
  const limitArg = args.find((a) => a.startsWith("--limit="))?.slice("--limit=".length);
  const limit = limitArg ? Math.max(1, parseInt(limitArg, 10) || 0) : 0;

  const supabase = createClient(
    getEnv("NEXT_PUBLIC_SUPABASE_URL") || getEnv("SUPABASE_URL"),
    getEnv("SUPABASE_SERVICE_ROLE_KEY")
  );

  let topicQuery = supabase
    .from("topics")
    .select("id, name, query_string, ranking_weights");

  if (topicArg === "main") {
    topicQuery = topicQuery.ilike("name", "%antimicrobial stewardship%");
  } else {
    topicQuery = topicQuery.eq("id", topicArg);
  }

  const { data: topics, error: topicErr } = await topicQuery.limit(10);
  if (topicErr) throw topicErr;
  if (!topics?.length) throw new Error("No topics found");

  const topic =
    topicArg === "main"
      ? topics.find(
          (t) =>
            !String(t.name ?? "")
              .toLowerCase()
              .includes("artificial intelligence")
        ) ?? topics[0]
      : topics[0];

  const queryString = String(topic.query_string ?? "").trim();
  if (!queryString) throw new Error("Topic has no query_string");

  const weights = mergeLearnedWeights(
    topic.ranking_weights as Record<string, unknown> | null
  );
  const feedSettings = mergeStoredFeedSettings(
    topic.ranking_weights as Record<string, unknown> | null
  );
  const scoringOptions = {
    ...toPenaltyWeights(feedSettings),
    smallSampleMax: feedSettings.brief.smallSampleMax,
    largeStudyThreshold: feedSettings.brief.largeStudyThreshold,
  };

  const pageSize = 200;
  let from = 0;
  let updated = 0;
  let scanned = 0;

  for (;;) {
    if (limit > 0 && scanned >= limit) break;

    const { data, error } = await supabase
      .from("summaries")
      .select(
        "pmid, admin_priority, articles!inner(title, abstract, journal, pub_date, publication_types, keywords, mesh_terms)"
      )
      .eq("topic_id", topic.id)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) break;

    for (const row of rows as Array<{
      pmid: string;
      articles?: {
        title?: string | null;
        abstract?: string | null;
        journal?: string | null;
        pub_date?: string | null;
        publication_types?: string[] | null;
        keywords?: string[] | null;
        mesh_terms?: string[] | null;
      } | null;
    }>) {
      if (limit > 0 && scanned >= limit) break;
      scanned += 1;
      const a = row.articles;
      const rec: PubMedRecord = {
        pmid: row.pmid,
        title: a?.title ?? null,
        abstract: a?.abstract ?? null,
        journal: a?.journal ?? null,
        pubDate: a?.pub_date ?? null,
        publicationTypes: a?.publication_types ?? [],
        meshTerms: a?.mesh_terms ?? [],
        keywords: a?.keywords ?? [],
        authors: [],
      };
      const rank_score = computeStoredRankScore({
        queryString,
        rec,
        weights,
        scoringOptions,
      });
      const { error: upErr } = await supabase
        .from("summaries")
        .update({ rank_score })
        .eq("topic_id", topic.id)
        .eq("pmid", row.pmid);
      if (upErr) {
        console.warn(`update ${row.pmid}:`, upErr.message);
        continue;
      }
      updated += 1;
    }

    console.log(`[recompute-rank-scores] scanned=${scanned} updated=${updated}`);
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  console.log(
    `[recompute-rank-scores] done topic=${topic.name} scanned=${scanned} updated=${updated}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
