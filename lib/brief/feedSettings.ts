import type { RankingWeights } from "@/lib/ranking";
import { DEFAULT_WEIGHTS } from "@/lib/ranking";
import {
  DEFAULT_PENALTY_WEIGHTS,
  type PenaltyWeights,
} from "@/lib/brief/penaltyWeights";

export type { PenaltyWeights };
export { DEFAULT_PENALTY_WEIGHTS };

export type BriefFeedConfig = {
  minPriority: number;
  daysBack: number;
  largeStudyThreshold: number;
  smallSampleMax: number;
  /**
   * When true (default): lead by newest article date, then highest priority.
   * When false: lead by highest priority, then newest article date.
   */
  leadByRecency: boolean;
};

/** Full tunable feed + brief configuration stored in topics.ranking_weights jsonb. */
export type BriefFeedSettings = RankingWeights &
  PenaltyWeights & {
    brief: BriefFeedConfig;
  };

export const DEFAULT_BRIEF_CONFIG: BriefFeedConfig = {
  minPriority: 5,
  daysBack: 7,
  largeStudyThreshold: 100,
  smallSampleMax: 100,
  leadByRecency: true,
};

export const DEFAULT_FEED_SETTINGS: BriefFeedSettings = {
  ...DEFAULT_WEIGHTS,
  ...DEFAULT_PENALTY_WEIGHTS,
  brief: { ...DEFAULT_BRIEF_CONFIG },
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? clamp(n, min, max) : fallback;
}

/** Merge stored jsonb with defaults — preserves unknown keys for forward compatibility. */
export function mergeFeedSettings(
  stored: Record<string, unknown> | null | undefined
): BriefFeedSettings {
  if (!stored || typeof stored !== "object") {
    return { ...DEFAULT_FEED_SETTINGS, brief: { ...DEFAULT_BRIEF_CONFIG } };
  }

  const briefRaw =
    stored.brief && typeof stored.brief === "object"
      ? (stored.brief as Record<string, unknown>)
      : {};

  const d = DEFAULT_WEIGHTS;

  return {
    stewardshipTitle: num(stored.stewardshipTitle, d.stewardshipTitle, 0, 120),
    stewardshipAbstract: num(
      stored.stewardshipAbstract,
      d.stewardshipAbstract,
      0,
      50
    ),
    largeStudy: num(stored.largeStudy, d.largeStudy, 0, 60),
    studyTypeBoost: stored.studyTypeBoost !== false,
    jifMultiplier: stored.jifMultiplier !== false,
    q1Journal: num(stored.q1Journal, d.q1Journal, 0, 5),
    rctOrSr: num(stored.rctOrSr, d.rctOrSr, 0, 5),
    multicenter: num(stored.multicenter, d.multicenter, 0, 5),
    clinicalStewardship: num(
      stored.clinicalStewardship,
      d.clinicalStewardship,
      0,
      5
    ),
    novelty: num(stored.novelty, d.novelty, 0, 5),
    cohort: num(stored.cohort, d.cohort, 0, 5),
    intervention: num(stored.intervention, d.intervention, 0, 5),
    nonHumanPenalty: num(stored.nonHumanPenalty, d.nonHumanPenalty, -5, 0),
    guideline: num(stored.guideline, d.guideline, 0, 5),
    veterinary: num(stored.veterinary, DEFAULT_PENALTY_WEIGHTS.veterinary, 0.1, 1),
    singleCenterSmall: num(
      stored.singleCenterSmall,
      DEFAULT_PENALTY_WEIGHTS.singleCenterSmall,
      0.1,
      1
    ),
    descriptiveAmr: num(
      stored.descriptiveAmr,
      DEFAULT_PENALTY_WEIGHTS.descriptiveAmr,
      0.1,
      1
    ),
    minFactor: num(stored.minFactor, DEFAULT_PENALTY_WEIGHTS.minFactor, 0.1, 1),
    brief: {
      minPriority: num(briefRaw.minPriority, DEFAULT_BRIEF_CONFIG.minPriority, 1, 10),
      daysBack: num(briefRaw.daysBack, DEFAULT_BRIEF_CONFIG.daysBack, 1, 365),
      largeStudyThreshold: num(
        briefRaw.largeStudyThreshold,
        DEFAULT_BRIEF_CONFIG.largeStudyThreshold,
        10,
        10000
      ),
      smallSampleMax: num(
        briefRaw.smallSampleMax,
        DEFAULT_BRIEF_CONFIG.smallSampleMax,
        10,
        500
      ),
      // New key; ignore legacy unused sortByRecency so everyone gets the new default.
      leadByRecency:
        typeof briefRaw.leadByRecency === "boolean"
          ? briefRaw.leadByRecency
          : DEFAULT_BRIEF_CONFIG.leadByRecency,
    },
  };
}

