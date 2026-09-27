import { formatJournalTitle } from "@/lib/brief/formatJournal";

/**
 * Format a PubMed-style citation from available brief fields.
 * Example: Smith JA, Jones B, et al. Title of the article. Journal Name. 2024.
 */
export function formatPubmedCitation(input: {
  authors?: string[] | null;
  title: string;
  journal?: string | null;
  date?: string | null;
  pmid?: string | null;
}): string {
  const authors = (input.authors ?? []).map((a) => a.trim()).filter(Boolean);
  let authorPart = "";
  if (authors.length === 0) {
    authorPart = "";
  } else if (authors.length <= 6) {
    authorPart = authors.join(", ");
  } else {
    authorPart = `${authors.slice(0, 6).join(", ")}, et al`;
  }

  const title = input.title.trim().replace(/\.$/, "");
  const rawJournal = input.journal?.trim() || null;
  const journal = rawJournal ? formatJournalTitle(rawJournal) : null;
  const year = citationYear(input.date);

  const parts: string[] = [];
  if (authorPart) parts.push(`${authorPart}.`);
  if (title) parts.push(`${title}.`);
  if (journal) parts.push(`${journal}.`);
  if (year) parts.push(`${year}.`);
  if (input.pmid) parts.push(`PMID: ${input.pmid}.`);

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

const ET_AL = ", et al.";

function cleanAuthorList(authors?: string[] | null): string[] {
  return (authors ?? []).map((a) => a.trim()).filter(Boolean);
}

function ellipsizeToWidth(
  text: string,
  maxWidth: number,
  measure: (s: string) => number
): string {
  if (measure(text) <= maxWidth) return text;
  const ell = "…";
  if (measure(ell) > maxWidth) return "";
  let lo = 1;
  let hi = text.length;
  let best = ell;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const cand = `${text.slice(0, mid).trimEnd()}${ell}`;
    if (measure(cand) <= maxWidth) {
      best = cand;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/**
 * Pack as many authors as will fit on one graphic-takeaway row.
 * If more remain, append "et al." — never wrap to a second author line.
 */
export function fitAuthorsOneLine(
  authors: string[] | null | undefined,
  maxWidth: number,
  measure: (text: string) => number
): string | null {
  const list = cleanAuthorList(authors);
  if (list.length === 0) return null;
  const width = Math.max(0, maxWidth);
  const all = list.join(", ");
  if (measure(all) <= width) return all;

  for (let n = list.length - 1; n >= 1; n--) {
    const line = `${list.slice(0, n).join(", ")}${ET_AL}`;
    if (measure(line) <= width) return line;
  }

  const first = list[0] ?? "";
  if (measure(first) <= width) return first;
  return ellipsizeToWidth(first, width, measure) || null;
}

/** @deprecated Prefer fitAuthorsOneLine with a measured width. */
export function formatLeadAuthorLine(
  authors?: string[] | null
): string | null {
  const list = cleanAuthorList(authors);
  if (list.length === 0) return null;
  return list.join(", ");
}

export function citationYear(date: string | null | undefined): string | null {
  if (!date) return null;
  const m = String(date).match(/^(\d{4})/);
  return m?.[1] ?? null;
}
