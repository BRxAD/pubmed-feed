import { summarizeAbstract } from "@/lib/summarize";
import { generateBriefHeadline } from "@/lib/brief/generateHeadline";
import { classifyStudyAbstract } from "@/lib/classifyStudy";
import type { PubMedRecord } from "@/lib/pubmed/efetch";
import { mergeLearnedWeights, mergeStoredFeedSettings } from "@/lib/relevanceLearning";
import { toPenaltyWeights } from "@/lib/brief/feedSettings";
import { computeStoredRankScore } from "@/lib/rankScore";
import { scoreFirstMlPriorities } from "@/lib/brief/firstRating";
import { classifyArticleSettings } from "@/lib/classifySetting";
import { classifyArticleTopics } from "@/lib/classifyTopic";
import { classifyArticleWhoRegions } from "@/lib/classifyWhoRegion";

const SUMMARIZE_CONCURRENCY = 5;

type SupabaseClient = {
  from: (table: string) => any;
};

export type SummarizeBatchResult = {
  storedSummaries: number;
  summarizeAttempted: number;
  summarizeFailed: number;
  mlPriorityGe5Count: number;
  summarizeErrors: string[];
};

/** Look up which PMIDs already have a summary for this topic (chunked .in()). */
export async function fetchAlreadySummarizedPmids(
  supabase: SupabaseClient,
  topicId: string,
  pmids: string[]
): Promise<Set<string>> {
  const already = new Set<string>();
  const CHUNK = 200;
  for (let i = 0; i < pmids.length; i += CHUNK) {
    const chunk = pmids.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("summaries")
      .select("pmid")
      .eq("topic_id", topicId)
      .in("pmid", chunk);
    if (error) {
      console.warn("[ingest] existing summaries lookup failed:", error.message);
      continue;
    }
    for (const row of data ?? []) {
      if (row?.pmid) already.add(String(row.pmid));
    }
  }
  return already;
}

/**
 * Write summaries + first ML rating for records that do not already have one.
 * Shared by PubMed and OpenAlex ingest so the daily cap is one pool.
 */
