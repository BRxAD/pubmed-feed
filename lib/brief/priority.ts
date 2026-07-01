/** Minimum effective priority (1–10) for inclusion in The Stewardship Brief. */
export const BRIEF_MIN_PRIORITY = 5;

/**
 * Map normalized relevance (0–100) to a predicted priority (1–10).
 * Used when no admin_priority is saved on the summary.
 */
export function relevanceToPredictedPriority(relevancePercent: number): number {
  if (!Number.isFinite(relevancePercent) || relevancePercent <= 0) return 1;
  return Math.min(10, Math.max(1, Math.round(relevancePercent / 10)));
}

/** Saved admin rating wins; otherwise use the learned-score prediction. */
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
  predictedPriority: number
): boolean {
  return effectivePriority(adminPriority, predictedPriority) >= BRIEF_MIN_PRIORITY;
}
