/**
 * Journal Impact Factor (JIF 2024) lookup from the bundled JCR CSV.
 *
 * Parses data/jcr.csv once at server startup and caches the result.
 * Falls back gracefully if the file is missing or unreadable.
 *
 * CSV columns (0-indexed):
 *   0: Rank  1: Journal Name  2: JCR Year  3: Abbreviated Journal
 *   4: Publisher  5: ISSN  6: eISSN  7: Total Cites
 *   8: Total Articles  9: Citable Items  10: Cited Half-Life
 *   11: Citing Half-Life  12: JIF 2024  ...
 */
import "server-only";
import fs from "node:fs";
import path from "node:path";

// ── Types ─────────────────────────────────────────────────────────────────────

export type JifEntry = {
  jif: number;
  quartile: string; // Q1–Q4 or ""
};

// ── CSV helpers ────────────────────────────────────────────────────────────────

/** Normalize a journal name for consistent matching. */
export function normalizeJournalName(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

/**
 * Simple CSV line splitter that handles double-quoted fields.
 * Good enough for the JCR CSV format.
 */
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

// ── Singleton state ────────────────────────────────────────────────────────────

type JifState = {
  /** full-name → JIF entry */
  byName: Map<string, JifEntry>;
  /** abbreviated name → JIF entry */
  byAbbrev: Map<string, JifEntry>;
  /** JIF value at the 50th percentile (median) — threshold for "high impact" */
  medianJif: number;
  loaded: boolean;
};

let _state: JifState | null = null;

function getState(): JifState {
  if (_state) return _state;

  const state: JifState = {
    byName: new Map(),
    byAbbrev: new Map(),
    medianJif: 0,
    loaded: false,
  };

  const csvPath = path.join(process.cwd(), "data", "jcr.csv");
  let raw: string;
  try {
    raw = fs.readFileSync(csvPath, "utf-8");
  } catch {
    // File missing — JIF lookup will always return null (no boost applied)
    _state = state;
    return state;
  }

  const lines = raw.split(/\r?\n/);
  // line 0 is the header

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = splitCsvLine(line);
    if (cols.length < 17) continue;

    const journalName = normalizeJournalName(cols[1]);
    const abbrevName = normalizeJournalName(cols[3]);
    const jifStr = cols[12].replace(/[^0-9.]/g, "");
    const jif = parseFloat(jifStr);
    const quartile = (cols[16] ?? "").trim();

    if (!journalName || !Number.isFinite(jif) || jif <= 0) continue;

    const entry: JifEntry = { jif, quartile };

    // Keep the highest JIF when the same journal appears more than once
    const existing = state.byName.get(journalName);
    if (!existing || jif > existing.jif) {
      state.byName.set(journalName, entry);
    }
    if (abbrevName) {
      const existingAbbrev = state.byAbbrev.get(abbrevName);
      if (!existingAbbrev || jif > existingAbbrev.jif) {
        state.byAbbrev.set(abbrevName, entry);
      }
    }
  }

  // Compute median JIF (the boundary between top-50% and bottom-50%)
  const allJifs = [...state.byName.values()]
    .map((e) => e.jif)
    .sort((a, b) => a - b);

  const midIdx = Math.floor(allJifs.length / 2);
  state.medianJif = allJifs.length > 0 ? (allJifs[midIdx] ?? 0) : 0;
  state.loaded = true;

  _state = state;
  return state;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Look up the JIF 2024 entry for a journal.
 * Tries the full name first, then the abbreviated form.
 * Returns null when the journal is not in the dataset.
 */
export function lookupJif(journalName: string | null | undefined): JifEntry | null {
  if (!journalName) return null;
  const state = getState();
  const norm = normalizeJournalName(journalName);
  return state.byName.get(norm) ?? state.byAbbrev.get(norm) ?? null;
}

/**
 * Returns true when the journal's JIF is at or above the dataset median
 * (i.e. it sits in the top 50% of journals by impact factor).
 */
export function isHighImpactJournal(journalName: string | null | undefined): boolean {
  const entry = lookupJif(journalName);
  if (!entry) return false;
  const state = getState();
  return state.medianJif > 0 && entry.jif >= state.medianJif;
}

/** Expose the median for admin display. */
export function getMedianJif(): number {
  return getState().medianJif;
}
