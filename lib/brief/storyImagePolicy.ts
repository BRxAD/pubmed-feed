/**
 * Brief image + rhythm policy.
 *
 * Flip flags here to tune without a full revert.
 */
export const STORY_IMAGE_POLICY = {
  /** Lead: strict → thematic → generic stewardship photos. */
  leadAllowThematic: true,
  leadAllowGenericFallback: true,

  /**
   * Share of the ranked list (from the top, including lead) that may get a
   * photo. Lower-ranked / older stories stay text-only.
   */
  photoTopFraction: 0.5,

  /**
   * Within the photo-eligible band (excluding lead), allow thematic + generic
   * fallbacks the same way as before the sparse experiment.
   */
  secondaryStrictOnly: false,
  secondaryAllowGeneric: true,

  /**
   * On photo stories, show a short abstract-derived quote under the image
   * (caption). Off for now — revisit with an LLM caption later.
   */
  quoteCaptionUnderPhoto: false,
} as const;

export type StoryImagePolicy = typeof STORY_IMAGE_POLICY;
