import { doiUrl, isNumericPmid, isOpenAlexWorkId, normalizeDoi } from "@/lib/doi";

export type FeedSource = "pubmed" | "openalex";

/** Filter used by /feed. Combined list — no source switcher. */
export type FeedSourceFilter = FeedSource | "all";

export const DEFAULT_FEED_SOURCE: FeedSource = "pubmed";

export const DEFAULT_FEED_SOURCE_FILTER: FeedSourceFilter = "all";

export type FeedSourceTag = "PubMed" | "OpenAlex" | "OpenAlex · PubMed";

export type ArticleLinkMeta = {
  doi?: string | null;
  landingUrl?: string | null;
  openalexId?: string | null;
};

/** Combined /feed list — ignore ?source=. */
export function parseFeedSource(_raw: string | undefined): FeedSourceFilter {
  return "all";
}

export function isFeedSource(value: string | null | undefined): value is FeedSource {
  return value === "pubmed" || value === "openalex";
}

/**
 * Live rows: PubMed PMIDs, plus new OpenAlex rows that have a DOI / work id.
 * Hides legacy W-id duplicates from the old OpenAlex ingest (no doi column).
 */
export function isLiveFeedArticle(opts: {
  pmid: string;
  source?: string | null;
  doi?: string | null;
  openalexId?: string | null;
}): boolean {
  if (isNumericPmid(opts.pmid)) return true;
  if (normalizeDoi(opts.doi)) return true;
  if (opts.openalexId?.trim()) return true;
  return false;
}

/** /feed-only API labels. Brief / email / Top 10 stay unlabeled. */
export function feedSourceTag(opts: {
  pmid: string;
  openalexId?: string | null;
}): FeedSourceTag {
  const numeric = isNumericPmid(opts.pmid);
  const seenOpenAlex =
    Boolean(opts.openalexId?.trim()) || isOpenAlexWorkId(opts.pmid);
  if (seenOpenAlex && numeric) return "OpenAlex · PubMed";
  if (seenOpenAlex) return "OpenAlex";
  return "PubMed";
}

/** Public article link: PubMed once a PMID exists, else publisher / DOI. */
export function articleExternalUrl(
  pmid: string,
  source?: FeedSource,
  meta?: ArticleLinkMeta
): string {
  const id = pmid.trim();
  if (isNumericPmid(id)) {
    return `https://pubmed.ncbi.nlm.nih.gov/${id}/`;
  }
  const doi = normalizeDoi(meta?.doi);
  if (doi) return doiUrl(doi);
  const landing = meta?.landingUrl?.trim();
  if (landing && /^https?:\/\//i.test(landing)) return landing;
  if (source === "openalex" || isOpenAlexWorkId(id) || meta?.openalexId) {
    const workId = isOpenAlexWorkId(id)
      ? id.toUpperCase()
      : (meta?.openalexId ?? "").trim().toUpperCase();
    if (workId) {
      const w = workId.startsWith("W") ? workId : `W${workId}`;
      return `https://openalex.org/${w}`;
    }
  }
  return `https://pubmed.ncbi.nlm.nih.gov/${id}/`;
}
