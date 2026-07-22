import "server-only";
import type { ArticleSetting } from "@/lib/classifySetting";
import type { BriefItem } from "@/lib/brief/items";
import {
  IMAGE_MATCH_THRESHOLD,
  type StoryImageMatch,
} from "@/lib/brief/storyImageTypes";
import {
  STORY_IMAGE_CATALOG,
  type CatalogEntry,
} from "@/lib/brief/storyImageCatalog";

export type { StoryImageMatch };
export { IMAGE_MATCH_THRESHOLD };

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

  if (matchedCount < 2 && strongHits < 1) return 0;
  if (matchedWeight < 1.7) return 0;

  let score = Math.min(1, matchedWeight / 4.0);

  if (setting && entry.settings?.includes(setting) && matchedCount >= 2) {
    score = Math.min(1, score + 0.08);
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
  item: Pick<
    BriefItem,
    "pmid" | "headline" | "title" | "bottomLine" | "keywords" | "setting" | "methods"
  >,
  usedIds: Set<string>
): Array<{ entry: CatalogEntry; confidence: number }> {
  const corpus = storyCorpus(item);
  const ranked: Array<{ entry: CatalogEntry; confidence: number }> = [];

  for (const entry of STORY_IMAGE_CATALOG) {
    if (usedIds.has(entry.id)) continue;
    const confidence = scoreEntry(corpus, item.setting, entry);
    if (confidence > IMAGE_MATCH_THRESHOLD) {
      ranked.push({ entry, confidence });
    }
  }

  ranked.sort((a, b) => b.confidence - a.confidence);
  return diversifyTop(ranked, item.pmid + item.headline);
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
