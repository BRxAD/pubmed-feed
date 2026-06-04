import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RelevanceBreakdown, RankingWeights } from "@/lib/ranking";
import { DEFAULT_WEIGHTS } from "@/lib/ranking";

export type FeatureSnapshot = {
  stewardshipTitle: number;
  stewardshipAbstract: number;
  largeStudy: number;
  extraTerms: number;
  studyBoostFactor: number;
  jifBoostFactor: number;
  algorithmicScore: number;
};

export function snapshotFromBreakdown(b: RelevanceBreakdown): FeatureSnapshot {
  return {
    stewardshipTitle: b.stewardshipTitle,
    stewardshipAbstract: b.stewardshipAbstract,
    largeStudy: b.largeStudy,
    extraTerms: b.extraTerms,
    studyBoostFactor: b.studyBoostFactor,
    jifBoostFactor: b.jifBoostFactor,
    algorithmicScore: b.finalScore,
  };
}

type FeedbackRow = {
  admin_priority: number;
  feature_snapshot: FeatureSnapshot | null;
};

/** Blend learned topic weights with defaults from admin priority feedback. */
export function mergeLearnedWeights(
  stored: Record<string, unknown> | null | undefined
): RankingWeights {
  if (!stored || typeof stored !== "object") return { ...DEFAULT_WEIGHTS };

  const clamp = (v: unknown, fallback: number, max: number) => {
    const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
    return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : fallback;
  };

  return {
    stewardshipTitle: clamp(
      stored.stewardshipTitle,
      DEFAULT_WEIGHTS.stewardshipTitle,
      120
    ),
    stewardshipAbstract: clamp(
      stored.stewardshipAbstract,
      DEFAULT_WEIGHTS.stewardshipAbstract,
      50
    ),
    largeStudy: clamp(stored.largeStudy, DEFAULT_WEIGHTS.largeStudy, 60),
    studyTypeBoost: stored.studyTypeBoost !== false,
    jifMultiplier: stored.jifMultiplier !== false,
  };
}

function avgFeature(rows: FeedbackRow[], key: keyof FeatureSnapshot): number {
  if (rows.length === 0) return 0;
  const sum = rows.reduce(
    (acc, r) => acc + (Number(r.feature_snapshot?.[key]) || 0),
    0
  );
  return sum / rows.length;
}

/**
 * Recompute topic ranking_weights from admin priority ratings.
 * High-priority items (>=7) vs low (<=4) shift weights toward features that differentiate them.
 */
export function computeLearnedWeights(rows: FeedbackRow[]): RankingWeights {
  const high = rows.filter((r) => r.admin_priority >= 7);
  const low = rows.filter((r) => r.admin_priority <= 4);

  if (high.length < 2 || low.length < 2) {
    return { ...DEFAULT_WEIGHTS };
  }

  const scale = (highAvg: number, lowAvg: number, base: number, max: number) => {
    if (highAvg <= lowAvg) return base;
    const ratio = highAvg / Math.max(lowAvg, 1);
    return Math.min(max, Math.round(base * Math.min(ratio, 1.5)));
  };

  return {
    stewardshipTitle: scale(
      avgFeature(high, "stewardshipTitle"),
      avgFeature(low, "stewardshipTitle"),
      DEFAULT_WEIGHTS.stewardshipTitle,
      120
    ),
    stewardshipAbstract: scale(
      avgFeature(high, "stewardshipAbstract"),
      avgFeature(low, "stewardshipAbstract"),
      DEFAULT_WEIGHTS.stewardshipAbstract,
      50
    ),
    largeStudy: scale(
      avgFeature(high, "largeStudy"),
      avgFeature(low, "largeStudy"),
      DEFAULT_WEIGHTS.largeStudy,
      60
    ),
    studyTypeBoost: DEFAULT_WEIGHTS.studyTypeBoost,
    jifMultiplier: DEFAULT_WEIGHTS.jifMultiplier,
  };
}

/** Admin priority (1–10) boosts sort score; used when no direct rating exists for new articles. */
export function priorityScoreBoost(priority: number | null | undefined): number {
  if (priority == null || !Number.isFinite(priority)) return 0;
  return priority * 8;
}

export async function relearnTopicWeights(
  topicId: string,
  supabase: SupabaseClient
): Promise<RankingWeights> {
  const { data: feedback } = await supabase
    .from("relevance_feedback")
    .select("admin_priority, feature_snapshot")
    .eq("topic_id", topicId)
    .order("created_at", { ascending: false })
    .limit(200);

  const weights = computeLearnedWeights(
    (feedback ?? []) as FeedbackRow[]
  );

  await supabase
    .from("topics")
    .update({ ranking_weights: weights })
    .eq("id", topicId);

  return weights;
}

export async function saveAdminPriority(options: {
  topicId: string;
  pmid: string;
  priority: number | null;
  snapshot: FeatureSnapshot;
  supabase: SupabaseClient;
}): Promise<void> {
  const { topicId, pmid, priority, snapshot, supabase } = options;

  const { error: summaryErr } = await supabase
    .from("summaries")
    .update({ admin_priority: priority })
    .eq("topic_id", topicId)
    .eq("pmid", pmid);

  if (summaryErr) throw new Error(summaryErr.message);

  if (priority != null) {
    const { error: fbErr } = await supabase.from("relevance_feedback").insert({
      topic_id: topicId,
      pmid,
      admin_priority: priority,
      feature_snapshot: snapshot,
    });
    if (fbErr) throw new Error(fbErr.message);
    await relearnTopicWeights(topicId, supabase);
  }
}
