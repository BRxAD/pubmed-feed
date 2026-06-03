import "server-only";
import type { PubMedRecord } from "@/lib/pubmed/efetch";

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

function detectLargeStudy(abstract: string): boolean {
  for (const re of SIZE_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(abstract)) !== null) {
      const numStr = (m[1] ?? m[2] ?? "").replace(/,/g, "");
      const n = parseInt(numStr, 10);
      if (Number.isFinite(n) && n > LARGE_STUDY_THRESHOLD) return true;
    }
  }
  return false;
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
  /** Whether to apply ×1.2 multiplier for top-50% JIF journals (default true) */
  jifMultiplier: boolean;
};

export const DEFAULT_WEIGHTS: RankingWeights = {
  stewardshipTitle: 60,
  stewardshipAbstract: 15,
  largeStudy: 20,
  studyTypeBoost: true,
  jifMultiplier: true,
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
  baseScore: number;
  studyBoostFactor: number;
  jifBoostFactor: number;
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
  jifIsHigh?: boolean
): RelevanceBreakdown;
export function computeBreakdown(
  topicQuery: string,
  rec: PubMedRecord,
  weights: RankingWeights,
  includeBoosts: false
): Omit<RelevanceBreakdown, "studyBoostFactor" | "jifBoostFactor" | "finalScore"> & { baseScore: number };
export function computeBreakdown(
  topicQuery: string,
  rec: PubMedRecord,
  weights: RankingWeights = DEFAULT_WEIGHTS,
  includeBoosts = false,
  jifIsHigh = false
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

  // 3. Large study
  const largeStudy =
    abstract && detectLargeStudy(abstract) ? weights.largeStudy : 0;

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

  const baseScore = stewardshipTitle + stewardshipAbstract + largeStudy + extraTerms;

  if (!includeBoosts) {
    return {
      stewardshipTitle,
      stewardshipAbstract,
      largeStudy,
      extraTerms,
      baseScore,
      studyBoostFactor: 1,
      jifBoostFactor: 1,
      finalScore: baseScore,
    };
  }

  // 5. Study-type boost
  const studyBoostFactor = weights.studyTypeBoost
    ? 1 + publicationTypeBoost(rec.publicationTypes ?? [])
    : 1;

  // 6. JIF multiplier (×1.2 for top-50% journals)
  const jifBoostFactor =
    weights.jifMultiplier && jifIsHigh ? JIF_HIGH_MULTIPLIER : 1;

  const score = baseScore * studyBoostFactor * jifBoostFactor;

  return {
    stewardshipTitle,
    stewardshipAbstract,
    largeStudy,
    extraTerms,
    baseScore,
    studyBoostFactor,
    jifBoostFactor,
    finalScore: score,
  };
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

/** Applied to articles from journals in the top 50% by JIF. */
export const JIF_HIGH_MULTIPLIER = 1.2;

/**
 * Compute the final score with full boosts.
 * @param relevance   Base relevance score (from relevanceScore())
 * @param boost       Study-type boost fraction (from publicationTypeBoost())
 * @param jifIsHigh   Whether the journal is in the top 50% by JIF
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
