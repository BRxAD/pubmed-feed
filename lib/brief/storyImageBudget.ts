import { IMAGE_MATCH_THRESHOLD } from "@/lib/brief/storyImageTypes";

/** Share of new Brief-grade stories that may get a fresh photo. */
export const STORY_IMAGE_GENERATE_FRACTION = 1;

/** First Eastern calendar month the feature runs. */
export const STORY_IMAGE_FIRST_MONTH_CAP_USD = 4.5;

/** Every later Eastern calendar month. */
export const STORY_IMAGE_LATER_MONTH_CAP_USD = 1.8;

/**
 * Photos per summarize pass. Keeps image calls from eating the ingest
 * time limit. The next pass continues until the monthly 2/3 target is met.
 */
export const STORY_IMAGE_MAX_PER_RUN = 2;

/** Reserve before a call so the cap is not crossed by a typical low-quality image. */
export const STORY_IMAGE_CALL_RESERVE_USD = 0.006;

export const STORY_IMAGE_RECYCLE_DAYS = 28;

export function easternYearMonth(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

/** $4.50 during the start month, $1.80 after that. */
export function storyImageMonthCapUsd(startedAt: Date, now: Date): number {
  return easternYearMonth(startedAt) === easternYearMonth(now)
    ? STORY_IMAGE_FIRST_MONTH_CAP_USD
    : STORY_IMAGE_LATER_MONTH_CAP_USD;
}

/**
 * Weakest matches first. Also mint a new photo when the best library hit is
 * generic stock (those portraits get reused too often), even above 0.65.
 */
export function planStoryImageGenerations(
  scores: Array<{ pmid: string; score: number; preferGenerate?: boolean }>,
  briefGradeCount: number,
  generatedCount: number,
  perRunCap = STORY_IMAGE_MAX_PER_RUN
): string[] {
  const target = Math.floor(briefGradeCount * STORY_IMAGE_GENERATE_FRACTION);
  const slots = Math.max(0, target - generatedCount);
  const take = Math.min(slots, Math.max(0, perRunCap));
  if (take === 0) return [];

  return scores
    .filter(
      (row) => row.score < IMAGE_MATCH_THRESHOLD || Boolean(row.preferGenerate)
    )
    .sort((a, b) => a.score - b.score || a.pmid.localeCompare(b.pmid))
    .slice(0, take)
    .map((row) => row.pmid);
}
