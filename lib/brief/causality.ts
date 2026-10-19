/**
 * Causal verbs are allowed only for RCTs, or systematic reviews clearly
 * limited to RCT evidence. Observational / ITS / pre-post stay associative.
 */

export const STRONG_CAUSAL_RE =
  /\b(led to|resulted in|caused|drove|triggered|spurred|yielded)\b/i;

export const INTERVENTION_CAUSAL_RE =
  /\b(cut|boosted|lowered|reduced|increased|improved|slashed|dropped|raised|curbed)\b/i;

/**
 * Words that sit in front of a noun phrase ("reduced doses", "increased rates").
 * Those are modifiers, not claims that an exposure reduced or increased something.
 */
const MODIFIER_PREVIOUS = new Set([
  "a",
  "an",
  "the",
  "this",
  "that",
  "these",
  "those",
  "with",
  "of",
  "in",
  "for",
  "at",
  "to",
  "from",
  "on",
  "per",
  "via",
  "after",
  "before",
  "among",
  "between",
  "without",
  "within",
  "into",
  "over",
  "under",
  "their",
  "its",
  "his",
  "her",
  "our",
  "and",
  "or",
  "but",
  "nor",
  "more",
  "less",
  "most",
  "least",
  "very",
  "newly",
  "previously",
  "higher",
  "lower",
  "greater",
  "fewer",
]);

const AUXILIARY = new Set([
  "am",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "has",
  "have",
  "had",
  "will",
  "would",
  "shall",
  "should",
  "can",
  "could",
  "may",
  "might",
  "did",
  "does",
  "do",
]);

const MANNER_ADVERB = new Set([
  "significantly",
  "substantially",
  "markedly",
  "sharply",
  "greatly",
  "dramatically",
  "slightly",
  "modestly",
  "notably",
]);

function wordToken(raw: string | undefined): string {
  return (raw ?? "").toLowerCase().replace(/[^a-z'-]/g, "");
}

/**
 * True when cut/reduced/increased and the same family are used as verbs
 * ("use reduced rates", "rates were reduced", "reduced by 10%").
 * False for modifiers ("reduced doses", "increased C. difficile rates").
 */
export function hasInterventionCausalVerb(text: string): boolean {
  const source = text ?? "";
  const re = new RegExp(INTERVENTION_CAUSAL_RE.source, "gi");
  for (const match of source.matchAll(re)) {
    const word = match[0];
    const index = match.index ?? 0;
    const after = source.slice(index + word.length);
    if (after.startsWith("-")) continue;

    const before = source.slice(0, index).trim().split(/\s+/);
    const prev = wordToken(before.at(-1));
    const prev2 = wordToken(before.at(-2));
    const next = wordToken(after.trim().split(/\s+/)[0]);

    if (AUXILIARY.has(prev)) return true;
    if (next === "by") return true;
    if (MANNER_ADVERB.has(prev)) {
      if (!MODIFIER_PREVIOUS.has(prev2)) return true;
      continue;
    }
    if (!prev || MODIFIER_PREVIOUS.has(prev)) continue;
    return true;
  }
  return false;
}

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
  return STRONG_CAUSAL_RE.test(text) || hasInterventionCausalVerb(text);
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
