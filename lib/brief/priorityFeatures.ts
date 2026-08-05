import "server-only";
import type { RelevanceBreakdown } from "@/lib/ranking";
import { CLINICAL_POINT_SCALE, normalizeText } from "@/lib/ranking";
import type { PubMedRecord } from "@/lib/pubmed/efetch";
import { lookupJif } from "@/lib/jif";
import { isQ1Journal } from "@/lib/scimago";
import { EMBEDDING_PCA_DIMS } from "@/lib/brief/embeddings";

/**
 * Handcrafted features (greedy selection + 4-vs-5 boundary flags).
 * OpenAI embedding PCA dims are appended after these.
 */
export const HANDCRAFTED_FEATURE_NAMES = [
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

export const EMBEDDING_PCA_FEATURE_NAMES = Array.from(
  { length: EMBEDDING_PCA_DIMS },
  (_, i) => `embPca${i + 1}` as const
);

export const PRIORITY_FEATURE_NAMES = [
  ...HANDCRAFTED_FEATURE_NAMES,
  ...EMBEDDING_PCA_FEATURE_NAMES,
] as const;

export type PriorityFeatureName = (typeof PRIORITY_FEATURE_NAMES)[number];

/** Single source of truth for admin + dashboard labels. */
export const PRIORITY_FEATURE_LABELS: Record<string, string> = {
  stewardshipTitle: "Title term match",
  clinicalBonusNorm: "Clinical rubric total",
  isQ1: "Q1 journal",
  isRct: "RCT",
  isSystematicReview: "Systematic review",
  largeStudy: "Large study",
  jifNorm: "Impact factor",
  keywordCountNorm: "Keyword count",
  isReview: "Review article",
  isGuideline: "Guideline",
  isRetrospectiveOrSurvey: "Retrospective / survey",
  embPca1: "Text embedding PC1",
  embPca2: "Text embedding PC2",
  embPca3: "Text embedding PC3",
  embPca4: "Text embedding PC4",
  embPca5: "Text embedding PC5",
  embPca6: "Text embedding PC6",
  embPca7: "Text embedding PC7",
  embPca8: "Text embedding PC8",
};

/** Features that are 0/1 flags (dashboard formats as % present). */
export const PRIORITY_BINARY_FEATURES: ReadonlySet<string> = new Set([
  "isQ1",
  "isRct",
  "isSystematicReview",
  "largeStudy",
  "isReview",
  "isGuideline",
  "isRetrospectiveOrSurvey",
]);

export function priorityFeatureLabel(name: string): string {
  return PRIORITY_FEATURE_LABELS[name] ?? name;
}

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

/** Handcrafted features only (no embedding PCA). */
export function extractHandcraftedFeatures(
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

/** Full feature vector: handcrafted + embedding PCA (zeros if missing). */
export function extractPriorityFeatures(
  rec: PubMedRecord,
  breakdown: RelevanceBreakdown,
  embPca: number[] | null = null
): number[] {
  const hand = extractHandcraftedFeatures(rec, breakdown);
  const pca =
    embPca && embPca.length === EMBEDDING_PCA_DIMS
      ? embPca
      : Array(EMBEDDING_PCA_DIMS).fill(0);
  return [...hand, ...pca];
}
