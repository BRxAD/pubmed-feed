import "server-only";
import type { ArticleSetting } from "@/lib/classifySetting";
import type { BriefItem } from "@/lib/brief/items";
import {
  IMAGE_MATCH_THRESHOLD,
  type StoryImageMatch,
} from "@/lib/brief/storyImageTypes";

export type { StoryImageMatch };
export { IMAGE_MATCH_THRESHOLD };

type CatalogEntry = {
  id: string;
  url: string;
  label: string;
  /** Specific topic tags — prefer distinctive clinical terms over generic ones. */
  tags: string[];
  /** Tags that must appear for this image to be eligible (any one). */
  requireAny?: string[];
  settings?: ArticleSetting[];
};

/**
 * Curated free Unsplash medical photos.
 * Source: https://unsplash.com/s/photos/medical and related stewardship themes.
 * URLs are validated at request time; broken ones are skipped.
 */
const CATALOG: CatalogEntry[] = [
  {
    id: "pills-capsule",
    url: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=1200&q=80",
    label: "capsules and pills",
    requireAny: [
      "pill",
      "pills",
      "capsule",
      "oral",
      "prescribing",
      "prescription",
      "pharmacy",
      "macrolide",
      "cefdinir",
      "outpatient antibiotic",
    ],
    tags: [
      "oral antibiotic",
      "pill",
      "pills",
      "capsule",
      "prescribing",
      "prescription",
      "pharmacy",
      "macrolide",
      "cefdinir",
      "outpatient",
      "community prescribing",
    ],
  },
  {
    id: "antibiotic-vials",
    url: "https://images.unsplash.com/photo-1763142842705-78621f9c0414?auto=format&fit=crop&w=1200&q=80",
    label: "antibiotic vials",
    requireAny: [
      "vial",
      "intravenous",
      "infusion",
      "injection",
      "iv",
      "broad-spectrum",
      "cefepime",
      "parenteral",
    ],
    tags: [
      "vial",
      "injection",
      "intravenous",
      "infusion",
      "broad-spectrum",
      "parenteral",
      "inpatient antibiotic",
    ],
    settings: ["hospital"],
  },
  {
    id: "medicine-bottles",
    url: "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=1200&q=80",
    label: "medicine bottles",
    requireAny: ["pharmacy", "dispensing", "medication", "outpatient", "community"],
    tags: [
      "pharmacy",
      "medication",
      "dispensing",
      "outpatient",
      "community",
      "retail pharmacy",
    ],
    settings: ["community"],
  },
  {
    id: "syringe-ampoules",
    url: "https://images.unsplash.com/photo-1631549916768-4119b2e5f926?auto=format&fit=crop&w=1200&q=80",
    label: "syringe and ampoules",
    requireAny: ["injection", "syringe", "ampoule", "vaccine", "parenteral"],
    tags: ["injection", "syringe", "ampoule", "vaccine", "parenteral", "dose"],
  },
  {
    id: "hospital-corridor",
    url: "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=1200&q=80",
    label: "hospital corridor",
    requireAny: [
      "hospital",
      "inpatient",
      "ward",
      "nosocomial",
      "healthcare-associated",
      "facility",
      "admission",
    ],
    tags: [
      "hospital",
      "inpatient",
      "ward",
      "nosocomial",
      "healthcare-associated",
      "admission",
      "acute care",
    ],
    settings: ["hospital"],
  },
  {
    id: "hospital-staff",
    url: "https://images.unsplash.com/photo-1631217868264-e5b90bb7e133?auto=format&fit=crop&w=1200&q=80",
    label: "hospital clinicians",
    requireAny: ["clinician", "physician", "doctor", "rounds", "stewardship team", "guideline"],
    tags: [
      "clinician",
      "physician",
      "doctor",
      "rounds",
      "guideline",
      "stewardship program",
      "inpatient team",
    ],
    settings: ["hospital"],
  },
  {
    id: "icu-monitor",
    url: "https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=1200&q=80",
    label: "critical care monitors",
    requireAny: ["icu", "intensive", "critical", "ventilator", "sepsis", "shock"],
    tags: [
      "icu",
      "intensive care",
      "critical care",
      "ventilator",
      "sepsis",
      "shock",
      "monitor",
    ],
    settings: ["hospital"],
  },
  {
    id: "surgeon-or",
    url: "https://images.unsplash.com/photo-1551190822-a9333d879b1f?auto=format&fit=crop&w=1200&q=80",
    label: "operating room",
    requireAny: ["surgery", "surgical", "perioperative", "prophylaxis", "operating"],
    tags: [
      "surgery",
      "surgical",
      "perioperative",
      "prophylaxis",
      "operating room",
      "procedure",
    ],
    settings: ["hospital"],
  },
  {
    id: "clinic-stethoscope",
    url: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=1200&q=80",
    label: "clinic stethoscope",
    requireAny: [
      "clinic",
      "outpatient",
      "primary",
      "ambulatory",
      "sinusitis",
      "uri",
      "respiratory",
      "community",
    ],
    tags: [
      "clinic",
      "outpatient",
      "primary care",
      "ambulatory",
      "sinusitis",
      "uri",
      "respiratory",
      "visit",
    ],
    settings: ["community"],
  },
  {
    id: "emergency-care",
    url: "https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=1200&q=80",
    label: "emergency department",
    requireAny: ["emergency", "ed", "er", "triage", "urgent"],
    tags: ["emergency", "emergency department", "triage", "urgent", "ed visit"],
    settings: ["hospital", "community"],
  },
  {
    id: "pediatric-care",
    url: "https://images.unsplash.com/photo-1584515933487-779824d29309?auto=format&fit=crop&w=1200&q=80",
    label: "pediatric clinical care",
    requireAny: ["pediatric", "paediatric", "child", "children", "kids", "infant", "otitis"],
    tags: [
      "pediatric",
      "paediatric",
      "child",
      "children",
      "kids",
      "infant",
      "otitis",
      "pediatric prescribing",
    ],
    settings: ["community", "hospital"],
  },
  {
    id: "lab-microscope",
    url: "https://images.unsplash.com/photo-1576086213369-97a306d36557?auto=format&fit=crop&w=1200&q=80",
    label: "laboratory microscope",
    requireAny: [
      "laboratory",
      "lab",
      "microbiology",
      "culture",
      "diagnostic",
      "pathogen",
      "susceptibility",
      "mic",
    ],
    tags: [
      "laboratory",
      "microbiology",
      "culture",
      "diagnostic",
      "pathogen",
      "susceptibility",
      "mic",
      "assay",
    ],
  },
  {
    id: "lab-pipette",
    url: "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?auto=format&fit=crop&w=1200&q=80",
    label: "lab pipette work",
    requireAny: ["molecular", "pcr", "genomic", "sequencing", "pipette", "assay", "sample"],
    tags: [
      "molecular",
      "pcr",
      "genomic",
      "sequencing",
      "assay",
      "sample",
      "laboratory research",
    ],
  },
  {
    id: "petri-culture",
    url: "https://images.unsplash.com/photo-1530026405186-ed1f139313f8?auto=format&fit=crop&w=1200&q=80",
    label: "bacterial culture plates",
    requireAny: [
      "microbiology",
      "culture plate",
      "petri",
      "antibiogram",
      "susceptibility",
      "colony",
      "bacterial culture",
    ],
    tags: [
      "microbiology",
      "culture",
      "bacteria",
      "antibiogram",
      "susceptibility",
      "resistance",
      "amr",
      "colony",
      "bacterial culture",
      "pathogen",
    ],
  },
  {
    id: "blood-draw",
    url: "https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&w=1200&q=80",
    label: "blood sample draw",
    requireAny: ["blood", "bacteremia", "sepsis", "phlebotomy", "blood culture"],
    tags: ["blood", "blood culture", "bacteremia", "sepsis", "phlebotomy", "sample"],
    settings: ["hospital"],
  },
  {
    id: "elder-care",
    url: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=1200&q=80",
    label: "elder care",
    requireAny: ["elderly", "aging", "nursing", "long-term", "ltc", "geriatric", "care home"],
    tags: [
      "elderly",
      "nursing home",
      "long-term care",
      "ltc",
      "geriatric",
      "resident",
      "care home",
    ],
    settings: ["long-term care"],
  },
  {
    id: "nurse-patient",
    url: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=1200&q=80",
    label: "nurse with patient",
    requireAny: ["nurse", "nursing", "bedside", "patient care"],
    tags: ["nurse", "nursing", "bedside", "patient care", "ward care"],
    settings: ["long-term care", "hospital"],
  },
  {
    id: "data-dashboard",
    url: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=80",
    label: "data analytics",
    requireAny: [
      "surveillance",
      "audit",
      "dashboard",
      "metric",
      "benchmark",
      "scorecard",
      "utilization",
      "nationwide",
    ],
    tags: [
      "surveillance",
      "audit",
      "dashboard",
      "metric",
      "benchmark",
      "scorecard",
      "utilization",
      "nationwide",
      "tracking",
    ],
  },
  {
    id: "public-health",
    url: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1200&q=80",
    label: "public health planning",
    requireAny: [
      "epidemiology",
      "outbreak",
      "public health",
      "population",
      "national",
      "policy",
      "health system",
    ],
    tags: [
      "epidemiology",
      "outbreak",
      "public health",
      "population",
      "national",
      "policy",
      "health system",
    ],
  },
  {
    id: "vet-care",
    url: "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=1200&q=80",
    label: "veterinary care",
    requireAny: ["veterinary", "animal", "pet", "companion", "one health", "zoonotic"],
    tags: ["veterinary", "animal", "companion animal", "one health", "zoonotic", "pet"],
    settings: ["animal"],
  },
  {
    id: "livestock",
    url: "https://images.unsplash.com/photo-1500595046743-cd271d694d30?auto=format&fit=crop&w=1200&q=80",
    label: "livestock",
    requireAny: ["livestock", "cattle", "farm", "agriculture", "food animal"],
    tags: ["livestock", "cattle", "farm", "agriculture", "food animal", "veterinary"],
    settings: ["animal"],
  },
  {
    id: "wastewater",
    url: "https://images.unsplash.com/photo-1581093588401-fbb62a02f120?auto=format&fit=crop&w=1200&q=80",
    label: "water treatment",
    requireAny: ["wastewater", "effluent", "resistome", "environmental", "sewage", "water"],
    tags: [
      "wastewater",
      "effluent",
      "resistome",
      "environmental",
      "sewage",
      "water treatment",
    ],
    settings: ["environment"],
  },
  {
    id: "doctor-exam",
    url: "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&w=1200&q=80",
    label: "physician consultation",
    requireAny: ["consultation", "physician exam", "clinical visit", "diagnosis"],
    tags: ["consultation", "physician", "clinical visit", "diagnosis", "exam"],
  },
  {
    id: "mri-diagnostics",
    url: "https://images.unsplash.com/photo-1530497610245-94d3c16cda28?auto=format&fit=crop&w=1200&q=80",
    label: "hospital diagnostics",
    requireAny: ["diagnostic imaging", "radiology", "ct", "mri", "imaging"],
    tags: ["diagnostic imaging", "radiology", "hospital diagnostics", "imaging"],
    settings: ["hospital"],
  },
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s%-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function storyCorpus(
  item: Pick<
    BriefItem,
    "headline" | "title" | "bottomLine" | "keywords" | "setting" | "methods"
  >
): string {
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

function hasRequiredGate(corpus: string, entry: CatalogEntry): boolean {
  if (!entry.requireAny?.length) return true;
  return entry.requireAny.some((req) => corpus.includes(req.toLowerCase()));
}

function scoreEntry(
  corpus: string,
  setting: ArticleSetting | null,
  entry: CatalogEntry
): number {
  if (!hasRequiredGate(corpus, entry)) return 0;

  let matchedWeight = 0;
  let matchedCount = 0;

  for (const tag of entry.tags) {
    const t = tag.toLowerCase();
    if (!corpus.includes(t)) continue;
    // Multi-word tags are more specific → higher weight
    const words = t.split(/\s+/).length;
    const tagWeight = words >= 2 ? 1.6 : t.length >= 8 ? 1.35 : t.length >= 5 ? 1.1 : 0.85;
    matchedWeight += tagWeight;
    matchedCount += 1;
  }

  // Need at least two tag hits (or one strong multi-word hit) for credibility
  if (matchedCount < 2 && matchedWeight < 1.6) return 0;

  // Harder curve: ~3.6 tag-weight ≈ 60% confidence
  let score = Math.min(1, matchedWeight / 3.6);

  if (setting && entry.settings?.includes(setting) && matchedCount >= 2) {
    score = Math.min(1, score + 0.06);
  }

  return score;
}

/** Rank catalog candidates for a story (highest confidence first). */
function rankCandidates(
  item: Pick<
    BriefItem,
    "pmid" | "headline" | "title" | "bottomLine" | "keywords" | "setting" | "methods"
  >,
  usedIds: Set<string>
): Array<{ entry: CatalogEntry; confidence: number }> {
  const corpus = storyCorpus(item);
  const ranked: Array<{ entry: CatalogEntry; confidence: number }> = [];

  for (const entry of CATALOG) {
    if (usedIds.has(entry.id)) continue;
    const confidence = scoreEntry(corpus, item.setting, entry);
    if (confidence > IMAGE_MATCH_THRESHOLD) {
      ranked.push({ entry, confidence });
    }
  }

  ranked.sort((a, b) => b.confidence - a.confidence);
  return ranked;
}

const urlHealthCache = new Map<string, boolean>();

/** HEAD/GET probe — returns false for 404s and network failures. */
export async function isImageUrlReachable(url: string): Promise<boolean> {
  const cached = urlHealthCache.get(url);
  if (cached != null) return cached;

  try {
    const head = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(4000),
    });
    if (head.ok) {
      urlHealthCache.set(url, true);
      return true;
    }
    // Some CDNs reject HEAD — try a tiny ranged GET
    if (head.status === 405 || head.status === 403) {
      const get = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        redirect: "follow",
        signal: AbortSignal.timeout(4000),
      });
      const ok = get.ok || get.status === 206;
      urlHealthCache.set(url, ok);
      return ok;
    }
    urlHealthCache.set(url, false);
    return false;
  } catch {
    urlHealthCache.set(url, false);
    return false;
  }
}

