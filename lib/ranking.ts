import "server-only";
import type { PubMedRecord } from "@/lib/pubmed/efetch";
import { computeRelevancePenalty } from "@/lib/relevancePenalties";
import type { PenaltyWeights } from "@/lib/brief/penaltyWeights";

export type ScoringOptions = Partial<PenaltyWeights> & {
  smallSampleMax?: number;
  largeStudyThreshold?: number;
};

// ── Text helpers ──────────────────────────────────────────────────────────────

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MIN_TERM_LENGTH = 4;

function getQueryPhraseAndTerms(topicQuery: string): {
  phrase: string;
  terms: string[];
} {
  const phrase = normalizeText(topicQuery);
  const words = phrase.split(/\s+/).filter((w) => w.length > 0);
  const terms = [...new Set(words.filter((w) => w.length >= MIN_TERM_LENGTH))];
  return { phrase, terms };
}

function wordSet(normalized: string): Set<string> {
  return new Set(normalized.split(/\s+/).filter(Boolean));
}

function countTermMatches(terms: string[], ws: Set<string>): number {
  return terms.filter((t) => ws.has(t)).length;
}

// ── Stewardship signal detection ──────────────────────────────────────────────

const STEWARDSHIP_PHRASES = [
  "antimicrobial stewardship",
  "antibiotic stewardship",
  "antibiotic stewardship program",
  "antimicrobial stewardship program",
];

const STEWARDSHIP_WORDS = ["antimicrobial", "antibiotic"];

function hasStewardshipPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  return STEWARDSHIP_PHRASES.some((p) => lower.includes(p));
}

function hasStewardshipWord(text: string): boolean {
  const lower = text.toLowerCase();
  return STEWARDSHIP_WORDS.some((w) => lower.includes(w));
}

// ── Large-study detection ─────────────────────────────────────────────────────

const LARGE_STUDY_THRESHOLD = 100;

const SIZE_PATTERNS: RegExp[] = [
  /\bn\s*[=≥>]\s*([\d,]+)/gi,
  /\b([\d,]+)\s+(?:patients?|participants?|subjects?|individuals?|adults?|children|cases?|encounters?|episodes?)\b/gi,
  /\b(?:included?|enrolled?|recruited?|analyzed?|analysed?)\s+([\d,]+)\b/gi,
  /\b([\d,]+)\s+(?:hospitals?|sites?|centers?|centres?|facilities|institutions?|icus?)\b/gi,
];

function extractSampleSizes(abstract: string): number[] {
  const sizes: number[] = [];
  for (const re of SIZE_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(abstract)) !== null) {
      const numStr = (m[1] ?? m[2] ?? "").replace(/,/g, "");
      const n = parseInt(numStr, 10);
      if (Number.isFinite(n) && n > 0) sizes.push(n);
    }
  }
  return sizes;
}

function detectLargeStudy(abstract: string, threshold = LARGE_STUDY_THRESHOLD): boolean {
  return extractSampleSizes(abstract).some((n) => n > threshold);
}

// ── Ranking weights ───────────────────────────────────────────────────────────
//
// All weights are configurable so admins can tune them live via URL params.
// Max raw score calibration:
//   stewardshipTitle(60) + stewardshipAbstract(15) + largeStudy(20) + extras ≈ 100
//   × (1 + studyBoost max 0.75) × (1 + jifMultiplier 0.20) ≈ 210
// normalizeScoreTo100 uses 210 as the denominator.

export type RankingWeights = {
  /** Points for stewardship phrase in title (default 60) */
  stewardshipTitle: number;
  /** Points for stewardship phrase in abstract (default 15) */
  stewardshipAbstract: number;
  /** Points for detected large study n > 100 (default 20) */
  largeStudy: number;
  /** Whether to apply study-type quality boost (default true) */
  studyTypeBoost: boolean;
  /** Whether to apply ×1.2 multiplier for Q1 / high-JIF journals (default true) */
  jifMultiplier: boolean;
  /** Clinical rubric (defaults match editorial scale; multiplied by CLINICAL_POINT_SCALE). */
  q1Journal: number;
  rctOrSr: number;
  multicenter: number;
  clinicalStewardship: number;
  novelty: number;
  cohort: number;
  intervention: number;
  nonHumanPenalty: number;
  guideline: number;
};

/** Scale clinical rubric points into the main score ( +2 → 20 ). */
export const CLINICAL_POINT_SCALE = 10;

export const DEFAULT_WEIGHTS: RankingWeights = {
  stewardshipTitle: 60,
  stewardshipAbstract: 15,
  largeStudy: 20,
  studyTypeBoost: true,
  jifMultiplier: true,
  q1Journal: 2,
  rctOrSr: 2,
  multicenter: 2,
  clinicalStewardship: 2,
  novelty: 1,
  cohort: 1,
  intervention: 1,
  nonHumanPenalty: -2,
  guideline: 2,
};

