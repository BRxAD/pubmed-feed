/**
 * Fill articles.cited_by_count from OpenAlex for every article.
 * Slim: pmid, doi, openalex id in; one integer out. Batches of 100.
 *
 *   npx tsx --env-file=.env.local scripts/backfill-citations.ts
 *   npx tsx --env-file=.env.local scripts/backfill-citations.ts --max-batches=40
 */
import { createClient } from "@supabase/supabase-js";
import { syncCitationCounts } from "../lib/citations/sync";

function argValue(name: string): number | null {
  const hit = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (!hit) return null;
  const n = Number(hit.slice(name.length + 1));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const maxBatches = argValue("--max-batches") ?? 120;
  let rounds = 0;
  let checked = 0;
  let matched = 0;
  let notFound = 0;

  for (;;) {
    const result = await syncCitationCounts(supabase, { maxBatches });
    rounds += 1;
    checked += result.checked;
    matched += result.matched;
    notFound += result.notFound;
    console.log(
      `[citations] round ${rounds}: checked ${result.checked}, matched ${result.matched}, not in OpenAlex ${result.notFound}`
    );
    if (result.checked === 0 || result.batches < maxBatches) break;
    if (rounds >= 8) break;
  }

  console.log(
    `[citations] done. checked ${checked}, matched ${matched}, not in OpenAlex ${notFound}`
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
