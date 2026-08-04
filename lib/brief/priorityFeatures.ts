import "server-only";
import type { RelevanceBreakdown } from "@/lib/ranking";
import { CLINICAL_POINT_SCALE, normalizeText } from "@/lib/ranking";
import type { PubMedRecord } from "@/lib/pubmed/efetch";
import { lookupJif } from "@/lib/jif";
import { isQ1Journal } from "@/lib/scimago";

/**
 * Feature names for priority ML. Intentionally excludes finalScore /
 * algorithmicScore so predicted priority is not a rescaling of relevance.
 *
 * Chosen by greedy forward selection against 869 human ratings. These eight
 * score marginally better than the previous nineteen (Spearman 0.565 vs 0.559)
 * on far fewer parameters. What was dropped and why:
 *
 *   studyBoostFactor      constant across the whole corpus
 *   clinicalStewardship   fires on 93% of articles, so it separates nothing
 *   logAbstractWords      rank correlation 0.045, negative permutation importance
 *   stewardshipAbstract   adds nothing once the title score is present
 *   isCohort, isMulticenter, novelty, intervention, guideline, nonHumanOnly
 *                         already summed into clinicalBonusNorm; keeping both
 *                         forms double-counted them and added collinearity
 *
 * Note that isQ1 and jifNorm are near-useless on their own (rank correlation
 * -0.07 and 0.00) but earn real weight here as suppressor variables: they only
 * become informative once topic relevance is held constant, and both take a
 * negative coefficient. Do not prune them on univariate evidence.
 */
export const PRIORITY_FEATURE_NAMES = [
  "stewardshipTitle",
  "clinicalBonusNorm",
  "isQ1",
  "isRct",
  "isSystematicReview",
  "largeStudy",
  "jifNorm",
  "keywordCountNorm",
] as const;

export type PriorityFeatureName = (typeof PRIORITY_FEATURE_NAMES)[number];

function pubTypesNormalized(rec: PubMedRecord): string[] {
  return (rec.publicationTypes ?? []).map((p) => normalizeText(p));
}

function hasPubTypeHint(types: string[], hints: string[]): boolean {
  return types.some((p) => hints.some((h) => p.includes(h)));
}

function hasClinicalLabel(
  breakdown: RelevanceBreakdown,
  ...labels: string[]
): boolean {
  return breakdown.clinicalDetails.some((d) => labels.includes(d.label));
}

export function publicationTypeFlags(rec: PubMedRecord): {
  isRct: boolean;
  isSystematicReview: boolean;
  isCohort: boolean;
} {
  const types = pubTypesNormalized(rec);
  return {
    isRct: hasPubTypeHint(types, [
      "randomized",
      "randomised",
      "rct",
      "controlled trial",
    ]),
    isSystematicReview: hasPubTypeHint(types, [
      "systematic review",
      "meta-analysis",
      "meta analysis",
    ]),
    isCohort: hasPubTypeHint(types, [
      "cohort",
      "multicenter",
      "multicentre",
      "pragmatic",
    ]),
  };
}

/** Build a fixed-length feature vector for ridge-regression priority prediction. */
export function extractPriorityFeatures(
  rec: PubMedRecord,
  breakdown: RelevanceBreakdown
): number[] {
  const jifEntry = lookupJif(rec.journal);
  const jif = jifEntry?.jif ?? 0;
  const keywordCount = rec.keywords?.length ?? 0;
  const pub = publicationTypeFlags(rec);

  const isQ1 =
    isQ1Journal(rec.journal) || hasClinicalLabel(breakdown, "Q1 journal");
  const isRct = pub.isRct || hasClinicalLabel(breakdown, "RCT");
  const isSystematicReview =
    pub.isSystematicReview ||
    hasClinicalLabel(breakdown, "Systematic review");

  // Typical clinical bonus range ≈ −20…120 with scale 10. This aggregates the
  // multicenter, novelty, cohort, intervention, guideline and non-human flags,
  // which is why they are not also present as individual features.
  const clinicalBonusNorm = Math.max(
    -1,
    Math.min(1, breakdown.clinicalBonus / (12 * CLINICAL_POINT_SCALE))
  );

  return [
    breakdown.stewardshipTitle,
    clinicalBonusNorm,
    isQ1 ? 1 : 0,
    isRct ? 1 : 0,
    isSystematicReview ? 1 : 0,
    breakdown.largeStudy > 0 ? 1 : 0,
    Math.min(1, jif / 25),
    Math.min(1, keywordCount / 15),
  ];
}
