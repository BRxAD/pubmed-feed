import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mergeFeedSettings,
  toRankingWeights,
  type BriefFeedSettings,
} from "@/lib/brief/feedSettings";
import { DEFAULT_WEIGHTS, type RankingWeights, type RelevanceBreakdown } from "@/lib/ranking";

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
  return toRankingWeights(mergeFeedSettings(stored));
}

export function mergeStoredFeedSettings(
  stored: Record<string, unknown> | null | undefined
): BriefFeedSettings {
  return mergeFeedSettings(stored);
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
 * Recompute a few base relevance weights from admin priority ratings.
 * Only stewardship/large-study signals are learned — never overwrite Brief
 * settings toggles (JIF boost, study boost) or the clinical rubric.
 */
export function computeLearnedBaseWeights(rows: FeedbackRow[]): Pick<
  RankingWeights,
  "stewardshipTitle" | "stewardshipAbstract" | "largeStudy"
> {
  const high = rows.filter((r) => r.admin_priority >= 7);
  const low = rows.filter((r) => r.admin_priority <= 4);

  if (high.length < 2 || low.length < 2) {
    return {
      stewardshipTitle: DEFAULT_WEIGHTS.stewardshipTitle,
      stewardshipAbstract: DEFAULT_WEIGHTS.stewardshipAbstract,
      largeStudy: DEFAULT_WEIGHTS.largeStudy,
    };
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
  };
}

/** @deprecated Use computeLearnedBaseWeights — kept for any external callers. */
export function computeLearnedWeights(rows: FeedbackRow[]): RankingWeights {
  return {
    ...DEFAULT_WEIGHTS,
    ...computeLearnedBaseWeights(rows),
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

  const learned = computeLearnedBaseWeights(
    (feedback ?? []) as FeedbackRow[]
  );

  const { data: topicRow } = await supabase
    .from("topics")
    .select("ranking_weights")
    .eq("id", topicId)
    .maybeSingle();

  const existing = mergeFeedSettings(
    (topicRow as { ranking_weights?: Record<string, unknown> | null } | null)
      ?.ranking_weights
  );

  // Preserve Brief settings (JIF toggle, clinical rubric, penalties, brief config).
  // Only refresh the three learned base weights.
  const merged: BriefFeedSettings = {
    ...existing,
    stewardshipTitle: learned.stewardshipTitle,
    stewardshipAbstract: learned.stewardshipAbstract,
    largeStudy: learned.largeStudy,
    brief: { ...existing.brief },
  };

  await supabase
    .from("topics")
    .update({ ranking_weights: merged })
    .eq("id", topicId);

  return toRankingWeights(merged);
}

export async function saveAdminPriority(options: {
  topicId: string;
  pmid: string;
  priority: number | null;
  snapshot: FeatureSnapshot;
  supabase: SupabaseClient;
}): Promise<void> {
  const { topicId, pmid, priority, snapshot, supabase } = options;

  const { data: updated, error: summaryErr } = await supabase
    .from("summaries")
    .update({ admin_priority: priority })
    .eq("topic_id", topicId)
    .eq("pmid", pmid)
    .select("pmid");

  if (summaryErr) throw new Error(summaryErr.message);

  // If the summary row is missing, create one so the rating persists.
  if (!updated?.length) {
    const { error: upsertErr } = await supabase.from("summaries").upsert(
      {
        topic_id: topicId,
        pmid,
        summary_text: null,
        admin_priority: priority,
      },
      { onConflict: "topic_id,pmid" }
    );
    if (upsertErr) throw new Error(upsertErr.message);
  }

  if (priority != null) {
    const { error: fbErr } = await supabase.from("relevance_feedback").insert({
      topic_id: topicId,
      pmid,
      admin_priority: priority,
      feature_snapshot: snapshot,
    });
    if (fbErr) throw new Error(fbErr.message);
    // Ranking weights still learn from ratings; priority ridge model retrains
    // weekly via cron (/api/cron/retrain-priority) — not per rating (egress).
    await relearnTopicWeights(topicId, supabase);
  }
}
