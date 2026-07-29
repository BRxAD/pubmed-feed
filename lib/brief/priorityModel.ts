import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PubMedRecord } from "@/lib/pubmed/efetch";
import { computeBreakdown, type RankingWeights } from "@/lib/ranking";
import { isHighImpactJournal } from "@/lib/jif";
import { isQ1Journal } from "@/lib/scimago";
import {
  extractPriorityFeatures,
  PRIORITY_FEATURE_NAMES,
} from "@/lib/brief/priorityFeatures";

/** Minimum admin-rated examples before we trust the ridge model. */
export const MIN_PRIORITY_TRAINING_SAMPLES = 8;

const RIDGE_LAMBDA = 1.5;

export type PriorityModel = {
  version: 2;
  method: "ridge_regression";
  trainedAt: string;
  sampleCount: number;
  featureNames: string[];
  means: number[];
  stds: number[];
  weights: number[];
  bias: number;
};

export type PriorityPredictionSource = "admin" | "model" | "fallback";

function clampPriority(n: number): number {
  return Math.min(10, Math.max(1, Math.round(n)));
}

function standardize(
  features: number[],
  means: number[],
  stds: number[]
): number[] {
  return features.map((v, i) => {
    const std = stds[i] ?? 1;
    return std > 1e-8 ? (v - (means[i] ?? 0)) / std : 0;
  });
}

/** Train ridge regression: admin priority (1–10) from article features. */
export function trainPriorityModel(
  samples: { features: number[]; priority: number }[]
): PriorityModel | null {
  if (samples.length < MIN_PRIORITY_TRAINING_SAMPLES) return null;

  const p = PRIORITY_FEATURE_NAMES.length;
  const means = Array(p).fill(0);
  const stds = Array(p).fill(0);

  for (let j = 0; j < p; j++) {
    const col = samples.map((s) => s.features[j] ?? 0);
    const mean = col.reduce((a, b) => a + b, 0) / col.length;
    means[j] = mean;
    const variance =
      col.reduce((acc, v) => acc + (v - mean) ** 2, 0) / col.length;
    stds[j] = Math.sqrt(variance) || 1;
  }

  const n = samples.length;
  const dim = p + 1;
  const xtx = Array.from({ length: dim }, () => Array(dim).fill(0));
  const xty = Array(dim).fill(0);

  for (const sample of samples) {
    const z = standardize(sample.features, means, stds);
    const row = [...z, 1];
    for (let i = 0; i < dim; i++) {
      xty[i] += row[i] * sample.priority;
      for (let j = 0; j < dim; j++) {
        xtx[i][j] += row[i] * row[j];
      }
    }
  }

  for (let i = 0; i < p; i++) {
    xtx[i][i] += RIDGE_LAMBDA;
  }

  const coeffs = solveLinearSystem(xtx, xty);
  if (!coeffs) return null;

  return {
    version: 2,
    method: "ridge_regression",
    trainedAt: new Date().toISOString(),
    sampleCount: n,
    featureNames: [...PRIORITY_FEATURE_NAMES],
    means,
    stds,
    weights: coeffs.slice(0, p),
    bias: coeffs[p] ?? 5,
  };
}

function solveLinearSystem(a: number[][], b: number[]): number[] | null {
  const n = a.length;
  const aug = a.map((row, i) => [...row, b[i] ?? 0]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[pivot][col])) pivot = row;
    }
    if (Math.abs(aug[pivot][col]) < 1e-10) return null;
    [aug[col], aug[pivot]] = [aug[pivot], aug[col]];

    const div = aug[col][col];
    for (let j = col; j <= n; j++) aug[col][j] /= div;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  return aug.map((row) => row[n] ?? 0);
}

export function predictPriorityFromModel(
  model: PriorityModel,
  features: number[]
): number {
  const z = standardize(features, model.means, model.stds);
  let raw = model.bias;
  for (let i = 0; i < model.weights.length; i++) {
    raw += (model.weights[i] ?? 0) * (z[i] ?? 0);
  }
  return clampPriority(raw);
}

/**
 * Heuristic when the model is not trained yet — emphasizes clinical rubric
 * signals that track editorial priority (Q1, RCT/SR, multicenter, ASP, etc.).
 */
export function fallbackPredictedPriority(features: number[]): number {
  const [
    stewardshipTitle,
    stewardshipAbstract,
    largeStudy,
    extraTerms,
    studyBoostFactor,
    jifNorm,
    isQ1,
    isRct,
    isSystematicReview,
    isCohort,
    isMulticenter,
    clinicalStewardship,
    novelty,
    intervention,
    guideline,
    nonHumanOnly,
    clinicalBonusNorm,
    logAbstractWords,
    keywordCountNorm,
  ] = features;

  const raw =
    2.0 +
    stewardshipTitle / 40 +
    stewardshipAbstract / 14 +
    largeStudy * 1.2 +
    extraTerms / 30 +
    (studyBoostFactor - 1) * 2.5 +
    jifNorm * 1.2 +
    isQ1 * 1.4 +
    isRct * 1.1 +
    isSystematicReview * 1.3 +
    isCohort * 0.5 +
    isMulticenter * 1.0 +
    clinicalStewardship * 1.2 +
    novelty * 0.5 +
    intervention * 0.7 +
    guideline * 1.1 +
    nonHumanOnly * -1.5 +
    clinicalBonusNorm * 1.5 +
    logAbstractWords * 0.5 +
    keywordCountNorm * 0.3;

  return clampPriority(raw);
}

