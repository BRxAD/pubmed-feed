/**
 * Shared PostgREST select strings for feed.
 * Kept in a tiny module so feedCache can import without circular deps on feed.ts.
 */

/** Full row set (heavy). Prefer slim bulk + page hydrate. */
export const FEED_SELECT_FULL =
  "pmid, summary_text, created_at, subheading, label, admin_priority, admin_setting, auto_settings, ml_priority, rank_score, articles!inner(title, abstract, journal, pub_date, release_date, fetched_at, publication_types, keywords, mesh_terms, source)";

/**
 * Bulk feed / corpus index: no abstract, summary_text, keywords, or mesh_terms.
 * Settings come from admin_setting + auto_settings; page-hydrate arrays for UI.
 */
export const FEED_SELECT_SLIM =
  "pmid, created_at, subheading, label, admin_priority, admin_setting, auto_settings, ml_priority, rank_score, articles!inner(title, journal, pub_date, release_date, fetched_at, publication_types, source)";

export const FEED_SELECT_SLIM_NO_ADMIN_SETTING =
  "pmid, created_at, subheading, label, admin_priority, auto_settings, ml_priority, rank_score, articles!inner(title, journal, pub_date, release_date, fetched_at, publication_types, source)";

/** Keyword filter index: keywords only (no mesh / bodies). */
export const FEED_SELECT_KEYWORD_INDEX =
  "pmid, created_at, subheading, label, admin_priority, admin_setting, auto_settings, ml_priority, rank_score, articles!inner(title, journal, pub_date, release_date, fetched_at, publication_types, keywords, source)";
