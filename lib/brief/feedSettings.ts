import type { RankingWeights } from "@/lib/ranking";
import {
  DEFAULT_PENALTY_WEIGHTS,
  type PenaltyWeights,
} from "@/lib/brief/penaltyWeights";

export type { PenaltyWeights };
export { DEFAULT_PENALTY_WEIGHTS };

/** Local copy of ranking defaults — avoids circular import with lib/ranking. */
const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  stewardshipTitle: 60,
  stewardshipAbstract: 15,
  largeStudy: 20,
  studyTypeBoost: true,
  jifMultiplier: true,
};

export type BriefFeedConfig = {
  minPriority: number;
  daysBack: number;
  largeStudyThreshold: number;
  smallSampleMax: number;
  /** When true, brief sorts by created_at then priority; when false, priority first. */
  sortByRecency: boolean;
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
  sortByRecency: true,
};

export const DEFAULT_FEED_SETTINGS: BriefFeedSettings = {
  ...DEFAULT_RANKING_WEIGHTS,
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

  return {
    stewardshipTitle: num(
      stored.stewardshipTitle,
      DEFAULT_RANKING_WEIGHTS.stewardshipTitle,
      0,
      120
    ),
    stewardshipAbstract: num(
      stored.stewardshipAbstract,
      DEFAULT_RANKING_WEIGHTS.stewardshipAbstract,
      0,
      50
    ),
    largeStudy: num(stored.largeStudy, DEFAULT_RANKING_WEIGHTS.largeStudy, 0, 60),
    studyTypeBoost: stored.studyTypeBoost !== false,
    jifMultiplier: stored.jifMultiplier !== false,
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
      sortByRecency: briefRaw.sortByRecency !== false,
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
  if (b.sortByRecency !== db.sortByRecency) briefOut.sortByRecency = b.sortByRecency;
  if (Object.keys(briefOut).length > 0) out.brief = briefOut;

  return out;
}
