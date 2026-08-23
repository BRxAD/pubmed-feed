/**
 * Deterministic multi-label syndrome/topic classification for Brief capsules.
 * Matches title, abstract, author keywords, and MeSH — rules only, no LLM.
 *
 * Orthogonal to care-setting (hospital / community / …). An article may get
 * 0–N topics (e.g. Urinary + Respiratory).
 */

export type ArticleTopic =
  | "urinary"
  | "respiratory"
  | "skin-soft-tissue"
  | "artificial-intelligence";

export const ARTICLE_TOPIC_ORDER: ArticleTopic[] = [
  "urinary",
  "respiratory",
  "skin-soft-tissue",
  "artificial-intelligence",
];

export const ARTICLE_TOPIC_LABELS: Record<ArticleTopic, string> = {
  urinary: "Urinary",
  respiratory: "Respiratory",
  "skin-soft-tissue": "Skin & Soft Tissue",
  "artificial-intelligence": "Artificial Intelligence",
};

/** Capsule chip colors (Brief second row — distinct from setting underline tabs). */
export const ARTICLE_TOPIC_CHIP_CLASSES: Record<
  ArticleTopic,
  { idle: string; active: string }
> = {
  urinary: {
    idle: "bg-[#7BC1D4]/20 text-[#1C5F7A] ring-1 ring-[#7BC1D4]/45",
    active: "bg-[#2A79A7] text-white ring-1 ring-[#2A79A7]",
  },
  respiratory: {
    idle: "bg-[#72705B]/15 text-[#4A4838] ring-1 ring-[#72705B]/35",
    active: "bg-[#72705B] text-white ring-1 ring-[#72705B]",
  },
  "skin-soft-tissue": {
    idle: "bg-[#FFA69E]/25 text-[#8B3A32] ring-1 ring-[#FFA69E]/55",
    active: "bg-[#E07A72] text-white ring-1 ring-[#E07A72]",
  },
  "artificial-intelligence": {
    idle: "bg-[#1C0B19]/08 text-[#1C0B19] ring-1 ring-[#1C0B19]/25",
    active: "bg-[#1C0B19] text-[#F6F4EF] ring-1 ring-[#1C0B19]",
  },
};

// ── Urinary ───────────────────────────────────────────────────────────────────

const URINARY_PHRASES = [
  "urinary tract infection",
  "urinary tract infections",
  "catheter-associated urinary",
  "catheter associated urinary",
  "asymptomatic bacteriuria",
  "pyelonephritis",
  "cystitis",
  "urosepsis",
  "urinary catheter",
  "bladder infection",
];

const URINARY_WORDS = ["uti", "cauti", "bacteriuria", "pyuria", "dysuria"];

const URINARY_MESH_KW = [
  "urinary tract infections",
  "urinary tract infection",
  "cystitis",
  "pyelonephritis",
  "bacteriuria",
];

const URINARY_EXCLUDE_PHRASES = ["interstitial cystitis"];

// ── Respiratory (includes ENT: otitis / sinusitis / pharyngitis) ───────────────

const RESPIRATORY_PHRASES = [
  "community-acquired pneumonia",
  "community acquired pneumonia",
  "hospital-acquired pneumonia",
  "hospital acquired pneumonia",
  "ventilator-associated pneumonia",
  "ventilator associated pneumonia",
  "lower respiratory tract",
  "upper respiratory tract",
  "acute bronchitis",
  "acute otitis media",
  "otitis media",
  "sinusitis",
  "pharyngitis",
  "tonsillitis",
  "respiratory tract infection",
  "respiratory tract infections",
];

const RESPIRATORY_WORDS = [
  "pneumonia",
  "vap",
  "bronchitis",
  "influenza",
  "rsv",
];

const RESPIRATORY_MESH_KW = [
  "pneumonia",
  "respiratory tract infections",
  "bronchitis",
  "pneumonia, ventilator-associated",
  "otitis media",
  "sinusitis",
  "pharyngitis",
];