export async function summarizeNewRecords(options: {
  supabase: SupabaseClient;
  topicId: string;
  queryString: string;
  rankingWeights: Record<string, unknown> | null | undefined;
  records: PubMedRecord[];
  maxSummaries: number;
  alreadySummarized?: Set<string>;
}): Promise<SummarizeBatchResult> {
  const {
    supabase,
    topicId,
    queryString,
    rankingWeights,
    records,
    maxSummaries,
  } = options;

  const result: SummarizeBatchResult = {
    storedSummaries: 0,
    summarizeAttempted: 0,
    summarizeFailed: 0,
    mlPriorityGe5Count: 0,
    summarizeErrors: [],
  };

  if (maxSummaries <= 0) return result;

  const learnedWeights = mergeLearnedWeights(rankingWeights);
  const feedSettings = mergeStoredFeedSettings(rankingWeights);
  const scoringOptions = {
    ...toPenaltyWeights(feedSettings),
    smallSampleMax: feedSettings.brief.smallSampleMax,
    largeStudyThreshold: feedSettings.brief.largeStudyThreshold,
  };

  const withAbstract = records.filter((r) => Boolean(r.abstract?.trim()));
  const candidatePmids = withAbstract.map((r) => r.pmid);
  const alreadySummarized =
    options.alreadySummarized ??
    (await fetchAlreadySummarizedPmids(supabase, topicId, candidatePmids));

  const toSummarize = withAbstract
    .filter((r) => !alreadySummarized.has(r.pmid))
    .slice(0, maxSummaries);

  result.summarizeAttempted = toSummarize.length;
  console.log(
    "[ingest] Summarizing",
    toSummarize.length,
    "new records",
    `(skipping ${alreadySummarized.size} already done; ${withAbstract.length} with abstract)`
  );

  for (let i = 0; i < toSummarize.length; i += SUMMARIZE_CONCURRENCY) {
    const batch = toSummarize.slice(i, i + SUMMARIZE_CONCURRENCY);

    const mlScores = await scoreFirstMlPriorities(
      supabase as never,
      topicId,
      batch.map((r) => ({
        rec: r,
        queryString,
        weights: learnedWeights,
      }))
    );

    const batchResults = await Promise.allSettled(
      batch.map(async (r, batchIdx) => {
        const { summaryText } = await summarizeAbstract(r.abstract!, {
          title: r.title ?? undefined,
          publicationTypes: r.publicationTypes,
        });
        let headline: string | null = null;
        try {
          headline = await generateBriefHeadline({
            title: r.title!,
            abstract: r.abstract!,
            publicationTypes: r.publicationTypes,
          });
        } catch (headlineErr) {
          console.warn(
            `[ingest] headline ${r.pmid}:`,
            headlineErr instanceof Error ? headlineErr.message : headlineErr
          );
        }
        const classification = await classifyStudyAbstract({
          title: r.title,
          abstract: r.abstract,
          publicationTypes: r.publicationTypes,
        });

        const rank_score = computeStoredRankScore({
          queryString,
          rec: r,
          weights: learnedWeights,
          scoringOptions,
        });

        const row: Record<string, unknown> = {
          topic_id: topicId,
          pmid: r.pmid,
          summary_text: summaryText,
          subheading: classification.study_subheading,
          label: classification.study_label,
          rank_score,
          auto_settings: classifyArticleSettings({
            title: r.title,
            abstract: r.abstract,
            keywords: r.keywords,
            meshTerms: r.meshTerms,
          }),
          auto_topics: classifyArticleTopics({
            title: r.title,
            abstract: r.abstract,
            keywords: r.keywords,
            meshTerms: r.meshTerms,
          }),
          auto_who_regions: classifyArticleWhoRegions({
            title: r.title,
            abstract: r.abstract,
            keywords: r.keywords,
            meshTerms: r.meshTerms,
            affiliations: r.affiliations,
          }),
        };
        if (headline) row.headline = headline;
        const ml = mlScores[batchIdx];
        if (ml != null) {
          row.ml_priority = ml;
          if (ml >= 5) result.mlPriorityGe5Count += 1;
        }

        const { error: sumErr } = await supabase.from("summaries").upsert(row, {
          onConflict: "topic_id,pmid",
        });

        if (sumErr) {
          const missingMl = /ml_priority/i.test(sumErr.message);
          const missingAuto = /auto_settings/i.test(sumErr.message);
          const missingTopics = /auto_topics/i.test(sumErr.message);
          const missingWho = /auto_who_regions/i.test(sumErr.message);
          if (missingMl || missingAuto || missingTopics || missingWho) {
            if (missingMl) delete row.ml_priority;
            if (missingAuto) delete row.auto_settings;
            if (missingTopics) delete row.auto_topics;
            if (missingWho) delete row.auto_who_regions;
            const retry = await supabase.from("summaries").upsert(row, {
              onConflict: "topic_id,pmid",
            });
            if (retry.error) {
              throw new Error(`upsert failed: ${retry.error.message}`);
            }
            return r.pmid;
          }
          throw new Error(`upsert failed: ${sumErr.message}`);
        }
        return r.pmid;
      })
    );

    for (const res of batchResults) {
      if (res.status === "fulfilled") {
        result.storedSummaries++;
      } else {
        result.summarizeFailed++;
        const reason =
          res.reason instanceof Error ? res.reason.message : String(res.reason);
        console.warn("[ingest] Summary batch error:", reason);
        if (result.summarizeErrors.length < 5) {
          result.summarizeErrors.push(reason);
        }
      }
    }

    console.log(
      `[ingest] Summaries: batch ${Math.floor(i / SUMMARIZE_CONCURRENCY) + 1} done`,
      `(${result.storedSummaries} / ${toSummarize.length} so far)`
    );
  }

  return result;
}
