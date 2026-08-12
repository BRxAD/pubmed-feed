/**
 * Backfill summaries.auto_settings from title + keywords + MeSH (no abstracts).
 * Prefer --dry-run first. Requires scripts/add_auto_settings.sql applied.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-auto-settings.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/backfill-auto-settings.ts
 */
import { createClient } from "@supabase/supabase-js";
import { classifyArticleSettings } from "../lib/classifySetting";

const PAGE = 200;
const dryRun = process.argv.includes("--dry-run");

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function main() {
  const supabase = getSupabase();
  let updated = 0;
  let scanned = 0;
  let offset = 0;

  console.log(
    `[backfill-auto-settings] ${dryRun ? "DRY RUN — " : ""}title+keywords+MeSH only (no abstracts).`
  );

  for (;;) {
    const { data, error } = await supabase
      .from("summaries")
      .select(
        "topic_id, pmid, auto_settings, articles!inner(title, keywords, mesh_terms)"
      )
      .is("auto_settings", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE - 1);

    if (error) {
      if (/auto_settings/i.test(error.message)) {
        throw new Error(
          "auto_settings column missing — run scripts/add_auto_settings.sql in Supabase first"
        );
      }
      throw new Error(error.message);
    }

    const batch = data ?? [];
    if (batch.length === 0) break;

    for (const row of batch) {
      scanned += 1;
      const r = row as {
        topic_id: string;
        pmid: string;
        articles?: {
          title?: string | null;
          keywords?: string[] | null;
          mesh_terms?: string[] | null;
        } | null;
      };
      const settings = classifyArticleSettings({
        title: r.articles?.title,
        abstract: null,
        keywords: r.articles?.keywords ?? [],
        meshTerms: r.articles?.mesh_terms ?? [],
      });

      if (dryRun) {
        if (settings.length > 0) updated += 1;
        continue;
      }

      const { error: upErr } = await supabase
        .from("summaries")
        .update({ auto_settings: settings })
        .eq("topic_id", r.topic_id)
        .eq("pmid", r.pmid);

      if (upErr) {
        console.warn(`[backfill] ${r.pmid}: ${upErr.message}`);
        continue;
      }
      updated += 1;
    }

    console.log(
      `[backfill-auto-settings] scanned ${scanned}, wrote/would-write ${updated}`
    );

    if (batch.length < PAGE) break;
    // After updates, null rows shift — keep offset 0 when writing.
    if (dryRun) offset += PAGE;
  }

  console.log(
    `[backfill-auto-settings] done. scanned=${scanned} updated=${updated} dryRun=${dryRun}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
