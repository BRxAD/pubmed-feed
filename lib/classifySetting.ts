/**
 * Deterministic multi-label setting classification for stewardship articles.
 * Uses weighted term/phrase matching against title, abstract, and keywords/MeSH.
 *
 * An article may receive 2+ settings when evidence supports each (e.g. ED →
 * hospital + community). Returns [] when no label clears the score floor.
 *
 * NO OpenAI call — fast, free, and reproducible.
 */

export type ArticleSetting =
  | "hospital"
  | "community"
  | "long-term care"
  | "dentistry"
  | "one-health"
  | "global-health"
  | "animal"
  | "environment";

/** Stable display order for UI / dashboards. */
export const ARTICLE_SETTING_ORDER: ArticleSetting[] = [
  "hospital",
  "community",
  "long-term care",
  "dentistry",
  "one-health",
  "global-health",
  "animal",
  "environment",
];

export const ARTICLE_SETTING_LABELS: Record<ArticleSetting, string> = {
  hospital: "Hospital / Inpatient",
  community: "Outpatient / Community",
  "long-term care": "Long-term care",
  dentistry: "Dentistry",
  "one-health": "One Health",
  "global-health": "Global Health",
  animal: "Animal / Veterinary",
  environment: "Environment",
};

// ── Shared: emergency department → hospital AND community ─────────────────────

const ED_PHRASES = [
  "emergency department",
  "emergency departments",
  "emergency room",
  "emergency rooms",
  "ed visit",
  "ed visits",
  "emergency dept",
  "accident and emergency",
  "a&e",
  "emergency medicine",
  "emergency care",
];

const ED_WORDS = ["ed"];

// ── Hospital / inpatient ──────────────────────────────────────────────────────

const HOSPITAL_PHRASES = [
  "intensive care unit",
  "icu",
  "hospital-acquired",
  "healthcare-acquired",
  "healthcare associated",
  "healthcare-associated",
  "hospital acquired",
  "nosocomial",
  "tertiary care",
  "acute care",
  "secondary care",
  "critical care",
  "inpatient",
  "hospitalized",
  "hospitalisation",
  "hospitalization",
  "hospital ward",
  "medical ward",
  "surgical ward",
  "operating room",
  "operating theatre",
  "academic medical center",
  "academic medical centre",
  "teaching hospital",
  "acute hospital",
  "inpatient setting",
  "inpatient care",
  "hospitalist",
  "ward round",
  "length of stay",
];

const HOSPITAL_WORDS = [
  "hospital",
  "hospitals",
  "inpatients",
  "inpatient",
  "ward",
  "wards",
  "admitted",
  "admission",
  "admissions",
  "icu",
  "nosocomial",
];

// ── Outpatient / community (ED scored separately into both) ───────────────────

const COMMUNITY_PHRASES = [
  "primary care",
  "outpatient",
  "outpatients",
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
  "family medicine",
  "outpatient clinic",
  "outpatient setting",
  "primary health care",
  "primary healthcare",
  "walk-in clinic",
  "urgent care",
  "community setting",
  "community-based",
  "community based",
  "office-based",
  "clinic-based",
  "ambulatory setting",
];

const COMMUNITY_WORDS = [
  "community",
  "outpatient",
  "outpatients",
  "ambulatory",
  "gp",
];

// ── Long-term care ────────────────────────────────────────────────────────────

const LTC_PHRASES = [
  "long-term care",
  "long term care",
  "nursing home",
  "nursing homes",
  "care home",
  "care homes",
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
  "nursing home resident",
  "ltc facility",
  "ltcf",
];

const LTC_WORDS = ["ltc", "snf", "ltcf"];

// ── Dentistry ─────────────────────────────────────────────────────────────────

const DENTISTRY_PHRASES = [
  "dental clinic",
  "dental practice",
  "dental office",
  "oral health",
  "oral hygiene",
  "periodontal",
  "periodontitis",
  "endodontic",
  "dental caries",
  "dental surgery",
  "dental antimicrobial",
  "antibiotic prescribing in dentistry",
  "dental stewardship",
  "odontogenic",
  "maxillofacial",
  "oral surgery",
];

const DENTISTRY_WORDS = [
  "dental",
  "dentist",
  "dentists",
  "dentistry",
  "periodontal",
  "endodontic",
  "odontogenic",
];

// ── One Health (human–animal–environment interface) ───────────────────────────

const ONE_HEALTH_PHRASES = [
  "one health",
  "one-health",
  "human-animal",
  "human animal interface",
  "animal-human",
  "zoonotic transmission",
  "zoonotic disease",
  "shared between humans and animals",
  "farm-to-fork",
  "farm to fork",
  "antimicrobial use in agriculture",
  "antibiotic use in livestock",
  "veterinary and human",
  "human and veterinary",
];