// ── Skin & Soft Tissue (no bare abscess; no osteomyelitis) ─────────────────────

const SSTI_PHRASES = [
  "skin and soft tissue",
  "soft tissue infection",
  "soft-tissue infection",
  "cellulitis",
  "skin abscess",
  "necrotizing fasciitis",
  "necrotising fasciitis",
  "necrotizing soft tissue",
  "diabetic foot infection",
  "surgical site infection",
  "wound infection",
  "erysipelas",
  "impetigo",
];

const SSTI_WORDS = [
  "ssti",
  "sstis",
  "cellulitis",
  "furuncle",
  "carbuncle",
];

const SSTI_MESH_KW = [
  "soft tissue infections",
  "cellulitis",
  "skin diseases, infectious",
  "fasciitis, necrotizing",
];

// ── Artificial Intelligence ───────────────────────────────────────────────────

const AI_PHRASES = [
  "artificial intelligence",
  "machine learning",
  "deep learning",
  "large language model",
  "large language models",
  "natural language processing",
  "neural network",
  "neural networks",
];

const AI_WORDS = ["llm", "llms", "chatgpt", "nlp"];

const AI_MESH_KW = [
  "artificial intelligence",
  "machine learning",
  "deep learning",
  "natural language processing",
];

/** Default floor; AI uses a higher floor so weak signals do not fire alone. */
const MIN_SCORE = 2;
const MIN_SCORE_AI = 3;

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

function scoreKeywords(kws: string[], terms: string[]): number {
  let score = 0;
  for (const kw of kws) {
    const lower = kw.toLowerCase();
    for (const term of terms) {
      if (lower === term || lower.includes(term)) score += 4;
    }
  }
  return score;
}

function hasExclude(text: string, phrases: string[]): boolean {
  const lower = text.toLowerCase();
  return phrases.some((p) => lower.includes(p));
}

/**
 * Score all topic capsules (for soft match / debugging).
 */
export function scoreAllTopics(params: {
  title?: string | null;
  abstract?: string | null;
  keywords?: string[] | null;
  meshTerms?: string[] | null;
}): Record<ArticleTopic, number> {
  const text = [params.title ?? "", params.abstract ?? ""].join(" ");
  const kws = [
    ...(params.keywords ?? []),
    ...(params.meshTerms ?? []),
  ];

  let urinary =
    scoreText(text, URINARY_PHRASES, URINARY_WORDS) +
    scoreKeywords(kws, URINARY_MESH_KW);
  if (hasExclude(text, URINARY_EXCLUDE_PHRASES)) {
    // Drop cystitis-driven false positives for interstitial cystitis.
    urinary = Math.min(urinary, 0);
  }

  return {
    urinary,
    respiratory:
      scoreText(text, RESPIRATORY_PHRASES, RESPIRATORY_WORDS) +
      scoreKeywords(kws, RESPIRATORY_MESH_KW),
    "skin-soft-tissue":
      scoreText(text, SSTI_PHRASES, SSTI_WORDS) +
      scoreKeywords(kws, SSTI_MESH_KW),
    "artificial-intelligence":
      scoreText(text, AI_PHRASES, AI_WORDS) +
      scoreKeywords(kws, AI_MESH_KW),
  };
}

/**
 * Multi-label topics at/above floor, ordered by score then ARTICLE_TOPIC_ORDER.
 */
export function classifyArticleTopics(params: {
  title?: string | null;
  abstract?: string | null;
  keywords?: string[] | null;
  meshTerms?: string[] | null;
}): ArticleTopic[] {
  const scores = scoreAllTopics(params);

  return (Object.entries(scores) as [ArticleTopic, number][])
    .filter(([topic, score]) => {
      const floor = topic === "artificial-intelligence" ? MIN_SCORE_AI : MIN_SCORE;
      return score >= floor;
    })
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return (
        ARTICLE_TOPIC_ORDER.indexOf(a[0]) - ARTICLE_TOPIC_ORDER.indexOf(b[0])
      );
    })
    .map(([topic]) => topic);
}
