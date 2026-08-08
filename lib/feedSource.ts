export type FeedSource = "pubmed" | "openalex";

/** Filter used by /feed — product is PubMed-only. */
export type FeedSourceFilter = FeedSource | "all";

export const DEFAULT_FEED_SOURCE: FeedSource = "pubmed";

/** Visiting /feed always uses PubMed (OpenAlex UI/ingest disabled). */
export const DEFAULT_FEED_SOURCE_FILTER: FeedSourceFilter = "pubmed";

/** Always PubMed — ignore ?source=openalex|all. */
export function parseFeedSource(_raw: string | undefined): FeedSourceFilter {
  return "pubmed";
}

export function isFeedSource(value: string | null | undefined): value is FeedSource {
  return value === "pubmed" || value === "openalex";
}

/** External link for an article card (PubMed; legacy OpenAlex IDs still link out). */
export function articleExternalUrl(pmid: string, source: FeedSource): string {
  const id = pmid.trim();
  if (source === "openalex" || /^W\d+$/i.test(id)) {
    const workId = id.startsWith("W") ? id : `W${id}`;
    return `https://openalex.org/${workId}`;
  }
  return `https://pubmed.ncbi.nlm.nih.gov/${id}/`;
}