const ONE_HEALTH_WORDS = ["zoonosis", "zoonotic", "zoonoses"];

// ── Global health / policy / LMIC systems ─────────────────────────────────────

const GLOBAL_HEALTH_PHRASES = [
  "global health",
  "global antimicrobial",
  "low- and middle-income",
  "low and middle income",
  "low-income countr",
  "middle-income countr",
  "lmic",
  "lmics",
  "national action plan",
  "national antimicrobial",
  "who african region",
  "world health organization",
  "world health organisation",
  "international surveillance",
  "global surveillance",
  "country-level",
  "nationwide surveillance",
  "low resource setting",
  "resource-limited",
  "developing countr",
  "global burden",
];

const GLOBAL_HEALTH_WORDS = ["lmic", "lmics"];

// ── Animal / veterinary (clinical vet / livestock without One Health framing) ─

const ANIMAL_PHRASES = [
  "veterinary",
  "food animal",
  "companion animal",
  "livestock",
  "food-producing animal",
  "animal husbandry",
  "animal health",
  "animal model",
  "poultry farm",
  "swine farm",
  "dairy farm",
  "pet owner",
  "small animal",
  "large animal",
  "veterinary clinic",
  "veterinary hospital",
  "veterinary practice",
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
  "environmental resistome",
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

  const wordTokens = new Set(lower.split(/\W+/).filter(Boolean));
  for (const word of words) {
    if (wordTokens.has(word)) score += 1;
  }

  return score;
}

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

function scoreSetting(
  text: string,
  kws: string[],
  phrases: string[],
  words: string[]
): number {
  return (
    scoreText(text, phrases, words) + scoreKeywords(kws, phrases, words)
  );
}

/**
 * Minimum raw score for a setting to be included in the multi-label result.
 * Lower than the old single-label gate so ED + dual settings can surface.
 */
const MIN_SCORE = 2;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Score all settings (for soft matching / debugging).
 * ED evidence is added to both hospital and community.
 */
export function scoreAllSettings(params: {
  title?: string | null;
  abstract?: string | null;
  keywords?: string[] | null;
  meshTerms?: string[] | null;
}): Record<ArticleSetting, number> {
  const text = [params.title ?? "", params.abstract ?? ""].join(" ");
  const kws = [
    ...(params.keywords ?? []),
    ...(params.meshTerms ?? []),
  ];

  const ed =
    scoreSetting(text, kws, ED_PHRASES, ED_WORDS);

  return {
    hospital:
      scoreSetting(text, kws, HOSPITAL_PHRASES, HOSPITAL_WORDS) + ed,
    community:
      scoreSetting(text, kws, COMMUNITY_PHRASES, COMMUNITY_WORDS) + ed,
    "long-term care": scoreSetting(text, kws, LTC_PHRASES, LTC_WORDS),
    dentistry: scoreSetting(text, kws, DENTISTRY_PHRASES, DENTISTRY_WORDS),
    "one-health": scoreSetting(
      text,
      kws,
      ONE_HEALTH_PHRASES,
      ONE_HEALTH_WORDS
    ),
    "global-health": scoreSetting(
      text,
      kws,
      GLOBAL_HEALTH_PHRASES,
      GLOBAL_HEALTH_WORDS
    ),
    animal: scoreSetting(text, kws, ANIMAL_PHRASES, ANIMAL_WORDS),
    environment: scoreSetting(
      text,
      kws,
      ENVIRONMENT_PHRASES,
      ENVIRONMENT_WORDS
    ),
  };
}

/**
 * Multi-label classification: every setting at or above MIN_SCORE.
 * Ordered by score (desc), then ARTICLE_SETTING_ORDER.
 */
export function classifyArticleSettings(params: {
  title?: string | null;
  abstract?: string | null;
  keywords?: string[] | null;
  meshTerms?: string[] | null;
}): ArticleSetting[] {
  const scores = scoreAllSettings(params);

  return (Object.entries(scores) as [ArticleSetting, number][])
    .filter(([, score]) => score >= MIN_SCORE)
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return (
        ARTICLE_SETTING_ORDER.indexOf(a[0]) -
        ARTICLE_SETTING_ORDER.indexOf(b[0])
      );
    })
    .map(([setting]) => setting);
}

/**
 * Primary setting (highest score at/above floor), or null.
 * Prefer classifyArticleSettings when multi-label is needed.
 */
export function classifyArticleSetting(params: {
  title?: string | null;
  abstract?: string | null;
  keywords?: string[] | null;
  meshTerms?: string[] | null;
}): ArticleSetting | null {
  return classifyArticleSettings(params)[0] ?? null;
}
