export type StoryImageMatch = {
  id: string;
  url: string;
  confidence: number;
  label: string;
  /**
   * strict = high-confidence match for lead / featured.
   * thematic = broader match / setting fallback for compact cards.
   */
  tier: "strict" | "thematic";
};

/** Minimum confidence for lead / featured photos (0–1). */
export const IMAGE_MATCH_THRESHOLD = 0.65;

/** Lower bar for compact-card / thematic fallback photos. */
export const IMAGE_MATCH_THRESHOLD_THEMATIC = 0.48;
