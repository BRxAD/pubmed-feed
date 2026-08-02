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

/** Never assign these — repeatedly mis-matched or user-rejected stock. */
const BLOCKED_IMAGE_URL_PARTS = [
  "photo-1532094349884", // fluorescent eukaryotic cells (not bacteria)
  "photo-1530026405186", // mislabeled culture/cells stock
  "photo-1576086213369", // clinical lab aisle — over-matched
  "photos/7089020", // team huddle — over-matched generic
  "/brief-images/heart-endocarditis",
  "/brief-images/brain-meningitis-cns",
] as const;

const BLOCKED_IMAGE_IDS = new Set([
  "light-microscope-art",
  "petri-culture",
  "lab-microscope",
  "pexels-team-huddle",
  "local-heart-endocarditis",
  "local-brain-meningitis-cns",
  "mri-diagnostics",
]);

function isBlockedCatalogEntry(entry: CatalogEntry): boolean {
  if (BLOCKED_IMAGE_IDS.has(entry.id)) return true;
  return BLOCKED_IMAGE_URL_PARTS.some((part) => entry.url.includes(part));
}

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

type UsageTracker = {
  ids: Set<string>;
  urls: Set<string>;
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Phrase / token match with word boundaries for single tokens.
 * Prevents "cns" / "ct" / "ai" matching inside unrelated words, and
 * "heart"/"brain" matching as substrings.
 */
function corpusHas(corpus: string, raw: string): boolean {
  const needle = raw.toLowerCase().trim();
  if (!needle) return false;
  if (needle.includes(" ") || needle.includes("-") || needle.includes(".")) {
    return corpus.includes(needle);
  }
  const re = new RegExp(
    `(^|[^a-z0-9])${escapeRegExp(needle)}([^a-z0-9]|$)`,
    "i"
  );
  return re.test(corpus);
}

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
  return entry.requireAny.some((req) => corpusHas(corpus, req));
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
    if (!corpusHas(corpus, t)) continue;
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
    // Thematic still needs a real topical hit — setting alone is not enough.
    if (matchedCount < 1) return 0;
    if (matchedWeight < 1.25) return 0;
    if (strongHits < 1 && matchedCount < 2) return 0;
  }

  let score = Math.min(1, matchedWeight / 4.0);

  if (setting && entry.settings?.includes(setting) && matchedCount >= 2) {
    score = Math.min(1, score + (mode === "strict" ? 0.08 : 0.06));
  }

  if (entry.source === "wikimedia") score = Math.min(1, score + 0.02);
  // Prefer curated local topic photos when tags already match.
  if (entry.source === "local") score = Math.min(1, score + 0.04);

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

function isUnused(entry: CatalogEntry, used: UsageTracker): boolean {
  return !used.ids.has(entry.id) && !used.urls.has(entry.url);
}

function markUsed(entry: CatalogEntry, used: UsageTracker): void {
  used.ids.add(entry.id);
  used.urls.add(entry.url);
}

function rankCandidates(
  item: StoryImageFields,
  used: UsageTracker,
  mode: ScoreMode,
  threshold: number
): Array<{ entry: CatalogEntry; confidence: number }> {
  const corpus = storyCorpus(item);
  const ranked: Array<{ entry: CatalogEntry; confidence: number }> = [];

  for (const entry of STORY_IMAGE_CATALOG) {
    if (!isUnused(entry, used)) continue;
    if (isBlockedCatalogEntry(entry)) continue;
    const confidence = scoreEntry(corpus, item.setting, entry, mode);
    if (confidence > threshold) {
      ranked.push({ entry, confidence });
    }
  }

  ranked.sort((a, b) => b.confidence - a.confidence);
  return diversifyTop(ranked, item.pmid + item.headline + mode);
}

/** Generic stewardship photos only — never organ-specific scenes. */
function genericFallbackCandidates(
  item: StoryImageFields,
  used: UsageTracker
): Array<{ entry: CatalogEntry; confidence: number }> {
  const corpus = storyCorpus(item);
  const stewardshipCue =
    corpusHas(corpus, "antibiotic") ||
    corpusHas(corpus, "stewardship") ||
    corpusHas(corpus, "antimicrobial") ||
    corpusHas(corpus, "prescribing") ||
    Boolean(item.setting);

  if (!stewardshipCue) return [];

  const out: Array<{ entry: CatalogEntry; confidence: number }> = [];
  for (const entry of STORY_IMAGE_CATALOG) {
    if (!entry.generic) continue;
    if (!isUnused(entry, used)) continue;
    if (isBlockedCatalogEntry(entry)) continue;
    out.push({
      entry,
      confidence: IMAGE_MATCH_THRESHOLD_THEMATIC,
    });
  }
  return diversifyTop(out, item.pmid + "generic");
}

const urlHealthCache = new Map<string, boolean>();

export async function isImageUrlReachable(url: string): Promise<boolean> {
  const cached = urlHealthCache.get(url);
  if (cached != null) return cached;

  // Local public assets — skip remote HEAD (relative paths fail server-side fetch).
  if (url.startsWith("/")) {
    urlHealthCache.set(url, true);
    return true;
  }

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
  tier: StoryImageMatch["tier"],
  used: UsageTracker
): Promise<StoryImageMatch | null> {
  for (const { entry, confidence } of ranked) {
    if (!isUnused(entry, used)) continue;
    const ok = await isImageUrlReachable(entry.url);
    if (!ok) {
      console.warn(`[storyImages] broken image skipped: ${entry.id} ${entry.url}`);
      continue;
    }
    markUsed(entry, used);
    return {
      id: entry.id,
      url: entry.url,
      confidence,
      label: entry.label,
      tier,
      isGeneric: Boolean(entry.generic),
    };
  }
  return null;
}

export async function matchStoryImage(
  item: StoryImageFields,
  used: UsageTracker = { ids: new Set(), urls: new Set() },
  mode: ScoreMode = "strict"
): Promise<StoryImageMatch | null> {
  const threshold =
    mode === "strict" ? IMAGE_MATCH_THRESHOLD : IMAGE_MATCH_THRESHOLD_THEMATIC;
  const ranked = rankCandidates(item, used, mode, threshold);
  const matched = await firstReachableMatch(
    ranked,
    mode === "strict" ? "strict" : "thematic",
    used
  );
  if (matched) return matched;

  if (mode === "thematic") {
    // Prefer no image over an irrelevant organ/scene photo.
    return firstReachableMatch(
      genericFallbackCandidates(item, used),
      "thematic",
      used
    );
  }
  return null;
}

/**
 * Two-tier assignment with hard uniqueness on catalog id AND url.
 * Prefer null over a weak / irrelevant match.
 */
export async function assignStoryImages(
  items: BriefItem[]
): Promise<Record<string, StoryImageMatch | null>> {
  const used: UsageTracker = { ids: new Set(), urls: new Set() };
  const out: Record<string, StoryImageMatch | null> = {};

  for (const item of items) {
    out[item.pmid] = await matchStoryImage(item, used, "strict");
  }

  for (const item of items) {
    if (out[item.pmid]) continue;
    out[item.pmid] = await matchStoryImage(item, used, "thematic");
  }

  // Final safety: drop any accidental URL collisions (keep first).
  const seenUrls = new Set<string>();
  for (const item of items) {
    const match = out[item.pmid];
    if (!match) continue;
    if (seenUrls.has(match.url)) {
      console.warn(
        `[storyImages] duplicate url dropped for pmid ${item.pmid}: ${match.id}`
      );
      out[item.pmid] = null;
      continue;
    }
    seenUrls.add(match.url);
  }

  return out;
}