/** Parse RankingWeights from URL search params (safe — bad values fall back to defaults). */
export function parseWeightsFromParams(params: {
  wTitle?: string;
  wAbstract?: string;
  wLarge?: string;
  studyBoost?: string;
  jifBoost?: string;
}): RankingWeights {
  const clamp = (v: number, min: number, max: number) =>
    Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined;

  return {
    ...DEFAULT_WEIGHTS,
    stewardshipTitle:
      clamp(parseInt(params.wTitle ?? "", 10), 0, 120) ??
      DEFAULT_WEIGHTS.stewardshipTitle,
    stewardshipAbstract:
      clamp(parseInt(params.wAbstract ?? "", 10), 0, 50) ??
      DEFAULT_WEIGHTS.stewardshipAbstract,
    largeStudy:
      clamp(parseInt(params.wLarge ?? "", 10), 0, 60) ??
      DEFAULT_WEIGHTS.largeStudy,
    studyTypeBoost: params.studyBoost !== "0",
    jifMultiplier: params.jifBoost !== "0",
  };
}

/** Serialize RankingWeights to URL search params (only includes non-default values). */
export function weightsToParams(w: RankingWeights): Record<string, string> {
  const out: Record<string, string> = {};
  const d = DEFAULT_WEIGHTS;
  if (w.stewardshipTitle !== d.stewardshipTitle)
    out.wTitle = String(w.stewardshipTitle);
  if (w.stewardshipAbstract !== d.stewardshipAbstract)
    out.wAbstract = String(w.stewardshipAbstract);
  if (w.largeStudy !== d.largeStudy)
    out.wLarge = String(w.largeStudy);
  if (!w.studyTypeBoost) out.studyBoost = "0";
  if (!w.jifMultiplier) out.jifBoost = "0";
  return out;
}

// ── Per-component breakdown (for admin display) ───────────────────────────────

export type RelevanceBreakdown = {
  stewardshipTitle: number;
  stewardshipAbstract: number;
  largeStudy: number;
  extraTerms: number;
  clinicalBonus: number;
  clinicalFlags: string[];
  baseScore: number;
  studyBoostFactor: number;
  jifBoostFactor: number;
  penaltyFactor: number;
  penaltyReasons: string[];
  finalScore: number;
};

// ── Core scoring ──────────────────────────────────────────────────────────────

export function relevanceScore(
  topicQuery: string,
  rec: PubMedRecord,
  weights: RankingWeights = DEFAULT_WEIGHTS
): number {
  return computeBreakdown(topicQuery, rec, weights, false).baseScore;
}

/**
 * Compute a full per-component breakdown of the relevance score.
 * Pass `includeBoosts = true` to include study-type and JIF factors.
 * Pass `jifIsHigh = true` when the journal is in the top 50% by JIF.
 */
