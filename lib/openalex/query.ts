/**
 * Convert a PubMed-style topic query into an OpenAlex full-text search string.
 * Uses the positive (include) clause only; exclusions are applied via passesClinicalInclusionFilter.
 */
export function pubmedQueryToOpenAlex(pubmedQuery: string): string {
  const trimmed = pubmedQuery.trim();
  if (!trimmed) {
    return "antimicrobial stewardship OR antibiotic stewardship";
  }

  const positive = trimmed.split(/\bNOT\b/i)[0]?.trim() ?? trimmed;

  const quoted = [...positive.matchAll(/"([^"]+)"/g)].map((m) => m[1].trim());
  if (quoted.length > 0) {
    const unique = [...new Set(quoted.filter(Boolean))];
    if (unique.length === 1) return unique[0];
    return unique.join(" OR ");
  }

  const withoutMesh = positive
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/[()]/g, " ")
    .replace(/\b(AND|OR)\b/gi, " ")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!withoutMesh) {
    return "antimicrobial stewardship OR antibiotic stewardship";
  }

  return withoutMesh.length > 200 ? withoutMesh.slice(0, 200) : withoutMesh;
}
