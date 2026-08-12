/**
 * Retrain the priority model for every topic (force — ignores weekly gate).
 * Scheduled retrain: GET /api/cron/retrain-priority (weekly via daily check).
 *
 *   npm run retrain:priority
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { runScheduledPriorityRetrain } from "@/lib/brief/retrainSchedule";

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

  const result = await runScheduledPriorityRetrain(supabase, { force: true });
  for (const row of result.results) {
    if (row.error) {
      console.log(`${row.topicName}: error — ${row.error}`);
      continue;
    }
    if (row.reason === "not_enough_ratings") {
      console.log(`${row.topicName}: not enough ratings, model cleared`);
      continue;
    }
    console.log(
      `${row.topicName}: trained on ${row.sampleCount} ratings at ${row.trainedAt}`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
