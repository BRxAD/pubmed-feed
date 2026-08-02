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
  const journal = input.journal?.trim() || null;
  const year = citationYear(input.date);

  const parts: string[] = [];
  if (authorPart) parts.push(`${authorPart}.`);
  if (title) parts.push(`${title}.`);
  if (journal) parts.push(`${journal}.`);
  if (year) parts.push(`${year}.`);
  if (input.pmid) parts.push(`PMID: ${input.pmid}.`);

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function citationYear(date: string | null | undefined): string | null {
  if (!date) return null;
  const m = String(date).match(/^(\d{4})/);
  return m?.[1] ?? null;
}
