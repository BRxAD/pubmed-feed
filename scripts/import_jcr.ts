import "dotenv/config";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";
import { join } from "path";

const CSV_PATH = join(process.cwd(), "data", "jcr.csv");
const BATCH_SIZE = 500;

function normalizeJournalName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function parseNum(s: unknown): number | null {
  if (s == null || s === "") return null;
  if (typeof s === "number" && !Number.isNaN(s)) return s;
  const str = String(s).trim();
  if (!str) return null;
  const n = parseFloat(str);
  return Number.isNaN(n) ? null : n;
}

function parseIntStrict(s: unknown): number | null {
  if (s == null || s === "") return null;
  if (typeof s === "number" && Number.isInteger(s)) return s;
  const str = String(s).trim();
  if (!str) return null;
  const n = parseInt(str, 10);
  return Number.isNaN(n) ? null : n;
}

function parseStr(s: unknown): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  return t || null;
}

function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const csvContent = readFileSync(CSV_PATH, "utf-8");
  const rows = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  const seen = new Set<string>();
  const records: { journal_name: string; jif_2024: number | null; jcr_rank: number | null; jif_quartile: string | null }[] = [];

  for (const row of rows) {
    const rawName = row["Journal Name"];
    if (rawName == null || String(rawName).trim() === "") continue;

    const journal_name = normalizeJournalName(rawName);
    if (seen.has(journal_name)) continue;
    seen.add(journal_name);

    records.push({
      journal_name,
      jif_2024: parseNum(row["JIF 2024"]),
      jcr_rank: parseIntStrict(row["Rank"]),
      jif_quartile: parseStr(row["JIF Quartile"]),
    });
  }

  const supabase = createClient(url, key);

  run(supabase, records, rows.length).then(
    (upserted) => {
      console.log(`Rows processed: ${rows.length}`);
      console.log(`Rows upserted: ${upserted}`);
    },
    (err) => {
      console.error(err);
      process.exit(1);
    }
  );
}

async function run(
  supabase: SupabaseClient,
  records: { journal_name: string; jif_2024: number | null; jcr_rank: number | null; jif_quartile: string | null }[],
  totalRows: number
): Promise<number> {
  let upserted = 0;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("journal_metrics")
      .upsert(batch, { onConflict: "journal_name" });

    if (error) throw new Error(error.message);
    upserted += batch.length;
  }
  return upserted;
}

main();
