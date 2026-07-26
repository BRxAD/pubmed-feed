import "server-only";
import type { ArticleSetting } from "@/lib/classifySetting";
import type { BriefItem } from "@/lib/brief/items";
import {
  IMAGE_MATCH_THRESHOLD,
  IMAGE_MATCH_THRESHOLD_THEMATIC,
  type StoryImageMatch,
} from "@/lib/brief/storyImageTypes";
import {
  STORY_IMAGE_CATALOG,
  type CatalogEntry,
} from "@/lib/brief/storyImageCatalog";
import { expandStoryCorpus } from "@/lib/brief/storyImageSynonyms";

export type { StoryImageMatch };
export { IMAGE_MATCH_THRESHOLD, IMAGE_MATCH_THRESHOLD_THEMATIC };

type StoryImageFields = Pick<
  BriefItem,
  | "pmid"
  | "headline"
  | "title"
  | "bottomLine"
  | "keywords"
  | "setting"
  | "methods"
  | "results"
  | "studyLabel"
  | "meshTerms"
  | "abstractSnippet"
>;

/** Setting → catalog ids used only as thematic (tier B) fallbacks. */
const SETTING_FALLBACK_IDS: Partial<Record<ArticleSetting, string[]>> = {
  hospital: [
    "hospital-corridor",
    "hospital-staff",
    "icu-monitor",
    "stewardship-meeting",
    "hand-hygiene",
  ],
  community: [
    "clinic-stethoscope",
    "medicine-bottles",
    "pharmacy-shelves",
    "pharmacist-counsel",
    "doctor-exam",
  ],
  "long-term care": ["elder-care", "nurse-patient", "pexels-elderly-hands"],
  animal: ["vet-care", "livestock", "wikimedia-one-health"],
  environment: ["wastewater", "globe-network", "wikimedia-one-health"],
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s%-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function storyCorpus(item: StoryImageFields): string {
  const raw = normalize(
    [
      item.headline,
      item.title,
      item.bottomLine ?? "",
      item.methods ?? "",
      item.results ?? "",
      item.studyLabel ?? "",
      item.abstractSnippet ?? "",
      ...(item.keywords ?? []),
      ...(item.meshTerms ?? []),
      item.setting ?? "",
    ].join(" ")
  );
  return expandStoryCorpus(raw);
}

function hasRequiredGate(corpus: string, entry: CatalogEntry): boolean {
  if (!entry.requireAny?.length) return true;
  return entry.requireAny.some((req) => corpus.includes(req.toLowerCase()));
}

type ScoreMode = "strict" | "thematic";

function scoreEntry(
  corpus: string,
  setting: ArticleSetting | null,
  entry: CatalogEntry,
  mode: ScoreMode
): number {
  if (!hasRequiredGate(corpus, entry)) return 0;

  let matchedWeight = 0;
  let matchedCount = 0;
  let strongHits = 0;

  for (const tag of entry.tags) {
    const t = tag.toLowerCase();
    if (!corpus.includes(t)) continue;
    const words = t.split(/\s+/).length;
    const tagWeight =
      words >= 2 ? 1.85 : t.length >= 10 ? 1.45 : t.length >= 6 ? 1.15 : 0.8;
    matchedWeight += tagWeight;
    matchedCount += 1;
    if (words >= 2 || t.length >= 8) strongHits += 1;
  }

  if (mode === "strict") {
    if (matchedCount < 2 && strongHits < 1) return 0;
    if (matchedWeight < 1.7) return 0;
  } else {
    if (matchedCount < 1 && strongHits < 1) return 0;
    if (matchedWeight < 1.1) return 0;
  }

  let score = Math.min(1, matchedWeight / 4.0);

  if (setting && entry.settings?.includes(setting) && matchedCount >= 1) {
    score = Math.min(1, score + (mode === "strict" ? 0.08 : 0.1));
  }

  if (entry.source === "wikimedia") score = Math.min(1, score + 0.02);

  return score;
}

function diversifyTop(
  ranked: Array<{ entry: CatalogEntry; confidence: number }>,
  seed: string
): Array<{ entry: CatalogEntry; confidence: number }> {
  if (ranked.length <= 1) return ranked;
  const top = ranked[0]!.confidence;
  const band = ranked.filter((r) => top - r.confidence <= 0.08);
  const rest = ranked.slice(band.length);
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const day = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < day.length; i++) h = (h * 17 + day.charCodeAt(i)) >>> 0;
  const rotated = [...band];
  const n = rotated.length;
  const offset = n > 0 ? h % n : 0;
  const mixed = [...rotated.slice(offset), ...rotated.slice(0, offset)];
  return [...mixed, ...rest];
}