export function computeBreakdown(
  topicQuery: string,
  rec: PubMedRecord,
  weights: RankingWeights,
  includeBoosts: true,
  jifIsHigh?: boolean,
  scoringOptions?: ScoringOptions
): RelevanceBreakdown;
export function computeBreakdown(
  topicQuery: string,
  rec: PubMedRecord,
  weights: RankingWeights,
  includeBoosts: false,
  jifIsHigh?: boolean,
  scoringOptions?: ScoringOptions
): Omit<RelevanceBreakdown, "studyBoostFactor" | "jifBoostFactor" | "finalScore"> & { baseScore: number };
export function computeBreakdown(
  topicQuery: string,
  rec: PubMedRecord,
  weights: RankingWeights = DEFAULT_WEIGHTS,
  includeBoosts = false,
  jifIsHigh = false,
  scoringOptions?: ScoringOptions
): RelevanceBreakdown {
  const title = rec.title ?? "";
  const abstract = rec.abstract ?? "";

  // 1. Stewardship signal in title
  let stewardshipTitle = 0;
  if (hasStewardshipPhrase(title)) {
    stewardshipTitle = weights.stewardshipTitle;
  } else if (hasStewardshipWord(title)) {
    stewardshipTitle = Math.round(weights.stewardshipTitle / 3);
  }

  // 2. Stewardship signal in abstract
  let stewardshipAbstract = 0;
  if (hasStewardshipPhrase(abstract)) {
    stewardshipAbstract = weights.stewardshipAbstract;
  } else if (hasStewardshipWord(abstract)) {
    stewardshipAbstract = Math.round(weights.stewardshipAbstract / 3);
  }

  const largeStudyThreshold =
    scoringOptions?.largeStudyThreshold ?? LARGE_STUDY_THRESHOLD;

  // 3. Large study
  const largeStudy =
    abstract && detectLargeStudy(abstract, largeStudyThreshold)
      ? weights.largeStudy
      : 0;

  // 4. Extra topic-query terms (non-stewardship)
  let extraTerms = 0;
  const { terms } = getQueryPhraseAndTerms(topicQuery);
  const extra = terms.filter(
    (t) => !["antimicrobial", "antibiotic", "stewardship"].includes(t)
  );
  if (extra.length > 0) {
    const titleWords = wordSet(normalizeText(title));
    const abstractWords = wordSet(normalizeText(abstract));
    const meshKw = [...(rec.meshTerms ?? []), ...(rec.keywords ?? [])]
      .map((s) => normalizeText(s))
      .join(" ");
    const meshKwSet = wordSet(meshKw);
    extraTerms +=
      countTermMatches(extra, titleWords) * 8 +
      countTermMatches(extra, abstractWords) * 3 +
      countTermMatches(extra, meshKwSet) * 3;
  }

  const clinical = scoreClinicalRubric(rec, weights, jifIsHigh);
  const clinicalBonus = clinical.points;
  const clinicalFlags = clinical.flags;

  const baseScore =
    stewardshipTitle +
    stewardshipAbstract +
    largeStudy +
    extraTerms +
    clinicalBonus;
  const penalty = computeRelevancePenalty(rec, scoringOptions);

  if (!includeBoosts) {
    const finalScore = baseScore * penalty.factor;
    return {
      stewardshipTitle,
      stewardshipAbstract,
      largeStudy,
      extraTerms,
      clinicalBonus,
      clinicalFlags,
      baseScore,
      studyBoostFactor: 1,
      jifBoostFactor: 1,
      penaltyFactor: penalty.factor,
      penaltyReasons: penalty.reasons,
      finalScore,
    };
  }

  // 5. Study-type boost
  const studyBoostFactor = weights.studyTypeBoost
    ? 1 + publicationTypeBoost(rec.publicationTypes ?? [])
    : 1;

  // 6. JIF / Q1 multiplier (×1.2 for Q1 or top-50% JIF)
  const jifBoostFactor =
    weights.jifMultiplier && jifIsHigh ? JIF_HIGH_MULTIPLIER : 1;

  const score = baseScore * studyBoostFactor * jifBoostFactor * penalty.factor;

  return {
    stewardshipTitle,
    stewardshipAbstract,
    largeStudy,
    extraTerms,
    clinicalBonus,
    clinicalFlags,
    baseScore,
    studyBoostFactor,
    jifBoostFactor,
    penaltyFactor: penalty.factor,
    penaltyReasons: penalty.reasons,
    finalScore: score,
  };
}

function scoreClinicalRubric(
  rec: PubMedRecord,
  weights: RankingWeights,
  isQ1: boolean
): { points: number; flags: string[] } {
  const title = (rec.title ?? "").toLowerCase();
  const abstract = (rec.abstract ?? "").toLowerCase();
  const text = `${title} ${abstract}`;
  const pubs = (rec.publicationTypes ?? []).map((p) => normalizeText(p));
  const meshKw = [...(rec.meshTerms ?? []), ...(rec.keywords ?? [])]
    .join(" ")
    .toLowerCase();
  const flags: string[] = [];
  let pts = 0;
  const scale = CLINICAL_POINT_SCALE;

  if (isQ1 && weights.q1Journal) {
    pts += weights.q1Journal * scale;
    flags.push("Q1");
  }

  const isRct =
    pubs.some(
      (p) =>
        p.includes("randomized") ||
        p.includes("randomised") ||
        p.includes("controlled trial")
    ) ||
    /\brandomi[sz]ed\b/.test(text) ||
    /\brct\b/.test(text);
  const isSr =
    pubs.some(
      (p) =>
        p.includes("systematic review") ||
        p.includes("meta-analysis") ||
        p.includes("meta analysis")
    ) ||
    text.includes("systematic review") ||
    text.includes("meta-analysis") ||
    text.includes("meta analysis");
  if ((isRct || isSr) && weights.rctOrSr) {
    pts += weights.rctOrSr * scale;
    flags.push(isRct ? "RCT" : "SR");
  }

  if (
    weights.multicenter &&
    (/\bmulti[-\s]?cent(?:er|re)\b/.test(text) ||
      /\bmultiple\s+(?:hospitals?|sites?|centers?|centres?)\b/.test(text) ||
      pubs.some((p) => p.includes("multicenter") || p.includes("multicentre")))
  ) {
    pts += weights.multicenter * scale;
    flags.push("multicenter");
  }

  const clinicalStewardship =
    hasStewardshipPhrase(text) ||
    (hasStewardshipWord(text) &&
      (/\b(patient|clinical|hospital|prescrib|stewardship|antibiotic use)\b/.test(
        text
      ) ||
        /\bhuman\b/.test(text)));
  if (clinicalStewardship && weights.clinicalStewardship) {
    pts += weights.clinicalStewardship * scale;
    flags.push("clinical stewardship");
  }

  if (
    weights.novelty &&
    /\b(novel|first (?:report|description|study)|newly described|unprecedented)\b/.test(
      text
    )
  ) {
    pts += weights.novelty * scale;
    flags.push("novelty");
  }

  if (
    weights.cohort &&
    (pubs.some((p) => p.includes("cohort")) ||
      /\bcohort\b/.test(text) ||
      text.includes("retrospective cohort") ||
      text.includes("prospective cohort"))
  ) {
    pts += weights.cohort * scale;
    flags.push("cohort");
  }

  if (
    weights.intervention &&
    /\b(intervention|implemented|implementation|stewardship program|bundle|protocol)\b/.test(
      text
    )
  ) {
    pts += weights.intervention * scale;
    flags.push("intervention");
  }

  const nonHumanOnly =
    (/\b(veterinary|livestock|poultry|swine|canine|feline|animal model)\b/.test(
      text
    ) ||
      /\banimals\b/.test(meshKw)) &&
    !/\b(human|patient|patients|clinical)\b/.test(text);
  if (nonHumanOnly && weights.nonHumanPenalty) {
    pts += weights.nonHumanPenalty * scale;
    flags.push("non-human only");
  }

  if (
    weights.guideline &&
    (pubs.some((p) => p.includes("guideline") || p.includes("practice guideline")) ||
      /\b(guideline|consensus statement|practice recommendation)\b/.test(text))
  ) {
    pts += weights.guideline * scale;
    flags.push("guideline");
  }

  return { points: pts, flags };
}