/**
 * Pick the best reachable image for a story (confidence > 60%).
 * Tries next candidates if the top URL is broken.
 */
export async function matchStoryImage(
  item: Pick<
    BriefItem,
    "pmid" | "headline" | "title" | "bottomLine" | "keywords" | "setting" | "methods"
  >,
  usedIds: Set<string> = new Set()
): Promise<StoryImageMatch | null> {
  const ranked = rankCandidates(item, usedIds);

  for (const { entry, confidence } of ranked) {
    const ok = await isImageUrlReachable(entry.url);
    if (!ok) {
      console.warn(`[storyImages] broken image skipped: ${entry.id} ${entry.url}`);
      continue;
    }
    return {
      id: entry.id,
      url: entry.url,
      confidence,
      label: entry.label,
    };
  }

  return null;
}

/**
 * Assign unique reachable images across a brief page.
 * Stories below 60% confidence (or with only broken URLs) get null.
 */
export async function assignStoryImages(
  items: BriefItem[]
): Promise<Record<string, StoryImageMatch | null>> {
  const usedIds = new Set<string>();
  const out: Record<string, StoryImageMatch | null> = {};

  for (const item of items) {
    const match = await matchStoryImage(item, usedIds);
    if (match) usedIds.add(match.id);
    out[item.pmid] = match;
  }

  return out;
}
