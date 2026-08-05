import "server-only";
import type { PubMedRecord } from "@/lib/pubmed/efetch";
import { computeBreakdown, type RankingWeights } from "@/lib/ranking";
import { isHighImpactJournal } from "@/lib/jif";
import { isQ1Journal } from "@/lib/scimago";
import {
  extractPriorityFeatures,
  PRIORITY_FEATURE_NAMES,
  priorityFeatureLabel,
} from "@/lib/brief/priorityFeatures";
import {
  explainFallbackContributions,
  type PriorityModel,
  type PriorityPredictionSource,
} from "@/lib/brief/priorityModel";

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
  contributions: PriorityFeatureContribution[];
};

/**
 * Same prediction as `predictArticlePriority`, plus the per-feature breakdown
 * for the admin panel. Always returns one row per PRIORITY_FEATURE_NAMES entry
 * (or the trained model's featureNames), including when using the fallback.
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

  if (!model) {
    const fb = explainFallbackContributions(features);
    const contributions = PRIORITY_FEATURE_NAMES.map((name, i) => {
      const row = fb.contributions[i];
      return {
        name,
        label: priorityFeatureLabel(name),
        value: features[i] ?? 0,
        weight: row?.weight ?? 0,
        contribution: row?.contribution ?? 0,
      };
    });
    contributions.sort(
      (a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)
    );
    return {
      priority: fb.priority,
      source: "fallback",
      bias: fb.bias,
      contributions,
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
    contributions.push({
      name,
      label: priorityFeatureLabel(name),
      value,
      weight,
      contribution,
    });
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
