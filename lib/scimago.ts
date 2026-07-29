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

export type ScimagoJournalListItem = {
  name: string;
  sjr: number;
  issn: string;
  hIndex: number | null;
};

type ScimagoState = {
  byName: Map<string, ScimagoEntry>;
  /** Original display names for browsing (sorted by SJR desc). */
  list: ScimagoJournalListItem[];
  loaded: boolean;
};

let _state: ScimagoState | null = null;

function getState(): ScimagoState {
  if (_state) return _state;

  const state: ScimagoState = {
    byName: new Map(),
    list: [],
    loaded: false,
  };
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
      const entry: ScimagoEntry = {
        sjr,
        issn: String(row.issn ?? ""),
        hIndex: row.hIndex ?? null,
        isQ1: true,
      };
      state.byName.set(normalizeJournalName(name), entry);
      state.list.push({
        name,
        sjr: entry.sjr,
        issn: entry.issn,
        hIndex: entry.hIndex,
      });
    }
    state.list.sort((a, b) => b.sjr - a.sjr || a.name.localeCompare(b.name));
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
export function lookupScimago(
  journalName: string | null | undefined
): ScimagoEntry | null {
  if (!journalName) return null;
  return getState().byName.get(normalizeJournalName(journalName)) ?? null;
}

export function getScimagoQ1Count(): number {
  return getState().byName.size;
}

/** Search / page the SCImago 2025 Q1 journal list (name contains query). */
export function searchScimagoQ1Journals(options?: {
  q?: string;
  limit?: number;
  offset?: number;
}): { total: number; count: number; items: ScimagoJournalListItem[] } {
  const q = (options?.q ?? "").trim().toLowerCase();
  const limit = Math.min(200, Math.max(1, options?.limit ?? 50));
  const offset = Math.max(0, options?.offset ?? 0);
  const all = getState().list;
  const filtered = q
    ? all.filter(
        (j) =>
          j.name.toLowerCase().includes(q) ||
          j.issn.replace(/[,\s]/g, "").includes(q.replace(/[,\s-]/g, ""))
      )
    : all;
  return {
    total: filtered.length,
    count: all.length,
    items: filtered.slice(offset, offset + limit),
  };
}
