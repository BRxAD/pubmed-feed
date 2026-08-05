import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";

export const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
export const OPENAI_EMBEDDING_DIMS = 1536;
export const EMBEDDING_PCA_DIMS = 8;

const SETTINGS_KEY_PREFIX = "emb:oai3s:";

function embeddingKey(pmid: string): string {
  return `${SETTINGS_KEY_PREFIX}${pmid}`;
}

export function embeddingText(
  title: string | null | undefined,
  abstract: string | null | undefined
): string {
  return `${title ?? ""}\n${abstract ?? ""}`.trim() || " ";
}

function getOpenAI(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

export async function embedTextsOpenAI(
  texts: string[]
): Promise<number[][] | null> {
  if (texts.length === 0) return [];
  const client = getOpenAI();
  if (!client) return null;

  const out: number[][] = Array.from({ length: texts.length }, () => []);
  const batchSize = 64;
  for (let i = 0; i < texts.length; i += batchSize) {
    const chunk = texts
      .slice(i, i + batchSize)
      .map((t) => (t.trim() ? t : " "));
    const resp = await client.embeddings.create({
      model: OPENAI_EMBEDDING_MODEL,
      input: chunk,
    });
    for (const row of resp.data) {
      out[i + row.index] = row.embedding;
    }
  }
  return out;
}

export async function loadCachedEmbeddings(
  supabase: SupabaseClient,
  pmids: string[]
): Promise<Map<string, number[]>> {
  const map = new Map<string, number[]>();
  if (pmids.length === 0) return map;

  const keys = pmids.map(embeddingKey);
  for (let i = 0; i < keys.length; i += 200) {
    const chunk = keys.slice(i, i + 200);
    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", chunk);
    if (error) {
      console.warn("[embeddings] cache read failed:", error.message);
      return map;
    }
    for (const row of data ?? []) {
      const key = String((row as { key?: string }).key ?? "");
      const pmid = key.slice(SETTINGS_KEY_PREFIX.length);
      try {
        const vec = JSON.parse(String((row as { value?: string }).value ?? ""));
        if (
          Array.isArray(vec) &&
          vec.length === OPENAI_EMBEDDING_DIMS &&
          vec.every((x) => typeof x === "number")
        ) {
          map.set(pmid, vec as number[]);
        }
      } catch {
        /* ignore bad cache rows */
      }
    }
  }
  return map;
}

async function saveCachedEmbedding(
  supabase: SupabaseClient,
  pmid: string,
  embedding: number[]
): Promise<void> {
  const { error } = await supabase.from("app_settings").upsert(
    {
      key: embeddingKey(pmid),
      value: JSON.stringify(embedding),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
  if (error) {
    console.warn("[embeddings] cache write failed:", error.message);
  }
}

/**
 * Return embeddings for each pmid (same order). Missing ones are fetched from
 * OpenAI and cached in app_settings. Entries stay null when the API key is
 * absent or the call fails.
 */
export async function getOrCreateEmbeddings(
  supabase: SupabaseClient,
  items: { pmid: string; title: string | null; abstract: string | null }[]
): Promise<(number[] | null)[]> {
  const pmids = items.map((i) => i.pmid);
  const cached = await loadCachedEmbeddings(supabase, pmids);
  const missingIdx: number[] = [];
  for (let i = 0; i < items.length; i++) {
    if (!cached.has(items[i].pmid)) missingIdx.push(i);
  }

  if (missingIdx.length > 0) {
    const texts = missingIdx.map((i) =>
      embeddingText(items[i].title, items[i].abstract)
    );
    const fresh = await embedTextsOpenAI(texts);
    if (fresh) {
      await Promise.all(
        missingIdx.map(async (itemIdx, j) => {
          const vec = fresh[j];
          if (!vec?.length) return;
          cached.set(items[itemIdx].pmid, vec);
          await saveCachedEmbedding(supabase, items[itemIdx].pmid, vec);
        })
      );
    }
  }

  return pmids.map((pmid) => cached.get(pmid) ?? null);
}

export type EmbeddingPca = {
  provider: "openai";
  model: typeof OPENAI_EMBEDDING_MODEL;
  dims: number;
  k: number;
  /** Column means of the training embedding matrix (length dims). */
  mean: number[];
  /** k × dims principal axes. */
  components: number[][];
};

/** L2-normalize in place copy. */
export function l2Normalize(v: number[]): number[] {
  let s = 0;
  for (const x of v) s += x * x;
  const n = Math.sqrt(s);
  if (n < 1e-12) return v.map(() => 0);
  return v.map((x) => x / n);
}

/**
 * PCA via the n×n Gram matrix (n samples ≪ dims). Returns top-k components.
 */
export function fitEmbeddingPca(
  embeddings: number[][],
  k: number = EMBEDDING_PCA_DIMS
): EmbeddingPca | null {
  const n = embeddings.length;
  if (n < k + 1) return null;
  const d = embeddings[0]?.length ?? 0;
  if (d !== OPENAI_EMBEDDING_DIMS) return null;

  const mean = Array(d).fill(0);
  for (const row of embeddings) {
    for (let j = 0; j < d; j++) mean[j] += row[j];
  }
  for (let j = 0; j < d; j++) mean[j] /= n;

  // Centered rows
  const X = embeddings.map((row) => row.map((x, j) => x - mean[j]));

  // G = X X^T (n × n)
  const G = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let dot = 0;
      const ai = X[i];
      const aj = X[j];
      for (let t = 0; t < d; t++) dot += ai[t] * aj[t];
      G[i][j] = dot;
      G[j][i] = dot;
    }
  }

  const components: number[][] = [];
  const used = Array.from({ length: n }, () => Array(n).fill(0)); // deflated G copy
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) used[i][j] = G[i][j];

  for (let comp = 0; comp < k; comp++) {
    // Power iteration for top eigenvector of used
    let v = Array.from({ length: n }, () => Math.random() - 0.5);
    let norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    v = v.map((x) => x / norm);
    let lambda = 0;
    for (let iter = 0; iter < 80; iter++) {
      const w = Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let j = 0; j < n; j++) s += used[i][j] * v[j];
        w[i] = s;
      }
      norm = Math.sqrt(w.reduce((s, x) => s + x * x, 0)) || 1;
      v = w.map((x) => x / norm);
      lambda = 0;
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let j = 0; j < n; j++) s += used[i][j] * v[j];
        lambda += v[i] * s;
      }
    }
    if (lambda < 1e-9) break;

    // component = X^T v / sqrt(lambda)
    const axis = Array(d).fill(0);
    const scale = 1 / Math.sqrt(lambda);
    for (let t = 0; t < d; t++) {
      let s = 0;
      for (let i = 0; i < n; i++) s += X[i][t] * v[i];
      axis[t] = s * scale;
    }
    components.push(axis);

    // Deflate: used -= lambda v v^T
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        used[i][j] -= lambda * v[i] * v[j];
      }
    }
  }

  if (components.length < k) return null;

  return {
    provider: "openai",
    model: OPENAI_EMBEDDING_MODEL,
    dims: d,
    k,
    mean,
    components,
  };
}

export function projectEmbeddingPca(
  embedding: number[] | null | undefined,
  pca: EmbeddingPca | null | undefined
): number[] {
  const zeros = Array(EMBEDDING_PCA_DIMS).fill(0);
  if (!embedding || !pca || embedding.length !== pca.dims) return zeros;
  if (pca.components.length < EMBEDDING_PCA_DIMS) return zeros;

  const centered = embedding.map((x, j) => x - (pca.mean[j] ?? 0));
  const out: number[] = [];
  for (let c = 0; c < EMBEDDING_PCA_DIMS; c++) {
    const axis = pca.components[c];
    let dot = 0;
    for (let j = 0; j < pca.dims; j++) dot += centered[j] * (axis[j] ?? 0);
    out.push(dot);
  }
  return out;
}
