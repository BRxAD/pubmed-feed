/**
 * Deterministic setting classification for antimicrobial stewardship articles.
 * Uses weighted term/phrase matching against title, abstract, and keywords/MeSH.
 * Returns null when evidence is insufficient for 90%+ confidence.
 *
 * NO OpenAI call — this is fast, free, and reproducible.
 */

export type ArticleSetting =
  | "hospital"
  | "community"
  | "long-term care"
  | "animal"
  | "environment";

// ── Term lists ────────────────────────────────────────────────────────────────

const HOSPITAL_PHRASES = [
  "intensive care unit",
  "icu",
  "hospital-acquired",
  "healthcare-acquired",
  "healthcare associated",
  "hospital acquired",
  "nosocomial",
  "tertiary care",
  "acute care",
  "secondary care",
  "emergency department",
  "emergency room",
  "critical care",
  "inpatient",
  "hospitalized",
  "hospitalization",
  "hospital ward",
  "medical ward",
  "surgical ward",
  "operating room",
  "academic medical center",
  "teaching hospital",
  "acute hospital",
  "inpatient setting",
];

// Single words that are strong hospital signals when in keywords/MeSH
const HOSPITAL_WORDS = [
  "hospital",
  "hospitals",
  "inpatients",
  "ward",
  "wards",
  "admitted",
  "admission",
  "admissions",
];

const COMMUNITY_PHRASES = [
  "primary care",
  "outpatient",
  "community-acquired",
  "community acquired",
  "community-onset",
  "community onset",
  "general practice",
  "general practitioner",
  "ambulatory care",
  "community pharmacy",
  "retail pharmacy",
  "family practice",
  "outpatient clinic",
  "outpatient setting",
  "primary health care",
  "walk-in clinic",
  "urgent care",
  "community setting",
];

const COMMUNITY_WORDS = [
  "community",
  "outpatient",
  "ambulatory",
];

const LTC_PHRASES = [
  "long-term care",
  "long term care",
  "nursing home",
  "care home",
  "residential care",
  "skilled nursing facility",
  "skilled nursing",
  "assisted living",
  "aged care",
  "geriatric care",
  "geriatric facility",
  "long-term care facility",
  "nursing facility",
  "residential facility",
  "post-acute care",
  "post acute care",
  "extended care",
];

const LTC_WORDS = [
  "ltc",
  "snf",
];

// ── Animal / veterinary ───────────────────────────────────────────────────────

const ANIMAL_PHRASES = [
  "veterinary",
  "food animal",
  "companion animal",
  "livestock",
  "food-producing animal",
  "animal husbandry",
  "animal health",
  "animal model",
  "one health",
  "zoonotic",
  "zoonosis",
  "agricultural",
  "poultry farm",
  "swine farm",
  "dairy farm",
  "pet owner",
  "small animal",
  "large animal",
];

const ANIMAL_WORDS = [
  "veterinary",
  "livestock",
  "poultry",
  "swine",
  "bovine",
  "equine",
  "ovine",
  "porcine",
  "feline",
  "canine",
  "cattle",
  "chicken",
  "pig",
  "dog",
  "cat",
  "horse",
  "agriculture",
  "farm",
  "zoonotic",
  "zoonosis",
];

// ── Environment ───────────────────────────────────────────────────────────────

const ENVIRONMENT_PHRASES = [
  "environmental surveillance",
  "wastewater surveillance",
  "wastewater-based",
  "surface water",
  "groundwater",
  "drinking water",
  "water treatment",
  "sewage",
  "soil contamination",
  "environmental contamination",
  "environmental reservoir",
  "environmental sampling",
  "river water",
  "effluent",
  "antibiotic resistance genes",
  "resistome",
  "metagenomics",
  "whole genome sequencing",
];

const ENVIRONMENT_WORDS = [
  "wastewater",
  "effluent",
  "sediment",
  "resistome",
  "metagenomics",
  "environment",
  "environmental",
];

// ── Scoring helpers ───────────────────────────────────────────────────────────

/**
 * Score free text (title + abstract) against a setting's phrase and word lists.
 * Phrases = 3 pts each; isolated words = 1 pt each.
 */
function scoreText(
  text: string,
  phrases: string[],
  words: string[]
): number {
  let score = 0;
  const lower = text.toLowerCase();

  for (const phrase of phrases) {
    if (lower.includes(phrase)) score += 3;
  }

  // Word-boundary matching to avoid partial hits (e.g. "community" inside "immunocompromised")
  const wordTokens = new Set(lower.split(/\W+/).filter(Boolean));
  for (const word of words) {
    if (wordTokens.has(word)) score += 1;
  }

  return score;
}

/**
 * Score keyword/MeSH terms — these are curated labels so they carry more weight.
 * Phrase match in a keyword = 4 pts; word match = 2 pts.
 */
function scoreKeywords(
  kws: string[],
  phrases: string[],
  words: string[]
): number {
  let score = 0;
  for (const kw of kws) {
    const lower = kw.toLowerCase();
    for (const phrase of phrases) {
      if (lower.includes(phrase)) score += 4;
    }
    const wordTokens = new Set(lower.split(/\W+/).filter(Boolean));
    for (const word of words) {
      if (wordTokens.has(word)) score += 2;
    }
  }
  return score;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Minimum raw score the top setting must reach before classification is attempted.
 * Prevents classifying articles that only have incidental mentions.
 */
const MIN_SCORE = 4;

/**
 * The top setting's score must be this many times the second-highest for the
 * classification to be considered ≥90% confident. A ratio of 3 means the
 * top setting needs 3× as much evidence as the next-best candidate.
 */
const CONFIDENCE_RATIO = 3.0;

export function classifyArticleSetting(params: {
  title?: string | null;
  abstract?: string | null;
  keywords?: string[] | null;
  meshTerms?: string[] | null;
}): ArticleSetting | null {
  const text = [params.title ?? "", params.abstract ?? ""].join(" ");
  const kws = [
    ...(params.keywords ?? []),
    ...(params.meshTerms ?? []),
  ];

  const scores: Record<ArticleSetting, number> = {
    hospital:
      scoreText(text, HOSPITAL_PHRASES, HOSPITAL_WORDS) +
      scoreKeywords(kws, HOSPITAL_PHRASES, HOSPITAL_WORDS),
    community:
      scoreText(text, COMMUNITY_PHRASES, COMMUNITY_WORDS) +
      scoreKeywords(kws, COMMUNITY_PHRASES, COMMUNITY_WORDS),
    "long-term care":
      scoreText(text, LTC_PHRASES, LTC_WORDS) +
      scoreKeywords(kws, LTC_PHRASES, LTC_WORDS),
    animal:
      scoreText(text, ANIMAL_PHRASES, ANIMAL_WORDS) +
      scoreKeywords(kws, ANIMAL_PHRASES, ANIMAL_WORDS),
    environment:
      scoreText(text, ENVIRONMENT_PHRASES, ENVIRONMENT_WORDS) +
      scoreKeywords(kws, ENVIRONMENT_PHRASES, ENVIRONMENT_WORDS),
  };

  const ranked = (
    Object.entries(scores) as [ArticleSetting, number][]
  ).sort((a, b) => b[1] - a[1]);

  const [top, second] = ranked;

  // Not enough evidence
  if (top[1] < MIN_SCORE) return null;

  // Ambiguous — two settings score similarly
  if (second[1] > 0 && top[1] / second[1] < CONFIDENCE_RATIO) return null;

  return top[0];
}
