/** Multiplicative down-rate factors for relevance penalties (0–1).
 * Kept in a leaf module to avoid circular imports with ranking/feedSettings.
 */
export type PenaltyWeights = {
  veterinary: number;
  singleCenterSmall: number;
  descriptiveAmr: number;
  minFactor: number;
};

export const DEFAULT_PENALTY_WEIGHTS: PenaltyWeights = {
  veterinary: 0.55,
  singleCenterSmall: 0.65,
  descriptiveAmr: 0.7,
  minFactor: 0.28,
};
