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
  | "bone-joint"
  | "c-difficile"
  | "antifungal"
  | "pediatrics"
  | "diagnostic-stewardship"
  | "allergy"
  | "surgical-prophylaxis"
  | "artificial-intelligence";

export const ARTICLE_TOPIC_ORDER: ArticleTopic[] = [
  "urinary",
  "respiratory",
  "skin-soft-tissue",
  "bone-joint",
  "c-difficile",
  "antifungal",
  "pediatrics",
  "diagnostic-stewardship",
  "allergy",
  "surgical-prophylaxis",
  "artificial-intelligence",
];

export const ARTICLE_TOPIC_LABELS: Record<ArticleTopic, string> = {
  urinary: "Urinary",
  respiratory: "Respiratory",
  "skin-soft-tissue": "Skin & Soft Tissue",
  "bone-joint": "Bone & Joint",
  "c-difficile": "C. difficile",
  antifungal: "Antifungal",
  pediatrics: "Pediatrics",
  "diagnostic-stewardship": "Diagnostic Stewardship",
  allergy: "Allergy",
  "surgical-prophylaxis": "Surgical Prophylaxis",
  "artificial-intelligence": "Artificial Intelligence",
};

/** Capsule chip colors (topic filter + MetaLine). */
export const ARTICLE_TOPIC_CHIP_CLASSES: Record<
  ArticleTopic,
  { idle: string; active: string }
> = {
  urinary: {
    idle: "bg-[#E4B429]/25 text-[#6B4E00] ring-1 ring-[#E4B429]/50",
    active: "bg-[#E4B429] text-[#1C0B19] ring-1 ring-[#E4B429]",
  },
  respiratory: {
    idle: "bg-[#7BC1D4]/20 text-[#1C5F7A] ring-1 ring-[#7BC1D4]/45",
    active: "bg-[#2A79A7] text-white ring-1 ring-[#2A79A7]",
  },
  "skin-soft-tissue": {
    idle: "bg-[#FFA69E]/25 text-[#8B3A32] ring-1 ring-[#FFA69E]/55",
    active: "bg-[#E07A72] text-white ring-1 ring-[#E07A72]",
  },
  "artificial-intelligence": {
    idle: "bg-[#1C0B19]/08 text-[#1C0B19] ring-1 ring-[#1C0B19]/25",
    active: "bg-[#1C0B19] text-[#F6F4EF] ring-1 ring-[#1C0B19]",
  },
  "bone-joint": {
    idle: "bg-[#4E6470]/15 text-[#2C3E48] ring-1 ring-[#4E6470]/40",
    active: "bg-[#4E6470] text-white ring-1 ring-[#4E6470]",
  },
  "c-difficile": {
    idle: "bg-[#6B4E2E]/15 text-[#5C3E1E] ring-1 ring-[#6B4E2E]/40",
    active: "bg-[#6B4E2E] text-white ring-1 ring-[#6B4E2E]",
  },
  antifungal: {
    idle: "bg-[#A36B2C]/18 text-[#6B4510] ring-1 ring-[#A36B2C]/45",
    active: "bg-[#A36B2C] text-white ring-1 ring-[#A36B2C]",
  },
  pediatrics: {
    idle: "bg-[#3D7A6A]/15 text-[#1E4A40] ring-1 ring-[#3D7A6A]/40",
    active: "bg-[#3D7A6A] text-white ring-1 ring-[#3D7A6A]",
  },
  "diagnostic-stewardship": {
    idle: "bg-[#72705B]/18 text-[#3E3D32] ring-1 ring-[#72705B]/45",
    active: "bg-[#72705B] text-white ring-1 ring-[#72705B]",
  },
  allergy: {
    idle: "bg-[#8B4D6B]/15 text-[#6A3050] ring-1 ring-[#8B4D6B]/40",
    active: "bg-[#8B4D6B] text-white ring-1 ring-[#8B4D6B]",
  },
  "surgical-prophylaxis": {
    idle: "bg-[#3F5E4A]/15 text-[#24382C] ring-1 ring-[#3F5E4A]/40",
    active: "bg-[#3F5E4A] text-white ring-1 ring-[#3F5E4A]",
  },
};