function rankCandidates(
  item: StoryImageFields,
  usedIds: Set<string>,
  mode: ScoreMode,
  threshold: number
): Array<{ entry: CatalogEntry; confidence: number }> {
  const corpus = storyCorpus(item);
  const ranked: Array<{ entry: CatalogEntry; confidence: number }> = [];

  for (const entry of STORY_IMAGE_CATALOG) {
    if (usedIds.has(entry.id)) continue;
    const confidence = scoreEntry(corpus, item.setting, entry, mode);
    if (confidence > threshold) {
      ranked.push({ entry, confidence });
    }
  }

  ranked.sort((a, b) => b.confidence - a.confidence);
  return diversifyTop(ranked, item.pmid + item.headline + mode);
}

function thematicFallbackCandidates(
  item: StoryImageFields,
  usedIds: Set<string>
): Array<{ entry: CatalogEntry; confidence: number }> {
  const setting = item.setting;
  if (!setting) return [];
  const ids = SETTING_FALLBACK_IDS[setting] ?? [];
  const out: Array<{ entry: CatalogEntry; confidence: number }> = [];
  for (const id of ids) {
    if (usedIds.has(id)) continue;
    const entry = STORY_IMAGE_CATALOG.find((e) => e.id === id);
    if (!entry) continue;
    out.push({ entry, confidence: IMAGE_MATCH_THRESHOLD_THEMATIC + 0.01 });
  }
  return diversifyTop(out, item.pmid + "fallback");
}

const urlHealthCache = new Map<string, boolean>();

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

async function firstReachableMatch(
  ranked: Array<{ entry: CatalogEntry; confidence: number }>,
  tier: StoryImageMatch["tier"]
): Promise<StoryImageMatch | null> {
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
      tier,
    };
  }
  return null;
}

export async function matchStoryImage(
  item: StoryImageFields,
  usedIds: Set<string> = new Set(),
  mode: ScoreMode = "strict"
): Promise<StoryImageMatch | null> {
  const threshold =
    mode === "strict" ? IMAGE_MATCH_THRESHOLD : IMAGE_MATCH_THRESHOLD_THEMATIC;
  const ranked = rankCandidates(item, usedIds, mode, threshold);
  const matched = await firstReachableMatch(
    ranked,
    mode === "strict" ? "strict" : "thematic"
  );
  if (matched) return matched;

  if (mode === "thematic") {
    return firstReachableMatch(thematicFallbackCandidates(item, usedIds), "thematic");
  }
  return null;
}

/**
 * Two-tier assignment:
 * 1) Strict matches for every story (lead/featured quality).
 * 2) Thematic / setting-fallback matches for remaining stories (compact cards).
 */
export async function assignStoryImages(
  items: BriefItem[]
): Promise<Record<string, StoryImageMatch | null>> {
  const usedIds = new Set<string>();
  const out: Record<string, StoryImageMatch | null> = {};

  for (const item of items) {
    const match = await matchStoryImage(item, usedIds, "strict");
    if (match) usedIds.add(match.id);
    out[item.pmid] = match;
  }

  for (const item of items) {
    if (out[item.pmid]) continue;
    const match = await matchStoryImage(item, usedIds, "thematic");
    if (match) usedIds.add(match.id);
    out[item.pmid] = match;
  }

  return out;
}
