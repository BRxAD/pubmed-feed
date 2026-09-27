/**
 * Brief image + rhythm policy.
 *
 * Flip flags here to tune without a full revert.
 */
export const STORY_IMAGE_POLICY = {
  /** Lead: strict → thematic; no generic filler when nothing topic-matches. */
  leadAllowThematic: true,
  leadAllowGenericFallback: false,

  /**
   * Most recent ~N ranked stories (lead included) may get a photo when a
   * topic-aligned catalog match exists, or a generated photo for that PMID.
   * Others stay text-only. In the 2-col band, photos stop on a complete
   * pair so a photo card never sits beside a text-only card.
   */
  photoTopCount: 15,

  /**
   * Within the photo-eligible band (excluding lead), allow thematic matches.
   * Generics off — blank is better than an off-topic stock photo.
   */
  secondaryStrictOnly: false,
  secondaryAllowGeneric: false,

  /**
   * On photo stories, show a short abstract-derived quote under the image
   * (caption). Off for now — revisit with an LLM caption later.
   */
  quoteCaptionUnderPhoto: false,
} as const;

export type StoryImagePolicy = typeof STORY_IMAGE_POLICY;
