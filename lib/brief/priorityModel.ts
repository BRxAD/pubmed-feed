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
import {
  EMBEDDING_PCA_DIMS,
  fitEmbeddingPca,
  getOrCreateEmbeddings,
  l2Normalize,
  projectEmbeddingPca,
  type EmbeddingPca,
} from "@/lib/brief/embeddings";

/** Minimum admin-rated examples before we trust the ridge model. */
export const MIN_PRIORITY_TRAINING_SAMPLES = 8;

const RIDGE_LAMBDA = 1.5;

export type PriorityModel = {
  version: 5;
  method: "ridge_regression";
  trainedAt: string;
  sampleCount: number;
  featureNames: string[];
  means: number[];
  stds: number[];
  weights: number[];
  bias: number;
  /** OpenAI embedding → PCA projection used for embPca1..8. */
  embeddingPca: EmbeddingPca | null;
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
  samples: { features: number[]; priority: number }[],
  embeddingPca: EmbeddingPca | null = null
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
    version: 5,
    method: "ridge_regression",
    trainedAt: new Date().toISOString(),
    sampleCount: n,
    featureNames: [...PRIORITY_FEATURE_NAMES],
    means,
    stds,
    weights: coeffs.slice(0, p),
    bias: coeffs[p] ?? 5,
    embeddingPca,
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
 * Standing in for a trained model before enough ratings exist.
 *
 * These are a ridge fit over all 869 human ratings rather than hand-picked
 * weights, expressed as the same standardize-then-weight form the trained
 * model uses. The previous hand-tuned version predicted a mean priority of
 * 7.2 against an actual mean of 3.6 — a mean absolute error of 3.7 — because
 * every coefficient was positive and the intercept assumed a much more
 * generous rater. This version lands at 3.6 with a mean absolute error of 0.9.
 *
 * Two coefficients are negative and that is not a mistake: conditional on
 * topic relevance, Q1 journals and keyword-dense records rate slightly lower.
 */
const FALLBACK_INTERCEPT = 3.5714;

/** Aligned with PRIORITY_FEATURE_NAMES. Embedding PCA weights are 0 until retrained. */
const FALLBACK_TERMS: { mean: number; std: number; weight: number }[] = [
  { mean: 23.3795, std: 28.5802, weight: 0.3677 }, // stewardshipTitle
  { mean: 0.4229, std: 0.1827, weight: 0.4250 }, // clinicalBonusNorm
  { mean: 0.7313, std: 0.4433, weight: -0.2812 }, // isQ1
  { mean: 0.0714, std: 0.2575, weight: 0.1824 }, // isRct
  { mean: 0.064, std: 0.2447, weight: 0.0834 }, // isSystematicReview
  { mean: 0.2761, std: 0.4471, weight: 0.1964 }, // largeStudy
  { mean: 0.1172, std: 0.1489, weight: 0.2498 }, // jifNorm
  { mean: 0.3161, std: 0.1801, weight: -0.1502 }, // keywordCountNorm
  { mean: 0.2111, std: 0.4081, weight: 0.1297 }, // isReview
  { mean: 0.2495, std: 0.4327, weight: -0.0539 }, // isGuideline
  { mean: 0.3518, std: 0.4775, weight: 0.0536 }, // isRetrospectiveOrSurvey
  ...Array.from({ length: EMBEDDING_PCA_DIMS }, () => ({
    mean: 0,
    std: 1,
    weight: 0,
  })),
];

if (FALLBACK_TERMS.length !== PRIORITY_FEATURE_NAMES.length) {
  throw new Error(
    `FALLBACK_TERMS length ${FALLBACK_TERMS.length} != PRIORITY_FEATURE_NAMES ${PRIORITY_FEATURE_NAMES.length}`
  );
}

export function fallbackPredictedPriority(features: number[]): number {
  let raw = FALLBACK_INTERCEPT;
  for (let i = 0; i < FALLBACK_TERMS.length; i++) {
    const term = FALLBACK_TERMS[i];
    const z = (features[i] ?? term.mean) - term.mean;
    raw += (z / term.std) * term.weight;
  }
  return clampPriority(raw);
}

/** Per-feature breakdown using the calibrated fallback (admin UI when untrained). */
export function explainFallbackContributions(features: number[]): {
  priority: number;
  bias: number;
  contributions: { weight: number; contribution: number }[];
} {
  let raw = FALLBACK_INTERCEPT;
  const contributions = FALLBACK_TERMS.map((term, i) => {
    const z = ((features[i] ?? term.mean) - term.mean) / term.std;
    const contribution = z * term.weight;
    raw += contribution;
    return { weight: term.weight, contribution };
  });
  return {
    priority: clampPriority(raw),
    bias: FALLBACK_INTERCEPT,
    contributions,
  };
}

export function parsePriorityModel(
  stored: unknown
): PriorityModel | null {
  if (!stored || typeof stored !== "object") return null;
  const m = stored as Partial<PriorityModel>;
  // Earlier versions used different feature vectors — discard and retrain.
  if (m.version !== 5 || m.method !== "ridge_regression") return null;
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
  /** Precomputed OpenAI embedding; projected via model.embeddingPca when present. */
  embedding?: number[] | null;
}): { priority: number; source: PriorityPredictionSource } {
  const jifIsHigh =
    isQ1Journal(options.rec.journal) ||
    isHighImpactJournal(options.rec.journal);
  const breakdown = computeBreakdown(
    options.queryString,
    options.rec,
    options.weights,
    true,
    jifIsHigh
  );
  const embPca = projectEmbeddingPca(
    options.embedding,
    options.model?.embeddingPca
  );
  const features = extractPriorityFeatures(options.rec, breakdown, embPca);

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

const FEEDBACK_FETCH_PAGE = 1000;
/** Guards against a runaway loop if the table grows unexpectedly large. */
const FEEDBACK_FETCH_MAX = 50_000;
const ARTICLE_FETCH_CHUNK = 200;

type JoinedArticle = {
  title: string | null;
  abstract: string | null;
  journal: string | null;
  publication_types: string[] | null;
  keywords: string[] | null;
  mesh_terms: string[] | null;
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
  // Every rating is used. Accuracy was still climbing at 869 samples in
  // scripts/priority-eval, and training on the most recent N instead scored no
  // better, so there is no drift argument for a cap.
  const byPmid = new Map<string, number>();
  for (let from = 0; ; from += FEEDBACK_FETCH_PAGE) {
    const { data, error } = await supabase
      .from("relevance_feedback")
      .select("pmid, admin_priority")
      .eq("topic_id", topicId)
      .order("created_at", { ascending: false })
      .range(from, from + FEEDBACK_FETCH_PAGE - 1);

    if (error) throw new Error(error.message);

    const batch = data ?? [];
    for (const row of batch) {
      const pmid = String((row as { pmid?: string }).pmid ?? "").trim();
      const priority = (row as { admin_priority?: number }).admin_priority;
      if (!pmid || priority == null) continue;
      // Rows arrive newest first, so the first hit is the current rating.
      if (!byPmid.has(pmid)) byPmid.set(pmid, priority);
    }

    if (batch.length < FEEDBACK_FETCH_PAGE) break;
    if (from + FEEDBACK_FETCH_PAGE >= FEEDBACK_FETCH_MAX) break;
  }

  const pmids = [...byPmid.keys()];
  if (pmids.length < MIN_PRIORITY_TRAINING_SAMPLES) {
    await savePriorityModel(supabase, topicId, null);
    return null;
  }

  // Chunked so the `in` filter stays inside URL length limits.
  const articles: unknown[] = [];
  for (let i = 0; i < pmids.length; i += ARTICLE_FETCH_CHUNK) {
    const { data, error: artErr } = await supabase
      .from("summaries")
      .select(
        "pmid, articles!inner(title, abstract, journal, publication_types, keywords, mesh_terms)"
      )
      .eq("topic_id", topicId)
      .in("pmid", pmids.slice(i, i + ARTICLE_FETCH_CHUNK));

    if (artErr) throw new Error(artErr.message);
    articles.push(...(data ?? []));
  }

  const parsedArticles: {
    pmid: string;
    art: JoinedArticle;
    priority: number;
  }[] = [];

  for (const raw of articles) {
    const parsed = articleFromSummaryRow(raw);
    if (!parsed) continue;
    const priority = byPmid.get(parsed.pmid);
    if (priority == null) continue;
    parsedArticles.push({
      pmid: parsed.pmid,
      art: parsed.article,
      priority,
    });
  }

  const embeddings = await getOrCreateEmbeddings(
    supabase,
    parsedArticles.map((p) => ({
      pmid: p.pmid,
      title: p.art.title,
      abstract: p.art.abstract,
    }))
  );

  const embForPca: number[][] = [];
  for (let i = 0; i < parsedArticles.length; i++) {
    const emb = embeddings[i];
    if (emb) embForPca.push(l2Normalize(emb));
  }
  const embeddingPca = fitEmbeddingPca(embForPca, EMBEDDING_PCA_DIMS);

  const samples: { features: number[]; priority: number }[] = [];

  for (let i = 0; i < parsedArticles.length; i++) {
    const { pmid, art, priority } = parsedArticles[i];
    const rec: PubMedRecord = {
      pmid,
      title: art.title,
      abstract: art.abstract ?? null,
      journal: art.journal ?? null,
      pubDate: null,
      publicationTypes: art.publication_types ?? [],
      meshTerms: art.mesh_terms ?? [],
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
    const emb = embeddings[i];
    const embPca = projectEmbeddingPca(
      emb ? l2Normalize(emb) : null,
      embeddingPca
    );
    samples.push({
      features: extractPriorityFeatures(rec, breakdown, embPca),
      priority,
    });
  }

  const model = trainPriorityModel(samples, embeddingPca);
  await savePriorityModel(supabase, topicId, model);

  return model;
}
