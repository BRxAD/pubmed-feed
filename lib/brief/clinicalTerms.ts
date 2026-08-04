import "server-only";

/**
 * Term dictionaries for the clinical rubric.
 *
 * v1 reproduces the original inline regexes exactly. v2 is the expanded
 * editorial vocabulary. Both are kept so the two can be scored against the same
 * human ratings before either becomes the default.
 */
export type ClinicalTermSetVersion = "v1" | "v2";

/**
 * Build `\bterm\b` allowing hyphen/space variation inside multi-word terms, so
 * "multi-center", "multi center" and "multicenter" all match one entry.
 */
function phraseRegex(terms: string[], flags = "i"): RegExp {
  const alternation = terms
    .map((term) =>
      term
        .trim()
        .split(/[-\s]+/)
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("[-\\s]*")
    )
    .join("|");
  return new RegExp(`\\b(?:${alternation})\\b`, flags);
}

export type ClinicalMatcher = {
  /** Matched against lowercased title + abstract. */
  text?: RegExp;
  /** Matched against original-case title + abstract (for acronyms). */
  raw?: RegExp;
  /** Substring hints matched against normalized publication types. */
  pubTypes?: string[];
};

export type ClinicalTermSet = {
  version: ClinicalTermSetVersion;
  rct: ClinicalMatcher;
  systematicReview: ClinicalMatcher;
  multicenter: ClinicalMatcher;
  /** Stewardship is composite: a strong phrase, or a weak word plus context. */
  stewardshipContext: RegExp;
  stewardshipExtra?: ClinicalMatcher;
  novelty: ClinicalMatcher;
  cohort: ClinicalMatcher;
  intervention: ClinicalMatcher;
  guideline: ClinicalMatcher;
  /** Non-human only counts when no human/clinical signal is present. */
  nonHuman: ClinicalMatcher;
  humanGuard: RegExp;
  /** MeSH/keyword text signal for non-human. */
  nonHumanMesh: RegExp;
};

// ── v1: current production behaviour ─────────────────────────────────────────

export const CLINICAL_TERMS_V1: ClinicalTermSet = {
  version: "v1",
  rct: {
    text: /\brandomi[sz]ed\b|\brct\b/i,
    pubTypes: ["randomized", "randomised", "controlled trial"],
  },
  systematicReview: {
    text: /systematic review|meta-analysis|meta analysis/i,
    pubTypes: ["systematic review", "meta-analysis", "meta analysis"],
  },
  multicenter: {
    text: /\bmulti[-\s]?cent(?:er|re)\b|\bmultiple\s+(?:hospitals?|sites?|centers?|centres?)\b/i,
    pubTypes: ["multicenter", "multicentre"],
  },
  stewardshipContext:
    /\b(patient|clinical|hospital|prescrib|stewardship|antibiotic use)\b|\bhuman\b/i,
  novelty: {
    text: /\b(novel|first (?:report|description|study)|newly described|unprecedented)\b/i,
  },
  cohort: {
    text: /\bcohort\b/i,
    pubTypes: ["cohort"],
  },
  intervention: {
    text: /\b(intervention|implemented|implementation|stewardship program|bundle|protocol)\b/i,
  },
  guideline: {
    text: /\b(guideline|consensus statement|practice recommendation)\b/i,
    pubTypes: ["guideline", "practice guideline"],
  },
  nonHuman: {
    text: /\b(veterinary|livestock|poultry|swine|canine|feline|animal model)\b/i,
  },
  humanGuard: /\b(human|patient|patients|clinical)\b/i,
  nonHumanMesh: /\banimals\b/i,
};

