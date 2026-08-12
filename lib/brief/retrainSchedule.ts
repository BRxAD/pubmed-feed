import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadPriorityModel,
  relearnPriorityModel,
  type PriorityModel,
} from "@/lib/brief/priorityModel";
import {
  mergeFeedSettings,
  toRankingWeights,
} from "@/lib/brief/feedSettings";

/** Priority model retrain cadence — not on every admin rating (egress). */
export const PRIORITY_RETRAIN_INTERVAL_MS = 48 * 60 * 60 * 1000;

export function isPriorityRetrainDue(
  model: PriorityModel | null,
  nowMs = Date.now()
): boolean {
  if (!model?.trainedAt) return true;
  const t = Date.parse(model.trainedAt);
  if (!Number.isFinite(t)) return true;
  return nowMs - t >= PRIORITY_RETRAIN_INTERVAL_MS;
}

export type PriorityRetrainTopicResult = {
  topicId: string;
  topicName: string;
  skipped: boolean;
  reason?: string;
  sampleCount?: number;
  trainedAt?: string;
  error?: string;
};

/**
 * Retrain each topic's priority model when due (≥ 48h since trainedAt),
 * or immediately when force=true (manual / npm script).
 */
export async function runScheduledPriorityRetrain(
  supabase: SupabaseClient,
  options?: { force?: boolean }
): Promise<{
  force: boolean;
  intervalHours: number;
  results: PriorityRetrainTopicResult[];
}> {
  const force = Boolean(options?.force);
  const { data: topics, error } = await supabase
    .from("topics")
    .select("id, name, query_string, ranking_weights");
  if (error) throw new Error(error.message);

  const results: PriorityRetrainTopicResult[] = [];

  for (const topic of topics ?? []) {
    const topicId = String(topic.id);
    const topicName = String(topic.name ?? topicId);
    try {
      const existing = await loadPriorityModel(supabase, topicId);
      if (!force && !isPriorityRetrainDue(existing)) {
        results.push({
          topicId,
          topicName,
          skipped: true,
          reason: "within_48h",
          sampleCount: existing?.sampleCount,
          trainedAt: existing?.trainedAt,
        });
        continue;
      }

      const settings = mergeFeedSettings(
        topic.ranking_weights as Record<string, unknown> | null
      );
      const model = await relearnPriorityModel(
        topicId,
        supabase,
        String(topic.query_string ?? "").trim(),
        toRankingWeights(settings)
      );

      if (!model) {
        results.push({
          topicId,
          topicName,
          skipped: false,
          reason: "not_enough_ratings",
        });
        continue;
      }

      results.push({
        topicId,
        topicName,
        skipped: false,
        sampleCount: model.sampleCount,
        trainedAt: model.trainedAt,
      });
    } catch (err) {
      results.push({
        topicId,
        topicName,
        skipped: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    force,
    intervalHours: PRIORITY_RETRAIN_INTERVAL_MS / (60 * 60 * 1000),
    results,
  };
}
