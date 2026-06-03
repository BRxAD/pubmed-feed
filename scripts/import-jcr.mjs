/**
 * Import JCR journal impact factors from data/jcr.csv into Supabase journal_metrics.
 *
 * Usage:
 *   set SUPABASE_URL=https://xxxx.supabase.co
 *   set SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *   node scripts/import-jcr.mjs
 *
 * Or create a .env.local and run with:
 *   node -r dotenv/config scripts/import-jcr.mjs dotenv_config_path=.env.local
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = join(__dirname, "..", "data", "jcr.csv");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY env vars."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function normalizeJournalName(name) {
  return (name ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

function parseFloat2(s) {
  if (!s || !s.trim() || s.trim() === "N/A") return null;
  const n = parseFloat(s.trim());
  return Number.isFinite(n) ? n : null;
}

function parseCsvLine(line) {
  // Simple CSV parser that handles quoted fields
  const fields = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

async function main() {
  console.log("Reading", CSV_PATH);
  const raw = readFileSync(CSV_PATH, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());

  // Parse header
  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const journalNameIdx = header.findIndex((h) => h.toLowerCase() === "journal name");
  const jifIdx = header.findIndex((h) => h.toLowerCase() === "jif 2024");
  const issnIdx = header.findIndex((h) => h.toLowerCase() === "issn");
  const eissnIdx = header.findIndex((h) => h.toLowerCase() === "eissn");

  if (journalNameIdx === -1 || jifIdx === -1) {
    console.error("Could not find 'Journal Name' or 'JIF 2024' column in CSV.");
    console.error("Found columns:", header);
    process.exit(1);
  }

  console.log(
    `Found ${lines.length - 1} data rows. Using columns: journal_name[${journalNameIdx}], jif_2024[${jifIdx}]`
  );

  // Build unique rows (deduplicate by normalized journal_name, keep highest JIF)
  const byName = new Map();
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const rawName = fields[journalNameIdx]?.trim() ?? "";
    if (!rawName) continue;
    const name = normalizeJournalName(rawName);
    const jif = parseFloat2(fields[jifIdx]);
    const issn = fields[issnIdx]?.trim() || null;
    const eissn = fields[eissnIdx]?.trim() || null;

    const existing = byName.get(name);
    if (!existing || (jif != null && (existing.jif_2024 == null || jif > existing.jif_2024))) {
      byName.set(name, { journal_name: name, jif_2024: jif, issn, eissn });
    }
  }

  const rows = Array.from(byName.values());
  console.log(`Unique journals to upsert: ${rows.length}`);

  // Upsert in batches of 500
  const BATCH = 500;
  let upserted = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from("journal_metrics")
      .upsert(chunk, { onConflict: "journal_name" });

    if (error) {
      console.error(`Batch ${i / BATCH + 1} error:`, error.message);
      errors++;
    } else {
      upserted += chunk.length;
      process.stdout.write(`\rUpserted ${upserted}/${rows.length}...`);
    }
  }

  console.log(`\nDone. ${upserted} rows upserted, ${errors} batch errors.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
