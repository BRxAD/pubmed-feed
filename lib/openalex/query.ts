/**
 * Convert a PubMed-style topic query into an OpenAlex full-text search string.
 * OpenAlex does not understand MeSH tags; we extract quoted phrases and common terms.
 */
export function pubmedQueryToOpenAlex(pubmedQuery: string): string {
  const trimmed = pubmedQuery.trim();
  if (!trimmed) {
    return "antimicrobial stewardship OR antibiotic stewardship";
  }

  const quoted = [...trimmed.matchAll(/"([^"]+)"/g)].map((m) => m[1].trim());
  if (quoted.length > 0) {
    const unique = [...new Set(quoted.filter(Boolean))];
    if (unique.length === 1) return unique[0];
    return unique.join(" OR ");
  }

  const withoutMesh = trimmed
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/[()]/g, " ")
    .replace(/\b(AND|OR|NOT)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!withoutMesh) {
    return "antimicrobial stewardship OR antibiotic stewardship";
  }

  return withoutMesh.length > 200 ? withoutMesh.slice(0, 200) : withoutMesh;
}
