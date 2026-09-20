/** Normalize a DOI to `10.xxxx/...` (lowercase, no URL prefix). */
export function normalizeDoi(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  let s = raw.trim();
  s = s.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
  s = s.replace(/^doi:\s*/i, "");
  s = s.trim().toLowerCase();
  if (!s.startsWith("10.")) return null;
  s = s.replace(/\/+$/, "");
  return s || null;
}

export function doiUrl(doi: string): string {
  return `https://doi.org/${normalizeDoi(doi) ?? doi}`;
}

/** Pull a numeric PMID out of an OpenAlex `ids.pmid` URL or bare id. */
export function pmidFromOpenAlexIdField(
  raw: string | null | undefined
): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  const fromUrl = trimmed.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i);
  if (fromUrl) return fromUrl[1];
  if (/^\d+$/.test(trimmed)) return trimmed;
  return null;
}

export function isNumericPmid(id: string | null | undefined): boolean {
  return /^\d+$/.test(String(id ?? "").trim());
}

export function isOpenAlexWorkId(id: string | null | undefined): boolean {
  return /^W\d+$/i.test(String(id ?? "").trim());
}