// ── Study-type boost ──────────────────────────────────────────────────────────

const BOOST_RCT = 0.35;
const BOOST_SYSTEMATIC = 0.40;
const BOOST_COHORT = 0.20;

export function publicationTypeBoost(pubTypes: string[]): number {
  if (!pubTypes?.length) return 0;
  let boost = 0;
  const normalized = pubTypes.map((p) => normalizeText(p));

  if (
    normalized.some(
      (p) =>
        p.includes("randomized") ||
        p.includes("randomised") ||
        p.includes("rct") ||
        p.includes("controlled trial")
    )
  ) {
    boost += BOOST_RCT;
  }
  if (
    normalized.some(
      (p) =>
        p.includes("systematic review") ||
        p.includes("meta-analysis") ||
        p.includes("meta analysis")
    )
  ) {
    boost += BOOST_SYSTEMATIC;
  }
  if (
    normalized.some(
      (p) =>
        p.includes("cohort") ||
        p.includes("multicenter") ||
        p.includes("multicentre") ||
        p.includes("pragmatic")
    )
  ) {
    boost += BOOST_COHORT;
  }
  return boost;
}

// ── JIF multiplier ────────────────────────────────────────────────────────────

/** Applied to articles from Q1 / top-50% JIF journals. */
export const JIF_HIGH_MULTIPLIER = 1.2;

/**
 * Compute the final score with full boosts.
 * @param relevance   Base relevance score (from relevanceScore())
 * @deprecated Keep for callers that use the old two-step API.
 */
export function applyBoosts(
  relevance: number,
  pubTypes: string[],
  jifIsHigh: boolean,
  weights: RankingWeights = DEFAULT_WEIGHTS
): number {
  const study = weights.studyTypeBoost
    ? 1 + publicationTypeBoost(pubTypes)
    : 1;
  const jif = weights.jifMultiplier && jifIsHigh ? JIF_HIGH_MULTIPLIER : 1;
  return relevance * study * jif;
}

/**
 * Compute the final score with full boosts.
 * @param relevance   Base relevance score (from relevanceScore())
 * @param boost       Study-type boost fraction (from publicationTypeBoost())
 * @param jifIsHigh   Whether the journal is Q1 / top 50% by JIF
 * @param weights     Active ranking weights
 */
export function finalScore(
  relevance: number,
  boost: number,
  jifIsHigh = false,
  weights: RankingWeights = DEFAULT_WEIGHTS
): number {
  const studyFactor = weights.studyTypeBoost ? 1 + boost : 1;
  const jifFactor = weights.jifMultiplier && jifIsHigh ? JIF_HIGH_MULTIPLIER : 1;
  return relevance * studyFactor * jifFactor;
}

/** @deprecated Impact factor is handled via isHighImpactJournal() + finalScore(). */
export function impactScoreFromJif(_jif: number | null): number {
  return 0;
}
