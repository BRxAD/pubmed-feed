export type FeedSource = "pubmed" | "openalex";

/** Filter used by /feed — includes combined view. */
export type FeedSourceFilter = FeedSource | "all";

export const DEFAULT_FEED_SOURCE: FeedSource = "pubmed";

/** Visiting /feed with no ?source= shows every stored source. */
export const DEFAULT_FEED_SOURCE_FILTER: FeedSourceFilter = "all";

export function parseFeedSource(raw: string | undefined): FeedSourceFilter {
  if (raw === "openalex") return "openalex";
  if (raw === "pubmed") return "pubmed";
  // Default + explicit "all" → both sources
  return "all";
}

export function isFeedSource(value: string | null | undefined): value is FeedSource {
  return value === "pubmed" || value === "openalex";
}

/** External link for an article card (PubMed vs OpenAlex work). */
export function articleExternalUrl(pmid: string, source: FeedSource): string {
  const id = pmid.trim();
  if (source === "openalex" || /^W\d+$/i.test(id)) {
    const workId = id.startsWith("W") ? id : `W${id}`;
    return `https://openalex.org/${workId}`;
  }
  return `https://pubmed.ncbi.nlm.nih.gov/${id}/`;
}
