/**
 * One-shot backfill: write summaries.ml_priority for rows that have no human
 * admin_priority and no stored ml_priority yet, using the current priority
 * model with embeddings forced off (handcrafted / PCA-zero path).
 *
 * Does NOT read or write emb:* cache in app_settings.
 * Does NOT overwrite admin_priority or existing ml_priority.
 *
 * Usage:
 *   npm run backfill:ml-priority -- --dry-run
 *   npm run backfill:ml-priority -- --months=12
 *   npm run backfill:ml-priority -- --months=6 --limit=200
 *   npm run backfill:ml-priority -- --topic=main --batch=25
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  loadPriorityModel,
  predictArticlePriority,
} from "@/lib/brief/priorityModel";
import { mergeLearnedWeights } from "@/lib/relevanceLearning";
import type { PubMedRecord } from "@/lib/pubmed/efetch";

function loadEnvFile(): void {
  let raw: string;
  try {
    raw = readFileSync(".env.local", "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    if (!key || process.env[key] != null) continue;
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[key] = v;
  }
}

function requireEnv(...names: string[]): string {
  for (const name of names) {
    const v = process.env[name]?.trim();
    if (v) return v;
  }
  throw new Error(`Missing env ${names.join(" or ")}`);
}

function argValue(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return args.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  loadEnvFile();
  const args = process.argv.slice(2);
  const topicArg = argValue(args, "topic") ?? "main";
  const months = Math.max(
    1,
    Math.min(24, parseInt(argValue(args, "months") ?? "12", 10) || 12)
  );
  const limitArg = argValue(args, "limit");
  const limit = limitArg ? Math.max(1, parseInt(limitArg, 10) || 0) : 0;
  const batchSize = Math.max(
    1,
    Math.min(100, parseInt(argValue(args, "batch") ?? "40", 10) || 40)
  );
  const dryRun = hasFlag(args, "dry-run");

  const since = isoDaysAgo(Math.round(months * 30.4375));

  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY")
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
  const model = await loadPriorityModel(supabase, String(topic.id));

  const eligibleBase = () =>
    supabase
      .from("summaries")
      .select(
        dryRun
          ? "pmid, articles!inner(release_date, pub_date)"
          : "pmid, articles!inner(title, abstract, journal, pub_date, release_date, publication_types, keywords, mesh_terms, authors)",
        dryRun ? { count: "exact", head: true } : undefined
      )
      .eq("topic_id", topic.id)
      .is("admin_priority", null)
      .is("ml_priority", null)
      .or(`release_date.gte.${since},pub_date.gte.${since}`, {
        foreignTable: "articles",
      });

  if (dryRun) {
    const { count, error } = await eligibleBase();
    if (error) throw error;
    console.log(
      `[backfill-ml-priority] dry-run topic=${topic.name} months=${months} since=${since} eligible≈${count ?? 0} model=${model ? `v${model.version} n=${model.sampleCount}` : "fallback"}`
    );
    console.log(
      "[backfill-ml-priority] handcrafted-only; no emb cache read/write. Re-run without --dry-run to write."
    );
    return;
  }

  console.log(
    `[backfill-ml-priority] topic=${topic.name} months=${months} since=${since} batch=${batchSize}` +
      (limit ? ` limit=${limit}` : "") +
      ` model=${model ? `v${model.version} n=${model.sampleCount}` : "fallback"}`
  );
  console.warn(
    "[backfill-ml-priority] one-time abstract egress for eligible rows (no embedding JSON)."
  );

  let updated = 0;
  let scanned = 0;
  let failed = 0;

  // Always fetch from the start: updated rows drop out of the null filter.
  for (;;) {
    if (limit > 0 && scanned >= limit) break;

    const take =
      limit > 0 ? Math.min(batchSize, limit - scanned) : batchSize;

    const { data, error } = await supabase
      .from("summaries")
      .select(
        "pmid, articles!inner(title, abstract, journal, pub_date, release_date, publication_types, keywords, mesh_terms, authors)"
      )
      .eq("topic_id", topic.id)
      .is("admin_priority", null)
      .is("ml_priority", null)
      .or(`release_date.gte.${since},pub_date.gte.${since}`, {
        foreignTable: "articles",
      })
      .order("pmid", { ascending: true })
      .limit(take);

    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) break;

    const pending: { pmid: string; priority: number }[] = [];

    for (const row of rows as Array<{
      pmid: string;
      articles?: {
        title?: string | null;
        abstract?: string | null;
        journal?: string | null;
        pub_date?: string | null;
        release_date?: string | null;
        publication_types?: string[] | null;
        keywords?: string[] | null;
        mesh_terms?: string[] | null;
        authors?: string[] | null;
      } | null;
    }>) {
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
        authors: a?.authors ?? [],
      };

      let priority: number;
      try {
        priority = predictArticlePriority({
          rec,
          queryString,
          weights,
          model,
          embedding: null,
        }).priority;
      } catch (err) {
        failed += 1;
        console.warn(
          `predict ${row.pmid}:`,
          err instanceof Error ? err.message : err
        );
        continue;
      }

      pending.push({ pmid: row.pmid, priority });
    }

    const writeResults = await Promise.all(
      pending.map(async ({ pmid, priority }) => {
        const { data: written, error: upErr } = await supabase
          .from("summaries")
          .update({ ml_priority: priority })
          .eq("topic_id", topic.id)
          .eq("pmid", pmid)
          .is("admin_priority", null)
          .is("ml_priority", null)
          .select("pmid");
        if (upErr) return { ok: false as const, pmid, err: upErr.message };
        return {
          ok: true as const,
          pmid,
          wrote: Boolean(written?.length),
        };
      })
    );

    for (const r of writeResults) {
      if (!r.ok) {
        failed += 1;
        console.warn(`update ${r.pmid}:`, r.err);
        continue;
      }
      if (r.wrote) updated += 1;
    }

    console.log(
      `[backfill-ml-priority] scanned=${scanned} updated=${updated} failed=${failed}`
    );

    if (rows.length < take) break;
  }

  console.log(
    `[backfill-ml-priority] done topic=${topic.name} scanned=${scanned} updated=${updated} failed=${failed}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
