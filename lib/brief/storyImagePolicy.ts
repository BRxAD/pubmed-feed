/**
 * Brief image + rhythm policy.
 *
 * Flip any flag to `false` (or restore defaults below) to roll back a piece
 * without reverting the whole branch. Previous behavior ≈ all flags that
 * restrict images set to the “legacy” values noted in comments.
 */
export const STORY_IMAGE_POLICY = {
  /**
   * Lead may fall through strict → thematic → generic stewardship photos.
   * Legacy: true.
   */
  leadAllowThematic: true,
  leadAllowGenericFallback: true,

  /**
   * Secondary stories: strict/niche matches only — no thematic pass, no generic.
   * Set both false to restore old “fill most cards” behavior.
   * Legacy secondary: thematic + generic allowed.
   */
  secondaryStrictOnly: true,
  secondaryAllowGeneric: false,

  /**
   * Among secondary stories, only show an image on every Nth card (1-based
   * index in the “also in brief” list). 1 = show every niche match;
   * 3 ≈ one photo every three stories. Legacy feel: 1.
   */
  secondaryImageEveryN: 3,

  /**
   * Steel wash + caption on secondary figures so they feel editorial, not stock.
   * Legacy: false (raw full-bleed crop).
   */
  secondaryImageTreatment: true,

  /**
   * Every Nth secondary story (when it has a bottom line) gets a larger
   * pull-quote treatment instead of a photo — typed rhythm break.
   * 0 = off. Legacy: 0.
   */
  pullQuoteEveryN: 5,

  /**
   * Show journal · JIF under the bottom line when there is no photo —
   * quiet punctuation so text-only cards don’t feel empty.
   * Legacy: false (journal only inside More detail).
   */
  showJournalWhenNoImage: true,
} as const;

export type StoryImagePolicy = typeof STORY_IMAGE_POLICY;
