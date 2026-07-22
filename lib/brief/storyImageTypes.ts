export type StoryImageMatch = {
  id: string;
  url: string;
  confidence: number;
  label: string;
};

/** Minimum relevance confidence to show a photo (0–1). Stricter = fewer mismatches. */
export const IMAGE_MATCH_THRESHOLD = 0.65;
