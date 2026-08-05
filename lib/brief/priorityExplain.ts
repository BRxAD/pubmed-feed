import "server-only";
import type { PubMedRecord } from "@/lib/pubmed/efetch";
import { computeBreakdown, type RankingWeights } from "@/lib/ranking";
import { isHighImpactJournal } from "@/lib/jif";
import { isQ1Journal } from "@/lib/scimago";
import {
  extractPriorityFeatures,
  PRIORITY_FEATURE_NAMES,
} from "@/lib/brief/priorityFeatures";
import {
  fallbackPredictedPriority,
  type PriorityModel,
  type PriorityPredictionSource,
} from "@/lib/brief/priorityModel";

/** Human-readable names for the admin panel. Unknown keys fall back to the raw name. */
const FEATURE_LABELS: Record<string, string> = {
  stewardshipTitle: "Title term match",
  stewardshipAbstract: "Abstract term match",
  largeStudy: "Large study",
  extraTerms: "Extra terms",
  studyBoostFactor: "Study boost",
  jifNorm: "Impact factor",
  isQ1: "Q1 journal",
  isRct: "RCT",
  isSystematicReview: "Systematic review",
  isCohort: "Cohort",
  isMulticenter: "Multicenter",
  clinicalStewardship: "Clinical stewardship",
  novelty: "Novelty",
  intervention: "Intervention",
  guideline: "Guideline",
  nonHumanOnly: "Non-human only",
  clinicalBonusNorm: "Clinical rubric total",
  logAbstractWords: "Abstract length",
  keywordCountNorm: "Keyword count",
  isReview: "Review article",
  isGuideline: "Guideline",
  isRetrospectiveOrSurvey: "Retrospective / survey",
};

export type PriorityFeatureContribution = {
  name: string;
  label: string;
  /** Raw feature value for this article. */
  value: number;
  /** Learned model coefficient, on standardized units. */
  weight: number;
  /** weight × standardized value — how much this feature moved the prediction. */
  contribution: number;
};

export type PriorityExplanation = {
  priority: number;
  source: PriorityPredictionSource;
  /** Model intercept, i.e. the prediction before any feature moves it. */
  bias: number | null;
  /** Sorted by absolute contribution, largest driver first. */
  contributions: PriorityFeatureContribution[];
};

/**
 * Same prediction as `predictArticlePriority`, plus the per-feature breakdown
 * behind it. Kept separate so the admin panel can explain a score without the
 * serving path paying for it.
 */
export function explainArticlePriority(options: {
  rec: PubMedRecord;
  queryString: string;
  weights: RankingWeights;
  model: PriorityModel | null;
}): PriorityExplanation {
  const { rec, queryString, weights, model } = options;
  const jifIsHigh = isQ1Journal(rec.journal) || isHighImpactJournal(rec.journal);
  const breakdown = computeBreakdown(queryString, rec, weights, true, jifIsHigh);
  const features = extractPriorityFeatures(rec, breakdown);

  const label = (name: string) => FEATURE_LABELS[name] ?? name;

  if (!model) {
    return {
      priority: fallbackPredictedPriority(features),
      source: "fallback",
      bias: null,
      contributions: PRIORITY_FEATURE_NAMES.map((name, i) => ({
        name,
        label: label(name),
        value: features[i] ?? 0,
        weight: 0,
        contribution: 0,
      })),
    };
  }

  let raw = model.bias;
  const contributions: PriorityFeatureContribution[] = [];

  for (let i = 0; i < model.weights.length; i++) {
    const name = model.featureNames[i] ?? PRIORITY_FEATURE_NAMES[i] ?? `f${i}`;
    const value = features[i] ?? 0;
    const std = model.stds[i] ?? 1;
    const z = std > 1e-8 ? (value - (model.means[i] ?? 0)) / std : 0;
    const weight = model.weights[i] ?? 0;
    const contribution = weight * z;
    raw += contribution;
    contributions.push({ name, label: label(name), value, weight, contribution });
  }

  contributions.sort(
    (a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)
  );

  return {
    priority: Math.min(10, Math.max(1, Math.round(raw))),
    source: "model",
    bias: model.bias,
    contributions,
  };
}
