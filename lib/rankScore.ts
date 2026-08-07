import "server-only";
import {
  computeBreakdown,
  type RankingWeights,
  type ScoringOptions,
} from "@/lib/ranking";
import { isHighImpactJournal } from "@/lib/jif";
import { isQ1Journal } from "@/lib/scimago";
import type { PubMedRecord } from "@/lib/pubmed/efetch";

/** Persistable relevance score written on ingest / backfill (no admin boost). */
export function computeStoredRankScore(options: {
  queryString: string;
  rec: PubMedRecord;
  weights: RankingWeights;
  scoringOptions?: ScoringOptions;
}): number {
  const jifIsHigh =
    isQ1Journal(options.rec.journal) ||
    isHighImpactJournal(options.rec.journal);
  const breakdown = computeBreakdown(
    options.queryString,
    options.rec,
    options.weights,
    true,
    jifIsHigh,
    options.scoringOptions
  );
  return breakdown.finalScore;
}
