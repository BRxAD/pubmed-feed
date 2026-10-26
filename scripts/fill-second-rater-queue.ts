/**
 * Build the /feed2 queue once. Safe to re-run: it does nothing if rows exist.
 *
 *   npx tsx --tsconfig scripts/priority-eval/tsconfig.json --env-file=.env.local scripts/fill-second-rater-queue.ts
 */
import { ensureSecondRaterQueue } from "@/lib/brief/secondRater";
import { getDefaultTopicId } from "@/lib/feed";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

async function main() {
  const topicId = await getDefaultTopicId();
  if (!topicId) throw new Error("No default topic");
  const n = await ensureSecondRaterQueue(getSupabaseServerClient(), topicId);
  console.log(`second-rater queue: ${n}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
