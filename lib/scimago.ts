/**
 * SCImago Journal Rank (2025) Q1 lookup from bundled data/scimago_q1.json.
 */
import "server-only";
import fs from "node:fs";
import path from "node:path";
import { normalizeJournalName } from "@/lib/jif";

export type ScimagoEntry = {
  sjr: number;
  issn: string;
  hIndex: number | null;
  /** Always true in this Q1-only dataset. */
  isQ1: true;
};

type ScimagoState = {
  byName: Map<string, ScimagoEntry>;
  loaded: boolean;
};

let _state: ScimagoState | null = null;

function getState(): ScimagoState {
  if (_state) return _state;

  const state: ScimagoState = { byName: new Map(), loaded: false };
  const csvPath = path.join(process.cwd(), "data", "scimago_q1.json");
  try {
    const raw = fs.readFileSync(csvPath, "utf-8");
    const parsed = JSON.parse(raw) as {
      byName?: Record<
        string,
        { sjr?: number; issn?: string; hIndex?: number | null }
      >;
    };
    for (const [name, row] of Object.entries(parsed.byName ?? {})) {
      const sjr = Number(row.sjr);
      if (!name || !Number.isFinite(sjr) || sjr <= 0) continue;
      state.byName.set(normalizeJournalName(name), {
        sjr,
        issn: String(row.issn ?? ""),
        hIndex: row.hIndex ?? null,
        isQ1: true,
      });
    }
    state.loaded = true;
  } catch {
    // Missing file — Q1 lookups return false/null
  }

  _state = state;
  return state;
}

/** True when the journal is in the SCImago 2025 Q1 list. */
export function isQ1Journal(journalName: string | null | undefined): boolean {
  if (!journalName) return false;
  return getState().byName.has(normalizeJournalName(journalName));
}

/** SCImago SJR for Q1 journals; null if not in the Q1 list. */
export function lookupScimago(journalName: string | null | undefined): ScimagoEntry | null {
  if (!journalName) return null;
  return getState().byName.get(normalizeJournalName(journalName)) ?? null;
}

export function getScimagoQ1Count(): number {
  return getState().byName.size;
}
