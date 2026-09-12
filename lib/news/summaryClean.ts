/**
 * Helper to clean and deduplicate news summaries against their headlines.
 *
 * Many RSS feeds (such as Google News or news aggregators) put either:
 * 1) Exact copies of the title into the description/summary,
 * 2) The title with the publication domain concatenated, e.g. "Headline text publication.com",
 * 3) The headline followed by the story text, e.g. "Headline. Actual story text...",
 * 4) Just the source name or a very short fragment (< 15 chars).
 *
 * This utility returns a clean, non-redundant summary string, or null if there is no
 * unique summary content worth displaying below the headline.
 */

function normalizeForComparison(s: string): string {
  return s
    .toLowerCase()
    // Remove source-like suffixes often appended at end, e.g. " - the-star.co.ke", " | Reuters"
    .replace(/\s*[-–—|•·]\s*[\w\.\-:]+$/i, "")
    // Remove trailing domain names at the end, e.g. " the-star.co.ke", " reuters.com"
    .replace(/\s+[\w\-]+(?:\.[a-z]{2,})+$/i, "")
    // Remove non-alphanumeric characters
    .replace(/[^a-z0-9]/g, "");
}

export function getMeaningfulNewsSummary(
  title: string,
  summary: string | null | undefined
): string | null {
  if (!summary) return null;
  const rawSummary = summary.trim();
  if (!rawSummary) return null;

  const rawTitle = title.trim();

  // Compare normalized versions
  const normTitle = normalizeForComparison(rawTitle);
  const normSummary = normalizeForComparison(rawSummary);

  if (!normSummary || normSummary.length < 15) return null;
  if (normSummary === normTitle) return null;

  // If one completely contains the other and length difference is small (e.g. source domain added/removed)
  if (
    (normTitle.includes(normSummary) || normSummary.includes(normTitle)) &&
    Math.abs(normTitle.length - normSummary.length) < 30
  ) {
    return null;
  }

  // Check if summary starts with the title or the core title (title without " - Source")
  const cleanTitleCore = rawTitle.replace(/\s*[-–—|•·].*$/, "").trim();
  if (cleanTitleCore.length >= 15) {
    const lowerSummary = rawSummary.toLowerCase();
    const lowerCore = cleanTitleCore.toLowerCase();

    if (lowerSummary.startsWith(lowerCore)) {
      const rest = rawSummary
        .slice(cleanTitleCore.length)
        .replace(/^[\s\-–—:;.,·•]+/, "")
        .trim();

      const normRest = normalizeForComparison(rest);
      if (!normRest || normRest.length < 20) {
        return null;
      }
      return rest;
    }
  }

  // Strip trailing source name if present at end of summary
  // e.g. "Some real summary text the-star.co.ke"
  const cleanedTrailing = rawSummary
    .replace(/\s*[-–—|•·]?\s*[\w\-]+(?:\.[a-z]{2,})+\s*$/i, "")
    .trim();

  const normCleaned = normalizeForComparison(cleanedTrailing);
  if (!normCleaned || normCleaned === normTitle || normCleaned.length < 15) {
    return null;
  }

  return cleanedTrailing;
}
