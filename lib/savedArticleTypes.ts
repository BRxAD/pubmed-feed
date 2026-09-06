export type SavedBriefItem = {
  pmid: string;
  title: string;
  pubmedUrl: string;
};

const PMID_RE = /^\d{1,20}$/;
const MAX_SAVED = 200;

export function sanitizePmid(raw: unknown): string | null {
  const pmid = String(raw ?? "").trim();
  return PMID_RE.test(pmid) ? pmid : null;
}

export function sanitizeSavedItem(raw: {
  pmid?: unknown;
  title?: unknown;
  pubmedUrl?: unknown;
}): SavedBriefItem | null {
  const pmid = sanitizePmid(raw.pmid);
  if (!pmid) return null;
  const title = String(raw.title ?? "").trim() || `PMID ${pmid}`;
  const pubmedUrl =
    String(raw.pubmedUrl ?? "").trim() ||
    `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
  return { pmid, title: title.slice(0, 500), pubmedUrl: pubmedUrl.slice(0, 500) };
}

export function capSavedItems(items: SavedBriefItem[]): SavedBriefItem[] {
  return items.slice(0, MAX_SAVED);
}

/** Prefer newer/local order first; fill gaps from remote without duplicates. */
export function mergeSavedLists(
  preferred: SavedBriefItem[],
  other: SavedBriefItem[]
): SavedBriefItem[] {
  const seen = new Set<string>();
  const out: SavedBriefItem[] = [];
  for (const item of [...preferred, ...other]) {
    const clean = sanitizeSavedItem(item);
    if (!clean || seen.has(clean.pmid)) continue;
    seen.add(clean.pmid);
    out.push(clean);
  }
  return capSavedItems(out);
}
