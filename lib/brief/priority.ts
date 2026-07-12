/** Minimum effective priority (1–10) for inclusion in The Stewardship Brief. */
export const BRIEF_MIN_PRIORITY = 5;

/** Saved admin rating wins; otherwise use ML-predicted priority. */
export function effectivePriority(
  adminPriority: number | null | undefined,
  predictedPriority: number
): number {
  if (
    adminPriority != null &&
    Number.isFinite(adminPriority) &&
    adminPriority >= 1 &&
    adminPriority <= 10
  ) {
    return adminPriority;
  }
  return predictedPriority;
}

export function meetsBriefThreshold(
  adminPriority: number | null | undefined,
  predictedPriority: number,
  minPriority: number = BRIEF_MIN_PRIORITY
): boolean {
  return effectivePriority(adminPriority, predictedPriority) >= minPriority;
}
