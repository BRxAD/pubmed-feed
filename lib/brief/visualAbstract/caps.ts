import type { VaErrorCode } from "./types";

export type CapCounts = {
  /** Papers this person started in the last hour. */
  userLastHour: number;
  /** Papers anyone started in the last day. */
  allLastDay: number;
};

export type CapLimits = {
  userPerHour: number;
  perDay: number;
};

/**
 * Whether a new paper may be started. The day limit is named first: it applies to everyone, so telling one person
 * "try later" when the whole day is full would send them back for nothing. A paper that already has a picture,
 * or whose findings are saved, never reaches this check.
 */
export function capDecision(counts: CapCounts, limits: CapLimits): Extract<VaErrorCode, "LIMIT_USER" | "LIMIT_DAY"> | null {
  if (counts.allLastDay >= limits.perDay) return "LIMIT_DAY";
  if (counts.userLastHour >= limits.userPerHour) return "LIMIT_USER";
  return null;
}

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
