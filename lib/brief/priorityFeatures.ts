import "server-only";
import type { RelevanceBreakdown } from "@/lib/ranking";
import { CLINICAL_POINT_SCALE, normalizeText } from "@/lib/ranking";
import type { PubMedRecord } from "@/lib/pubmed/efetch";
import { lookupJif } from "@/lib/jif";
import { isQ1Journal } from "@/lib/scimago";

/**
 * Feature names for priority ML. Intentionally excludes finalScore /
 * algorithmicScore so predicted priority is not a rescaling of relevance.
 * Clinical rubric flags align with editorial priority ratings.
 */
export const PRIORITY_FEATURE_NAMES = [
  "stewardshipTitle",
  "stewardshipAbstract",
  "largeStudy",
  "extraTerms",
  "studyBoostFactor",
  "jifNorm",
  "isQ1",
  "isRct",
  "isSystematicReview",
  "isCohort",
  "isMulticenter",
  "clinicalStewardship",
  "novelty",
  "intervention",
  "guideline",
  "nonHumanOnly",
  "clinicalBonusNorm",
  "logAbstractWords",
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
  const abstract = rec.abstract?.trim() ?? "";
  const abstractWords = abstract ? abstract.split(/\s+/).length : 0;
  const keywordCount = rec.keywords?.length ?? 0;
  const pub = publicationTypeFlags(rec);

  const isQ1 =
    isQ1Journal(rec.journal) || hasClinicalLabel(breakdown, "Q1 journal");
  const isRct = pub.isRct || hasClinicalLabel(breakdown, "RCT");
  const isSystematicReview =
    pub.isSystematicReview ||
    hasClinicalLabel(breakdown, "Systematic review");
  const isCohort = pub.isCohort || hasClinicalLabel(breakdown, "Cohort");
  const isMulticenter = hasClinicalLabel(breakdown, "Multicenter");
  const clinicalStewardship = hasClinicalLabel(
    breakdown,
    "Clinical stewardship"
  );
  const novelty = hasClinicalLabel(breakdown, "Novelty");
  const intervention = hasClinicalLabel(breakdown, "Intervention");
  const guideline = hasClinicalLabel(breakdown, "Guideline");
  const nonHumanOnly = hasClinicalLabel(breakdown, "Non-human only");

  // Typical clinical bonus range ≈ −20…120 with scale 10
  const clinicalBonusNorm = Math.max(
    -1,
    Math.min(1, breakdown.clinicalBonus / (12 * CLINICAL_POINT_SCALE))
  );

  return [
    breakdown.stewardshipTitle,
    breakdown.stewardshipAbstract,
    breakdown.largeStudy > 0 ? 1 : 0,
    breakdown.extraTerms,
    breakdown.studyBoostFactor,
    Math.min(1, jif / 25),
    isQ1 ? 1 : 0,
    isRct ? 1 : 0,
    isSystematicReview ? 1 : 0,
    isCohort ? 1 : 0,
    isMulticenter ? 1 : 0,
    clinicalStewardship ? 1 : 0,
    novelty ? 1 : 0,
    intervention ? 1 : 0,
    guideline ? 1 : 0,
    nonHumanOnly ? 1 : 0,
    clinicalBonusNorm,
    Math.log1p(abstractWords) / 10,
    Math.min(1, keywordCount / 15),
  ];
}
