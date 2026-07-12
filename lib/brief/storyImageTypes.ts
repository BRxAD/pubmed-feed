export type StoryImageMatch = {
  id: string;
  url: string;
  confidence: number;
  label: string;
};

/** Minimum relevance confidence to show a photo (0–1). */
export const IMAGE_MATCH_THRESHOLD = 0.6;