export function parsePriorityModel(
  stored: unknown
): PriorityModel | null {
  if (!stored || typeof stored !== "object") return null;
  const m = stored as Partial<PriorityModel>;
  // v1 models used a shorter feature vector — discard so we retrain on v2.
  if (m.version !== 2 || m.method !== "ridge_regression") return null;
  if (
    !Array.isArray(m.weights) ||
    !Array.isArray(m.means) ||
    !Array.isArray(m.stds) ||
    m.weights.length !== PRIORITY_FEATURE_NAMES.length
  ) {
    return null;
  }
  return m as PriorityModel;
}

/** Returns null if column missing or no model saved (safe before SQL migration). */
export async function loadPriorityModel(
  supabase: SupabaseClient,
  topicId: string
): Promise<PriorityModel | null> {
  const { data, error } = await supabase
    .from("topics")
    .select("priority_model")
    .eq("id", topicId)
    .maybeSingle();

  if (error) {
    if (isMissingPriorityModelColumn(error)) return null;
    console.warn("[priorityModel] load failed:", error.message);
    return null;
  }

  return parsePriorityModel(
    (data as { priority_model?: unknown } | null)?.priority_model
  );
}

function isMissingPriorityModelColumn(error: {
  code?: string;
  message?: string;
}): boolean {
  const msg = (error.message ?? "").toLowerCase();
  return (
    msg.includes("priority_model") &&
    (msg.includes("does not exist") ||
      msg.includes("could not find") ||
      msg.includes("schema cache"))
  );
}

async function savePriorityModel(
  supabase: SupabaseClient,
  topicId: string,
  model: PriorityModel | null
): Promise<boolean> {
  const { error } = await supabase
    .from("topics")
    .update({ priority_model: model })
    .eq("id", topicId);

  if (error) {
    if (isMissingPriorityModelColumn(error)) return false;
    throw new Error(error.message);
  }
  return true;
}

export function predictArticlePriority(options: {
  rec: PubMedRecord;
  queryString: string;
  weights: RankingWeights;
  model: PriorityModel | null;
}): { priority: number; source: PriorityPredictionSource } {
  const jifIsHigh = isQ1Journal(options.rec.journal) || isHighImpactJournal(options.rec.journal);
  const breakdown = computeBreakdown(
    options.queryString,
    options.rec,
    options.weights,
    true,
    jifIsHigh
  );
  const features = extractPriorityFeatures(options.rec, breakdown);

  if (options.model) {
    return {
      priority: predictPriorityFromModel(options.model, features),
      source: "model",
    };
  }

  return {
    priority: fallbackPredictedPriority(features),
    source: "fallback",
  };
}

type JoinedArticle = {
  title: string | null;
  abstract: string | null;
  journal: string | null;
  publication_types: string[] | null;
  keywords: string[] | null;
};

function articleFromSummaryRow(row: unknown): {
  pmid: string;
  article: JoinedArticle;
} | null {
  if (!row || typeof row !== "object") return null;
  const pmid = String((row as { pmid?: string }).pmid ?? "").trim();
  if (!pmid) return null;

  const joined = (row as { articles?: JoinedArticle | JoinedArticle[] | null })
    .articles;
  const article = Array.isArray(joined) ? joined[0] : joined;
  if (!article || typeof article !== "object" || !article.title?.trim()) {
    return null;
  }

  return { pmid, article };
}

export async function relearnPriorityModel(
  topicId: string,
  supabase: SupabaseClient,
  queryString: string,
  rankingWeights: RankingWeights
): Promise<PriorityModel | null> {
  const { data: feedback, error } = await supabase
    .from("relevance_feedback")
    .select("pmid, admin_priority")
    .eq("topic_id", topicId)
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) throw new Error(error.message);

  const byPmid = new Map<string, number>();
  for (const row of feedback ?? []) {
    const pmid = String((row as { pmid?: string }).pmid ?? "").trim();
    const priority = (row as { admin_priority?: number }).admin_priority;
    if (!pmid || priority == null) continue;
    if (!byPmid.has(pmid)) byPmid.set(pmid, priority);
  }

  const pmids = [...byPmid.keys()];
  if (pmids.length < MIN_PRIORITY_TRAINING_SAMPLES) {
    await savePriorityModel(supabase, topicId, null);
    return null;
  }

  const { data: articles, error: artErr } = await supabase
    .from("summaries")
    .select(
      "pmid, articles!inner(title, abstract, journal, publication_types, keywords)"
    )
    .eq("topic_id", topicId)
    .in("pmid", pmids.slice(0, 300));

  if (artErr) throw new Error(artErr.message);

  const samples: { features: number[]; priority: number }[] = [];

  for (const raw of articles ?? []) {
    const parsed = articleFromSummaryRow(raw);
    if (!parsed) continue;

    const { pmid, article: art } = parsed;
    const priority = byPmid.get(pmid);
    if (priority == null) continue;

    const rec: PubMedRecord = {
      pmid,
      title: art.title,
      abstract: art.abstract ?? null,
      journal: art.journal ?? null,
      pubDate: null,
      publicationTypes: art.publication_types ?? [],
      meshTerms: [],
      keywords: art.keywords ?? [],
      authors: [],
    };

    const jifIsHigh =
      isQ1Journal(rec.journal) || isHighImpactJournal(rec.journal);
    const breakdown = computeBreakdown(
      queryString,
      rec,
      rankingWeights,
      true,
      jifIsHigh
    );
    samples.push({
      features: extractPriorityFeatures(rec, breakdown),
      priority,
    });
  }

  const model = trainPriorityModel(samples);
  await savePriorityModel(supabase, topicId, model);

  return model;
}
