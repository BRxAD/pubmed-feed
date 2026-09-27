import "server-only";
import type { PubMedRecord } from "@/lib/pubmed/efetch";
import { isHighImpactJournal } from "@/lib/jif";
import { isQ1Journal } from "@/lib/scimago";
import {
  isMultiCenterOrMajorScopeStudy,
  isSingleCenterSmallSampleStudy,
} from "@/lib/relevancePenalties";

/** Q1 or JIF at/above the JCR median. Missing JIF counts as low impact. */
export function isHighImpactVenue(
  journal: string | null | undefined
): boolean {
  return isQ1Journal(journal) || isHighImpactJournal(journal);
}

function isGuidelineOrPooledEvidence(rec: PubMedRecord): boolean {
  const blob = [
    rec.title ?? "",
    rec.abstract ?? "",
    ...(rec.publicationTypes ?? []),
  ].join(" ");
  return /\b(practice guideline|clinical guideline|consensus statement|consensus guideline|systematic review|meta-analysis|meta analysis)\b/i.test(
    blob
  );
}

function clampPriority(n: number): number {
  return Math.min(10, Math.max(1, Math.round(n)));
}

/**
 * Editorial overlay after the ridge model.
 * Small single-center papers in weaker journals should not make the Brief.
 * Multi-center (or national/international) work in high-impact venues gets a bump.
 * Guidelines and systematic reviews / meta-analyses skip the small-study cap.
 */
export function applyEditorialPriorityAdjust(
  rec: PubMedRecord,
  predicted: number
): number {
  const highIf = isHighImpactVenue(rec.journal);
  let n = predicted;

  if (
    isSingleCenterSmallSampleStudy(rec) &&
    !highIf &&
    !isGuidelineOrPooledEvidence(rec)
  ) {
    n = Math.min(n - 2, 4);
  } else if (isMultiCenterOrMajorScopeStudy(rec) && highIf) {
    n += 1;
  }

  return clampPriority(n);
}
