export type FeedSource = "pubmed" | "openalex";

export const DEFAULT_FEED_SOURCE: FeedSource = "pubmed";

export function parseFeedSource(raw: string | undefined): FeedSource {
  if (raw === "openalex") return "openalex";
  return "pubmed";
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
