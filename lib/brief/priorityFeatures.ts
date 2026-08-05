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
 * Base eight came from greedy forward selection on 869 ratings. Three boundary
 * features were added after a 4-vs-5 audit:
 *   isReview, isGuideline, isRetrospectiveOrSurvey
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
  "isReview",
  "isGuideline",
  "isRetrospectiveOrSurvey",
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

function titleAbstract(rec: PubMedRecord): string {
  return `${rec.title ?? ""}\n${rec.abstract ?? ""}`;
}

export function publicationTypeFlags(rec: PubMedRecord): {
  isRct: boolean;
  isSystematicReview: boolean;
  isCohort: boolean;
  isReview: boolean;
  isGuideline: boolean;
} {
  const types = pubTypesNormalized(rec);
  const isSystematicReview = hasPubTypeHint(types, [
    "systematic review",
    "meta-analysis",
    "meta analysis",
  ]);
  const isReview =
    isSystematicReview ||
    hasPubTypeHint(types, ["review"]) ||
    /\b(systematic review|meta-analysis|meta analysis|narrative review|scoping review|literature review)\b/i.test(
      titleAbstract(rec)
    );
  const isGuideline =
    hasPubTypeHint(types, ["practice guideline", "guideline"]) ||
    /\b(practice guideline|clinical guideline|consensus statement|consensus guideline)\b/i.test(
      titleAbstract(rec)
    );

  return {
    isRct: hasPubTypeHint(types, [
      "randomized",
      "randomised",
      "rct",
      "controlled trial",
    ]),
    isSystematicReview,
    isCohort: hasPubTypeHint(types, [
      "cohort",
      "multicenter",
      "multicentre",
      "pragmatic",
    ]),
    isReview,
    isGuideline,
  };
}

function isRetrospectiveOrSurveyFlag(rec: PubMedRecord): boolean {
  const text = titleAbstract(rec);
  if (/\bretrospective\b/i.test(text)) return true;
  if (/\bsurvey\b|\bquestionnaire\b|\bcross-sectional\b/i.test(text)) return true;
  return hasPubTypeHint(pubTypesNormalized(rec), [
    "surveys and questionnaires",
  ]);
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
  const isReview =
    pub.isReview ||
    isSystematicReview ||
    hasClinicalLabel(breakdown, "Systematic review");
  const isGuideline =
    pub.isGuideline || hasClinicalLabel(breakdown, "Guideline");
  const isRetrospectiveOrSurvey = isRetrospectiveOrSurveyFlag(rec);

  // Typical clinical bonus range ≈ −20…120 with scale 10. This aggregates the
  // multicenter, novelty, cohort, intervention, guideline and non-human flags.
  // isGuideline is also exposed separately for the Brief 4-vs-5 boundary.
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
    isReview ? 1 : 0,
    isGuideline ? 1 : 0,
    isRetrospectiveOrSurvey ? 1 : 0,
  ];
}