/** Extract RankingWeights slice for lib/ranking. */
export function toRankingWeights(s: BriefFeedSettings): RankingWeights {
  return {
    stewardshipTitle: s.stewardshipTitle,
    stewardshipAbstract: s.stewardshipAbstract,
    largeStudy: s.largeStudy,
    studyTypeBoost: s.studyTypeBoost,
    jifMultiplier: s.jifMultiplier,
    q1Journal: s.q1Journal,
    rctOrSr: s.rctOrSr,
    multicenter: s.multicenter,
    clinicalStewardship: s.clinicalStewardship,
    novelty: s.novelty,
    cohort: s.cohort,
    intervention: s.intervention,
    nonHumanPenalty: s.nonHumanPenalty,
    guideline: s.guideline,
  };
}

/** Extract penalty slice for lib/relevancePenalties. */
export function toPenaltyWeights(s: BriefFeedSettings): PenaltyWeights {
  return {
    veterinary: s.veterinary,
    singleCenterSmall: s.singleCenterSmall,
    descriptiveAmr: s.descriptiveAmr,
    minFactor: s.minFactor,
  };
}

/** Serialize for topics.ranking_weights — omits values equal to defaults. */
export function feedSettingsToStored(
  s: BriefFeedSettings
): Record<string, unknown> {
  const d = DEFAULT_FEED_SETTINGS;
  const out: Record<string, unknown> = {};

  if (s.stewardshipTitle !== d.stewardshipTitle)
    out.stewardshipTitle = s.stewardshipTitle;
  if (s.stewardshipAbstract !== d.stewardshipAbstract)
    out.stewardshipAbstract = s.stewardshipAbstract;
  if (s.largeStudy !== d.largeStudy) out.largeStudy = s.largeStudy;
  if (s.studyTypeBoost !== d.studyTypeBoost) out.studyTypeBoost = s.studyTypeBoost;
  if (s.jifMultiplier !== d.jifMultiplier) out.jifMultiplier = s.jifMultiplier;
  if (s.q1Journal !== d.q1Journal) out.q1Journal = s.q1Journal;
  if (s.rctOrSr !== d.rctOrSr) out.rctOrSr = s.rctOrSr;
  if (s.multicenter !== d.multicenter) out.multicenter = s.multicenter;
  if (s.clinicalStewardship !== d.clinicalStewardship)
    out.clinicalStewardship = s.clinicalStewardship;
  if (s.novelty !== d.novelty) out.novelty = s.novelty;
  if (s.cohort !== d.cohort) out.cohort = s.cohort;
  if (s.intervention !== d.intervention) out.intervention = s.intervention;
  if (s.nonHumanPenalty !== d.nonHumanPenalty)
    out.nonHumanPenalty = s.nonHumanPenalty;
  if (s.guideline !== d.guideline) out.guideline = s.guideline;

  if (s.veterinary !== d.veterinary) out.veterinary = s.veterinary;
  if (s.singleCenterSmall !== d.singleCenterSmall)
    out.singleCenterSmall = s.singleCenterSmall;
  if (s.descriptiveAmr !== d.descriptiveAmr) out.descriptiveAmr = s.descriptiveAmr;
  if (s.minFactor !== d.minFactor) out.minFactor = s.minFactor;

  const b = s.brief;
  const db = d.brief;
  const briefOut: Record<string, unknown> = {};
  if (b.minPriority !== db.minPriority) briefOut.minPriority = b.minPriority;
  if (b.daysBack !== db.daysBack) briefOut.daysBack = b.daysBack;
  if (b.largeStudyThreshold !== db.largeStudyThreshold)
    briefOut.largeStudyThreshold = b.largeStudyThreshold;
  if (b.smallSampleMax !== db.smallSampleMax)
    briefOut.smallSampleMax = b.smallSampleMax;
  if (b.leadByRecency !== db.leadByRecency) briefOut.leadByRecency = b.leadByRecency;
  if (Object.keys(briefOut).length > 0) out.brief = briefOut;

  return out;
}
