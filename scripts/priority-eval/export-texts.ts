/**
 * Export pmid, rating, title, abstract for embedding experiments.
 *
 *   npx tsx --tsconfig scripts/priority-eval/tsconfig.json \
 *     scripts/priority-eval/export-texts.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const OUT = "scripts/priority-eval/data/priority-texts.jsonl";
const CSV = "scripts/priority-eval/data/priority-dataset.csv";

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

function parsePmids(): { pmid: string; rating: number }[] {
  const lines = readFileSync(CSV, "utf8").trim().split(/\r?\n/);
  const hdr = lines[0].split(",");
  const pi = hdr.indexOf("pmid");
  const ri = hdr.indexOf("rating");
  const rows: { pmid: string; rating: number }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const pmid = cols[pi]?.trim();
    const rating = Number(cols[ri]);
    if (pmid && Number.isFinite(rating)) rows.push({ pmid, rating });
  }
  return rows;
}

function csvEscape(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const env = loadEnv();
  const supabase = createClient(
    env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  );
  const rated = parsePmids();
  const ratingByPmid = new Map(rated.map((r) => [r.pmid, r.rating]));
  const pmids = [...ratingByPmid.keys()];

  const { data: topics } = await supabase.from("topics").select("id, name");
  const topic = (topics ?? []).find(
    (t) =>
      /antimicrobial stewardship/i.test(String(t.name)) &&
      !/artificial intelligence/i.test(String(t.name))
  );
  if (!topic) throw new Error("topic not found");

  const arts = new Map<
    string,
    { title: string; abstract: string }
  >();
  for (let i = 0; i < pmids.length; i += 200) {
    const chunk = pmids.slice(i, i + 200);
    const { data, error } = await supabase
      .from("summaries")
      .select("pmid, articles!inner(title, abstract)")
      .eq("topic_id", topic.id)
      .in("pmid", chunk);
    if (error) throw new Error(error.message);
    for (const raw of data ?? []) {
      const row = raw as unknown as {
        pmid: string;
        articles: { title: string | null; abstract: string | null };
      };
      arts.set(row.pmid, {
        title: (row.articles.title ?? "").trim(),
        abstract: (row.articles.abstract ?? "").trim(),
      });
    }
  }

  mkdirSync("scripts/priority-eval/data", { recursive: true });
  const outLines: string[] = [];
  let n = 0;
  for (const pmid of pmids) {
    const a = arts.get(pmid);
    if (!a?.title) continue;
    const text = `${a.title}\n${a.abstract}`.trim();
    outLines.push(
      JSON.stringify({
        pmid,
        rating: ratingByPmid.get(pmid),
        title: a.title,
        abstract: a.abstract,
        text,
      })
    );
    n++;
  }
  writeFileSync(OUT, outLines.join("\n") + "\n", "utf8");
  console.log(`wrote ${n} rows to ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
