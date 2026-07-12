import type { ArticleSetting } from "@/lib/classifySetting";
import type { BriefItem } from "@/lib/brief/items";

export const IMAGE_MATCH_THRESHOLD = 0.5;

export type StoryImageMatch = {
  id: string;
  url: string;
  confidence: number;
  label: string;
};

type CatalogEntry = {
  id: string;
  url: string;
  label: string;
  /** Weighted topic tags used for matching against headline/keywords. */
  tags: string[];
  settings?: ArticleSetting[];
};

/**
 * Curated free Unsplash medical / stewardship-adjacent photos.
 * Prefer free (non-Plus) images from https://unsplash.com/s/photos/medical
 * and related stewardship themes.
 */
const CATALOG: CatalogEntry[] = [
  // Antibiotics / pills / pharmacy
  {
    id: "pills-capsule",
    url: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=1200&q=80",
    label: "capsules and pills",
    tags: [
      "antibiotic",
      "antibiotics",
      "antimicrobial",
      "pill",
      "pills",
      "capsule",
      "prescribing",
      "prescription",
      "pharmacy",
      "medication",
      "macrolide",
      "cefdinir",
      "beta-lactam",
      "oral",
    ],
  },
  {
    id: "antibiotic-vials",
    url: "https://images.unsplash.com/photo-1763142842705-78621f9c0414?auto=format&fit=crop&w=1200&q=80",
    label: "antibiotic vials",
    tags: [
      "antibiotic",
      "antibiotics",
      "vial",
      "injection",
      "intravenous",
      "iv",
      "cefepime",
      "broad-spectrum",
      "hospital",
      "inpatient",
      "infusion",
    ],
    settings: ["hospital"],
  },
  {
    id: "medicine-bottles",
    url: "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=1200&q=80",
    label: "medicine bottles",
    tags: [
      "pharmacy",
      "medication",
      "prescribing",
      "outpatient",
      "community",
      "dispensing",
      "oral",
      "antibiotic",
      "stewardship",
    ],
    settings: ["community"],
  },
  {
    id: "syringe-ampoules",
    url: "https://images.unsplash.com/photo-1631549916768-4119b2e5f926?auto=format&fit=crop&w=1200&q=80",
    label: "syringe and ampoules",
    tags: [
      "injection",
      "syringe",
      "ampoule",
      "vaccine",
      "parenteral",
      "dose",
      "antibiotic",
      "iv",
    ],
  },

  // Hospital / ICU / inpatient
  {
    id: "hospital-corridor",
    url: "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=1200&q=80",
    label: "hospital corridor",
    tags: [
      "hospital",
      "inpatient",
      "ward",
      "icu",
      "intensive",
      "acute",
      "admission",
      "nosocomial",
      "healthcare-associated",
      "facility",
    ],
    settings: ["hospital"],
  },
  {
    id: "hospital-staff",
    url: "https://images.unsplash.com/photo-1631217868264-e5b90bb7e133?auto=format&fit=crop&w=1200&q=80",
    label: "hospital clinicians",
    tags: [
      "hospital",
      "clinician",
      "physician",
      "doctor",
      "team",
      "rounds",
      "inpatient",
      "stewardship",
      "guideline",
    ],
    settings: ["hospital"],
  },
  {
    id: "icu-monitor",
    url: "https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=1200&q=80",
    label: "critical care monitors",
    tags: [
      "icu",
      "intensive",
      "critical",
      "ventilator",
      "sepsis",
      "shock",
      "hospital",
      "inpatient",
      "monitor",
    ],
    settings: ["hospital"],
  },
  {
    id: "surgeon-or",
    url: "https://images.unsplash.com/photo-1551076805-e1869033fa91?auto=format&fit=crop&w=1200&q=80",
    label: "operating room",
    tags: [
      "surgery",
      "surgical",
      "perioperative",
      "prophylaxis",
      "operating",
      "procedure",
      "hospital",
    ],
    settings: ["hospital"],
  },

  // ED / outpatient / primary care
  {
    id: "clinic-stethoscope",
    url: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=1200&q=80",
    label: "clinic stethoscope",
    tags: [
      "clinic",
      "outpatient",
      "primary",
      "community",
      "ambulatory",
      "visit",
      "consultation",
      "physician",
      "sinusitis",
      "uri",
      "respiratory",
    ],
    settings: ["community"],
  },
  {
    id: "emergency-care",
    url: "https://images.unsplash.com/photo-1584820927498-cfe5211fd8bf?auto=format&fit=crop&w=1200&q=80",
    label: "emergency care",
    tags: [
      "emergency",
      "ed",
      "er",
      "acute",
      "triage",
      "hospital",
      "urgent",
      "encounter",
    ],
    settings: ["hospital", "community"],
  },
  {
    id: "pediatric-care",
    url: "https://images.unsplash.com/photo-1631217868660-4aaec14bd4e0?auto=format&fit=crop&w=1200&q=80",
    label: "pediatric care",
    tags: [
      "pediatric",
      "paediatric",
      "child",
      "children",
      "kids",
      "infant",
      "otitis",
      "sinusitis",
      "outpatient",
    ],
    settings: ["community", "hospital"],
  },

  // Lab / microbiology / diagnostics
  {
    id: "lab-microscope",
    url: "https://images.unsplash.com/photo-1576086213369-97a306d36557?auto=format&fit=crop&w=1200&q=80",
    label: "laboratory microscope",
    tags: [
      "laboratory",
      "lab",
      "microbiology",
      "culture",
      "diagnostic",
      "pathogen",
      "bacteria",
      "assay",
      "test",
      "sensitivity",
      "mic",
    ],
  },
  {
    id: "lab-pipette",
    url: "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?auto=format&fit=crop&w=1200&q=80",
    label: "lab pipette work",
    tags: [
      "laboratory",
      "research",
      "assay",
      "sample",
      "testing",
      "molecular",
      "pcr",
      "genomic",
      "sequencing",
      "diagnostic",
    ],
  },
  {
    id: "petri-culture",
    url: "https://images.unsplash.com/photo-1582719471384-894fbb16e074?auto=format&fit=crop&w=1200&q=80",
    label: "culture plates",
    tags: [
      "culture",
      "bacteria",
      "microbiology",
      "resistance",
      "amr",
      "pathogen",
      "colony",
      "antibiogram",
      "susceptibility",
    ],
  },
  {
    id: "blood-draw",
    url: "https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&w=1200&q=80",
    label: "blood sample draw",
    tags: [
      "blood",
      "culture",
      "bacteremia",
      "sepsis",
      "sample",
      "lab",
      "diagnostic",
      "phlebotomy",
    ],
    settings: ["hospital"],
  },

  // Long-term care / elderly
  {
    id: "elder-care",
    url: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=1200&q=80",
    label: "elder care",
    tags: [
      "elderly",
      "aging",
      "nursing",
      "long-term",
      "ltc",
      "geriatric",
      "facility",
      "resident",
      "care home",
    ],
    settings: ["long-term care"],
  },
  {
    id: "nurse-patient",
    url: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=1200&q=80",
    label: "nurse with patient",
    tags: [
      "nurse",
      "nursing",
      "patient",
      "care",
      "ward",
      "long-term",
      "hospital",
      "bedside",
    ],
    settings: ["long-term care", "hospital"],
  },

  // Public health / data / surveillance
  {
    id: "data-dashboard",
    url: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=80",
    label: "data analytics",
    tags: [
      "surveillance",
      "audit",
      "dashboard",
      "metric",
      "data",
      "benchmark",
      "score",
      "report",
      "tracking",
      "utilization",
      "nationwide",
      "va",
      "network",
    ],
  },
  {
    id: "public-health",
    url: "https://images.unsplash.com/photo-1584036561566-b437342e7c22?auto=format&fit=crop&w=1200&q=80",
    label: "public health map",
    tags: [
      "surveillance",
      "outbreak",
      "epidemiology",
      "public",
      "population",
      "national",
      "global",
      "policy",
      "health system",
    ],
  },

  // Animal / One Health
  {
    id: "vet-care",
    url: "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=1200&q=80",
    label: "veterinary care",
    tags: [
      "veterinary",
      "animal",
      "dog",
      "pet",
      "companion",
      "one health",
      "zoonotic",
    ],
    settings: ["animal"],
  },
  {
    id: "livestock",
    url: "https://images.unsplash.com/photo-1500595046743-cd271d694d30?auto=format&fit=crop&w=1200&q=80",
    label: "livestock",
    tags: [
      "livestock",
      "cattle",
      "farm",
      "agriculture",
      "veterinary",
      "animal",
      "one health",
      "food animal",
    ],
    settings: ["animal"],
  },

  // Environment / wastewater
  {
    id: "wastewater",
    url: "https://images.unsplash.com/photo-1581093588401-fbb62a02f120?auto=format&fit=crop&w=1200&q=80",
    label: "water treatment",
    tags: [
      "wastewater",
      "water",
      "environment",
      "effluent",
      "resistome",
      "environmental",
      "sewage",
      "surveillance",
    ],
    settings: ["environment"],
  },
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s%-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function storyCorpus(item: Pick<
  BriefItem,
  "headline" | "title" | "bottomLine" | "keywords" | "setting" | "methods"
>): string {
  return normalize(
    [
      item.headline,
      item.title,
      item.bottomLine ?? "",
      item.methods ?? "",
      ...(item.keywords ?? []),
      item.setting ?? "",
    ].join(" ")
  );
}

function scoreEntry(corpus: string, setting: ArticleSetting | null, entry: CatalogEntry): number {
  let matchedWeight = 0;
  let matchedCount = 0;

  for (const tag of entry.tags) {
    const t = tag.toLowerCase();
    if (!corpus.includes(t)) continue;
    const tagWeight = t.length >= 8 ? 1.4 : t.length >= 5 ? 1.15 : 1;
    matchedWeight += tagWeight;
    matchedCount += 1;
  }

  if (matchedCount === 0) return 0;

  // ~2.5–3 matched tag-weight ≈ mid confidence; more hits raise toward 1.0
  let score = Math.min(1, matchedWeight / 3);

  if (setting && entry.settings?.includes(setting)) {
    score = Math.min(1, score + 0.1);
  }

  const boosts: Array<[RegExp, number]> = [
    [/\b(icu|intensive care)\b/, 0.08],
    [/\b(pediatric|paediatric|children|kids)\b/, 0.1],
    [/\b(emergency|\bed\b|\ber\b)\b/, 0.08],
    [/\b(sepsis|bacteremia)\b/, 0.08],
    [/\b(surveillance|audit|benchmark|dashboard|metric)\b/, 0.1],
    [/\b(microbiology|culture|antibiogram|susceptibility)\b/, 0.1],
    [/\b(veterinary|livestock|one health|zoonotic)\b/, 0.12],
    [/\b(wastewater|resistome|environmental)\b/, 0.12],
    [/\b(antibiotic|antimicrobial|prescribing)\b/, 0.06],
  ];
  for (const [re, boost] of boosts) {
    if (re.test(corpus) && entry.tags.some((t) => re.test(t) || corpus.includes(t))) {
      // Only boost if this entry is thematically related
      const entryText = entry.tags.join(" ");
      if (re.test(entryText) || entry.tags.some((t) => corpus.includes(t) && re.test(corpus))) {
        score = Math.min(1, score + boost);
      }
    }
  }

  return score;
}

/**
 * Pick the best catalog image for a story.
 * Returns null when confidence is at or below IMAGE_MATCH_THRESHOLD.
 * Pass `usedIds` to avoid repeating the same photo on one page.
 */
export function matchStoryImage(
  item: Pick<
    BriefItem,
    "pmid" | "headline" | "title" | "bottomLine" | "keywords" | "setting" | "methods"
  >,
  usedIds: Set<string> = new Set()
): StoryImageMatch | null {
  const corpus = storyCorpus(item);
  let best: { entry: CatalogEntry; confidence: number } | null = null;

  for (const entry of CATALOG) {
    if (usedIds.has(entry.id)) continue;
    const confidence = scoreEntry(corpus, item.setting, entry);
    if (!best || confidence > best.confidence) {
      best = { entry, confidence };
    }
  }

  if (!best || best.confidence <= IMAGE_MATCH_THRESHOLD) return null;

  return {
    id: best.entry.id,
    url: best.entry.url,
    confidence: best.confidence,
    label: best.entry.label,
  };
}

/** Whether a story should render with an image (>50% match confidence). */
export function storyHasImageMatch(
  item: Pick<
    BriefItem,
    "pmid" | "headline" | "title" | "bottomLine" | "keywords" | "setting" | "methods"
  >,
  usedIds?: Set<string>
): boolean {
  return matchStoryImage(item, usedIds) != null;
}
