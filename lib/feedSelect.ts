/**
 * Shared PostgREST select strings for feed / dashboard.
 * Kept in a tiny module so feedCache can import without circular deps on feed.ts.
 */

/** Full row set (heavy). Prefer slim bulk + page hydrate. */
export const FEED_SELECT_FULL =
  "pmid, summary_text, created_at, subheading, label, admin_priority, admin_setting, ml_priority, rank_score, articles!inner(title, abstract, journal, pub_date, release_date, fetched_at, publication_types, keywords, mesh_terms, source)";

/**
 * Bulk feed / dashboard: omit abstract + summary_text (largest columns).
 * Keeps mesh_terms for setting chips / dashboard MeSH; rank_score for relevance sort.
 */
export const FEED_SELECT_SLIM =
  "pmid, created_at, subheading, label, admin_priority, admin_setting, ml_priority, rank_score, articles!inner(title, journal, pub_date, release_date, fetched_at, publication_types, keywords, mesh_terms, source)";

export const FEED_SELECT_SLIM_NO_ADMIN_SETTING =
  "pmid, created_at, subheading, label, admin_priority, ml_priority, rank_score, articles!inner(title, journal, pub_date, release_date, fetched_at, publication_types, keywords, mesh_terms, source)";