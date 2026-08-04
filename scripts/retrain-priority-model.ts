/**
 * Retrain the priority model for every topic, without waiting for an admin to
 * save a rating. Needed after the feature vector or clinical vocabulary
 * changes, since a stored model from an older version is discarded on load.
 *
 *   npm run retrain:priority
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { relearnPriorityModel } from "@/lib/brief/priorityModel";
import { mergeFeedSettings, toRankingWeights } from "@/lib/brief/feedSettings";

function loadEnv(): Record<string, string> {
  const raw = readFileSync(".env.local", "utf8");
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}

async function main() {
  const env = loadEnv();
  const supabase = createClient(
    env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  );

  const { data: topics, error } = await supabase
    .from("topics")
    .select("id, name, query_string, ranking_weights");
  if (error) throw new Error(error.message);

  for (const topic of topics ?? []) {
    const settings = mergeFeedSettings(
      topic.ranking_weights as Record<string, unknown> | null
    );
    const model = await relearnPriorityModel(
      String(topic.id),
      supabase,
      String(topic.query_string ?? "").trim(),
      toRankingWeights(settings)
    );

    if (!model) {
      console.log(`${topic.name}: not enough ratings, model cleared`);
      continue;
    }
    console.log(
      `${topic.name}: trained on ${model.sampleCount} ratings, ` +
        `${model.featureNames.length} features, bias ${model.bias.toFixed(2)}`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