// ── v2: expanded editorial vocabulary ────────────────────────────────────────
//
// Deviations from the supplied lists, all to avoid known collisions in a
// microbiology corpus:
//   - bare "PAF" dropped (platelet-activating factor); the spelled-out
//     "prospective audit and feedback" and "audit and feedback" cover it.
//   - bare "ITS" dropped (internal transcribed spacer, and the word "its");
//     "interrupted time series" covers it.
//   - bare "first" bounded to first + report/description/study/etc, otherwise
//     it fires on "first-line therapy", "the first 48 hours", and similar.
//   - "ASP"/"QI"/"SRMA" matched case-sensitively against raw text ("Asp" is
//     aspartic acid).

const V2_RCT_TERMS = [
  "randomized controlled trial",
  "randomised controlled trial",
  "cluster randomized trial",
  "cluster randomised trial",
  "cluster randomized",
  "cluster randomised",
  "pragmatic trial",
  "stepped wedge trial",
  "stepped wedge",
  "controlled trial",
  "prospective randomized",
  "prospective randomised",
  "randomized",
  "randomised",
];

const V2_SR_TERMS = [
  "systematic review",
  "systematic literature review",
  "meta analysis",
  "network meta analysis",
  "evidence synthesis",
  "cochrane review",
  "scoping review",
];

/**
 * The geographic-scope entries (national, regional, provincial, state-wide)
 * take this flag from 5.9% to 25.4% of the corpus and drop its mean rating
 * from 4.33 to 3.97, which looks like dilution. Removing them was tested and
 * scored worse — Spearman -0.005 (SE 0.002) over 50 paired folds — so the
 * breadth is carrying real signal and they stay. See scripts/priority-eval.
 */
const V2_MULTICENTER_TERMS = [
  "multicenter",
  "multi center",
  "multicentre",
  "multi centre",
  "multiple hospitals",
  "multiple centers",
  "multiple centres",
  "multiple sites",
  "across hospitals",
  "across facilities",
  "healthcare network",
  "health system wide",
  "national collaborative",
  "national",
  "nationwide",
  "regional",
  "provincial",
  "state level",
  "state wide",
  "statewide",
  "consortium",
  "cluster of hospitals",
];

const MULTICENTER_COUNT_PATTERN =
  "\\b\\d+\\s+(?:hospitals?|centers?|centres?|sites?|facilities|institutions?|countries)\\b";

const V2_ASP_TERMS = [
  "antimicrobial stewardship",
  "antibiotic stewardship",
  "stewardship intervention",
  "stewardship program",
  "stewardship programme",
  "prospective audit and feedback",
  "audit and feedback",
  "formulary restriction",
  "prior authorization",
  "prior authorisation",
  "peer comparison",
  "antibiotic review",
  "antimicrobial review",
  "de escalation",
  "deescalation",
  "iv to po",
  "iv to oral",
  "intravenous to oral",
  "guideline implementation",
  "prescribing optimization",
  "prescribing optimisation",
  "clinical decision support",
];

const V2_NOVELTY_TERMS = [
  "novel",
  "innovative",
  "feasibility study",
  "proof of concept",
  "implementation study",
  "implementation science",
  "emerging",
  "artificial intelligence",
  "machine learning",
  "deep learning",
  "generative ai",
  "large language model",
  "clinical decision support tool",
  "digital intervention",
  "electronic",
];

const V2_NOVELTY_FIRST =
  /\bfirst(?:[-\s]*(?:report|reported|description|described|study|case|cases|series|demonstration|evidence|application|use|trial|time|in[-\s]*human|in[-\s]*class))\b/i;

const V2_COHORT_TERMS = [
  "cohort",
  "retrospective cohort",
  "prospective cohort",
  "observational cohort",
  "population based cohort",
  "longitudinal cohort",
  "registry based cohort",
  "matched cohort",
  "multicohort",
  "administrative data",
];

const V2_INTERVENTION_TERMS = [
  "intervention",
  "implementation",
  "implemented",
  "program evaluation",
  "quality improvement",
  "qi project",
  "qi initiative",
  "before after",
  "quasi experimental",
  "interrupted time series",
  "intervention study",
  "educational intervention",
  "stewardship intervention",
  "bundle",
  "protocol",
];

