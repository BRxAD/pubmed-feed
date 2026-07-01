import type { RelevanceBreakdown } from "@/lib/ranking";
import { normalizeText } from "@/lib/ranking";
import type { PubMedRecord } from "@/lib/pubmed/efetch";
import { lookupJif } from "@/lib/jif";

/**
 * Feature names for priority ML. Intentionally excludes finalScore /
 * algorithmicScore so predicted priority is not a rescaling of relevance.
 */
export const PRIORITY_FEATURE_NAMES = [
  "stewardshipTitle",
  "stewardshipAbstract",
  "largeStudy",
  "extraTerms",
  "studyBoostFactor",
  "jifNorm",
  "jifIsHigh",
  "isRct",
  "isSystematicReview",
  "isCohort",
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

  return [
    breakdown.stewardshipTitle,
    breakdown.stewardshipAbstract,
    breakdown.largeStudy > 0 ? 1 : 0,
    breakdown.extraTerms,
    breakdown.studyBoostFactor,
    Math.min(1, jif / 25),
    jif >= 10 ? 1 : 0,
    pub.isRct ? 1 : 0,
    pub.isSystematicReview ? 1 : 0,
    pub.isCohort ? 1 : 0,
    Math.log1p(abstractWords) / 10,
    Math.min(1, keywordCount / 15),
  ];
}
