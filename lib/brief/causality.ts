/**
 * Causal verbs are allowed only for RCTs, or systematic reviews clearly
 * limited to RCT evidence. Observational / ITS / pre-post stay associative.
 */

export const STRONG_CAUSAL_RE =
  /\b(led to|resulted in|caused|drove|triggered|spurred|yielded)\b/i;

export const INTERVENTION_CAUSAL_RE =
  /\b(cut|boosted|lowered|reduced|increased|improved|slashed|dropped|raised|curbed)\b/i;

const RCT_RE =
  /\b(randomized|randomised|randomized controlled|randomised controlled|placebo[- ]controlled|cluster[- ]randomized|cluster[- ]randomised|double[- ]blind|rcts?\b)\b/i;

const SYSTEMATIC_RE =
  /\b(systematic review|meta[- ]analysis|metaanalysis)\b/i;

const OBSERVATIONAL_MIX_RE =
  /\b(observational|cohort|case[- ]control|cross[- ]sectional|quasi[- ]experimental|interrupted time series|pre[- ]post|before[- ]and[- ]after|retrospective)\b/i;

/** Title + abstract + publication types, concatenated. */
export function allowsCausalLanguage(text: string): boolean {
  const blob = text.trim();
  if (!blob) return false;
  if (SYSTEMATIC_RE.test(blob)) {
    if (OBSERVATIONAL_MIX_RE.test(blob)) return false;
    return RCT_RE.test(blob);
  }
  return RCT_RE.test(blob);
}

export function hasDisallowedCausalLanguage(
  text: string,
  designText: string
): boolean {
  if (allowsCausalLanguage(designText)) return false;
  return STRONG_CAUSAL_RE.test(text) || INTERVENTION_CAUSAL_RE.test(text);
}

/** RESULTS and BOTTOM LINE only — METHODS may describe an intervention's aim. */
export function summaryFindingsText(summaryText: string): string {
  const chunks: string[] = [];
  for (const line of summaryText.split("\n")) {
    if (/^\[(RESULTS|BOTTOM LINE)\]/i.test(line.trim())) {
      chunks.push(line);
    }
  }
  return chunks.join("\n");
}

export function hasDisallowedCausalSummary(
  summaryText: string,
  designText: string
): boolean {
  return hasDisallowedCausalLanguage(
    summaryFindingsText(summaryText),
    designText
  );
}