const V2_GUIDELINE_TERMS = [
  "guideline",
  "guidelines",
  "clinical practice guideline",
  "guidance",
  "recommendations",
  "consensus statement",
  "consensus guideline",
  "expert panel",
  "delphi",
  "position statement",
  "policy statement",
  "best practice recommendations",
  "evidence based recommendations",
];

const V2_NONHUMAN_TERMS = [
  "murine",
  "mouse",
  "mice",
  "rat",
  "rats",
  "animal model",
  "animal",
  "animals",
  "porcine",
  "canine",
  "feline",
  "bovine",
  "equine",
  "veterinary",
  "livestock",
  "poultry",
  "swine",
  "cattle",
  "in vitro",
  "laboratory study",
  "bench study",
  "cell line",
  "cell lines",
  "microbiological experiment",
  "ex vivo",
  "animal experiment",
  "preclinical",
];

export const CLINICAL_TERMS_V2: ClinicalTermSet = {
  version: "v2",
  rct: {
    text: phraseRegex(V2_RCT_TERMS),
    raw: /\bRCT(?:s)?\b/,
    pubTypes: [
      "randomized",
      "randomised",
      "controlled trial",
      "pragmatic",
      "clinical trial",
    ],
  },
  systematicReview: {
    text: phraseRegex(V2_SR_TERMS),
    raw: /\bSRMA\b/,
    pubTypes: ["systematic review", "meta-analysis", "meta analysis"],
  },
  multicenter: {
    text: new RegExp(
      `${phraseRegex(V2_MULTICENTER_TERMS).source}|${MULTICENTER_COUNT_PATTERN}`,
      "i"
    ),
    pubTypes: ["multicenter", "multicentre"],
  },
  stewardshipContext:
    /\b(patient|clinical|hospital|prescrib|stewardship|antibiotic use)\b|\bhuman\b/i,
  stewardshipExtra: {
    text: phraseRegex(V2_ASP_TERMS),
    raw: /\bASPs?\b/,
  },
  novelty: {
    text: new RegExp(
      `${phraseRegex(V2_NOVELTY_TERMS).source}|${V2_NOVELTY_FIRST.source}`,
      "i"
    ),
  },
  cohort: {
    text: phraseRegex(V2_COHORT_TERMS),
    pubTypes: ["cohort", "observational"],
  },
  intervention: {
    text: phraseRegex(V2_INTERVENTION_TERMS),
    raw: /\bQI\b/,
  },
  guideline: {
    text: phraseRegex(V2_GUIDELINE_TERMS),
    pubTypes: ["guideline", "practice guideline", "consensus"],
  },
  nonHuman: {
    text: phraseRegex(V2_NONHUMAN_TERMS),
  },
  humanGuard: /\b(human|patient|patients|clinical)\b/i,
  nonHumanMesh: /\banimals\b/i,
};

export const CLINICAL_TERM_SETS: Record<
  ClinicalTermSetVersion,
  ClinicalTermSet
> = {
  v1: CLINICAL_TERMS_V1,
  v2: CLINICAL_TERMS_V2,
};

/**
 * v2 beat v1 by +0.017 Spearman (SE 0.004) against 869 human ratings, winning
 * 74% of 50 paired cross-validation folds. v1 is kept so the comparison can be
 * re-run when the vocabulary changes again.
 */
export const DEFAULT_CLINICAL_TERM_SET: ClinicalTermSetVersion = "v2";

export function matchesClinical(
  matcher: ClinicalMatcher | undefined,
  ctx: { lowerText: string; rawText: string; pubTypes: string[] }
): boolean {
  if (!matcher) return false;
  if (matcher.text?.test(ctx.lowerText)) return true;
  if (matcher.raw?.test(ctx.rawText)) return true;
  if (
    matcher.pubTypes?.length &&
    ctx.pubTypes.some((p) => matcher.pubTypes!.some((h) => p.includes(h)))
  ) {
    return true;
  }
  return false;
}