/** Solid swatches for the Topic dropdown (same hues as the chips). */
export const ARTICLE_TOPIC_SWATCH: Record<ArticleTopic, string> = {
  urinary: "#E4B429",
  respiratory: "#2A79A7",
  "skin-soft-tissue": "#E07A72",
  "artificial-intelligence": "#1C0B19",
  "bone-joint": "#4E6470",
  "c-difficile": "#6B4E2E",
  antifungal: "#A36B2C",
  pediatrics: "#3D7A6A",
  "diagnostic-stewardship": "#72705B",
  allergy: "#8B4D6B",
  "surgical-prophylaxis": "#3F5E4A",
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

// ── Bone & joint (osteomyelitis stays out of Skin & Soft Tissue) ──────────────

const BONE_PHRASES = [
  "osteomyelitis",
  "prosthetic joint infection",
  "periprosthetic joint",
  "septic arthritis",
  "diabetic foot osteomyelitis",
];

const BONE_WORDS = ["pji", "dfo"];

const BONE_MESH_KW = [
  "osteomyelitis",
  "arthritis, infectious",
  "prosthesis-related infections",
];

// ── C. difficile ──────────────────────────────────────────────────────────────

const CDI_PHRASES = [
  "clostridioides difficile",
  "clostridium difficile",
  "c. difficile",
  "c difficile",
  "c.difficile",
  "c diff",
  "cdad",
];

const CDI_WORDS = ["cdi"];

const CDI_MESH_KW = [
  "clostridioides difficile",
  "clostridium difficile",
  "enterocolitis, pseudomembranous",
];

// ── Antifungal (bare "candida" / "azole" need a second hit; floor is 3) ───────

const ANTIFUNGAL_PHRASES = [
  "antifungal stewardship",
  "candidemia",
  "candidaemia",
  "invasive candidiasis",
  "invasive aspergillosis",
  "aspergillosis",
  "antifungal prophylaxis",
  "candida auris",
];

const ANTIFUNGAL_WORDS = ["candida", "azole"];

const ANTIFUNGAL_MESH_KW = [
  "candidiasis",
  "aspergillosis",
  "antifungal agents",
];

// ── Pediatrics ────────────────────────────────────────────────────────────────
// Age words in the title count. The same words in the abstract do not, so
// "not studied in children" stays out. MeSH age terms count on their own.

const PEDS_ANYWHERE_PHRASES = [
  "pediatric",
  "paediatric",
  "neonatal",
  "neonate",
  "nicu",
  "picu",
];

const PEDS_TITLE_PHRASES = ["children", "infants", "adolescent"];

const PEDS_MESH_PATTERNS = [
  /^child(,|\s|$)/,
  /^infant(,|\s|$)/,
  /^adolescent(,|\s|$)/,
  /^pediatrics(,|\s|$)/,
  /intensive care units, pediatric/,
  /intensive care units, neonatal/,
];

// ── Diagnostic stewardship (floor 3: one phrase or MeSH, not two weak words) ─

const DIAGNOSTIC_PHRASES = [
  "diagnostic stewardship",
  "blood culture stewardship",
  "urine culture stewardship",
  "procalcitonin-guided",
  "procalcitonin guided",
  "cascade reporting",
  "selective reporting",
  "blood culture contamination",
  "reflex urine culture",
  "urine culture reflex",
  "syndromic panel",
  "rapid blood culture identification",
];

const DIAGNOSTIC_WORDS = ["procalcitonin", "pct", "biofire", "maldi"];

const DIAGNOSTIC_MESH_KW = ["procalcitonin"];

// ── Allergy (drug / antibiotic allergy, not the bare word "allergy") ─────────

const ALLERGY_PHRASES = [
  "penicillin allergy",
  "penicillin-allergic",
  "penicillin allergic",
  "beta-lactam allergy",
  "beta lactam allergy",
  "cephalosporin allergy",
  "sulfonamide allergy",
  "antibiotic allergy",
  "antimicrobial allergy",
  "drug allergy",
  "allergy delabel",
  "delabeling",
  "de-labeling",
  "delabelling",
  "de-labelling",
  "allergy label",
  "allergy assessment",
  "allergy testing",
];

const ALLERGY_MESH_KW = ["drug hypersensitivity"];

// ── Surgical prophylaxis (prophylaxis plus a surgical word, or a set phrase) ─

const SURGICAL_PROPHYLAXIS_PHRASES = [
  "surgical prophylaxis",
  "surgical antibiotic prophylaxis",
  "surgical antimicrobial prophylaxis",
  "perioperative antibiotic",
  "perioperative antibiotics",
  "perioperative antimicrobial",
  "preoperative antibiotic",
  "preoperative antibiotics",
  "preoperative antimicrobial",
  "pre-operative antibiotic",
  "peri-operative antibiotic",
];

/** Default floor; some topics use a higher floor so two weak words cannot fire. */
const MIN_SCORE = 2;
const MIN_SCORE_STRICT = 3;

const STRICT_TOPICS = new Set<ArticleTopic>([
  "artificial-intelligence",
  "diagnostic-stewardship",
  "antifungal",
]);

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

function scorePediatricsMesh(kws: string[]): number {
  let score = 0;
  for (const kw of kws) {
    const lower = kw.toLowerCase().trim();
    if (PEDS_MESH_PATTERNS.some((pattern) => pattern.test(lower))) score += 4;
  }
  return score;
}

function scoreSurgicalProphylaxis(text: string): number {
  let score = scoreText(text, SURGICAL_PROPHYLAXIS_PHRASES, []);
  const lower = text.toLowerCase();
  const prophylaxis = /\bprophyla(?:xis|ctic)\b/.test(lower);
  const surgical =
    /\b(?:surgeries|surgery|surgical|perioperative|preoperative|pre-operative|peri-operative|intraoperative|intra-operative|ssi)\b/.test(
      lower
    );
  if (prophylaxis && surgical) score += 3;
  return score;
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
  const title = params.title ?? "";
  const text = [title, params.abstract ?? ""].join(" ");
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
    "bone-joint":
      scoreText(text, BONE_PHRASES, BONE_WORDS) +
      scoreKeywords(kws, BONE_MESH_KW),
    "c-difficile":
      scoreText(text, CDI_PHRASES, CDI_WORDS) +
      scoreKeywords(kws, CDI_MESH_KW),
    antifungal:
      scoreText(text, ANTIFUNGAL_PHRASES, ANTIFUNGAL_WORDS) +
      scoreKeywords(kws, ANTIFUNGAL_MESH_KW),
    pediatrics:
      scoreText(text, PEDS_ANYWHERE_PHRASES, []) +
      scoreText(title, PEDS_TITLE_PHRASES, []) +
      scorePediatricsMesh(kws),
    "diagnostic-stewardship":
      scoreText(text, DIAGNOSTIC_PHRASES, DIAGNOSTIC_WORDS) +
      scoreKeywords(kws, DIAGNOSTIC_MESH_KW),
    allergy:
      scoreText(text, ALLERGY_PHRASES, []) +
      scoreKeywords(kws, ALLERGY_MESH_KW),
    "surgical-prophylaxis": scoreSurgicalProphylaxis(text),
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
      const floor = STRICT_TOPICS.has(topic) ? MIN_SCORE_STRICT : MIN_SCORE;
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
