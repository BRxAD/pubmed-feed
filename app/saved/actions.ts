"use server";

import {
  loadAccountSavedArticles,
  pushAndLoadSavedArticles,
  writeSavedArticle,
} from "@/lib/savedArticlesService";
import {
  sanitizeSavedItem,
  type SavedBriefItem,
} from "@/lib/savedArticleTypes";
import { getBriefItemsForSaved } from "@/lib/brief/savedBriefItems";
import type { BriefItem } from "@/lib/brief/items";

export async function listMySavedArticles(): Promise<{
  items: SavedBriefItem[];
  error?: string;
}> {
  return loadAccountSavedArticles();
}

export async function toggleMySavedArticle(input: {
  pmid: string;
  title?: string | null;
  pubmedUrl?: string | null;
  saved: boolean;
}): Promise<{ ok: true; items?: SavedBriefItem[] } | { ok: false; error: string }> {
  const result = await writeSavedArticle(input);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, items: result.items };
}

export async function syncLocalSavedArticles(
  incoming: SavedBriefItem[]
): Promise<{ items: SavedBriefItem[]; error?: string }> {
  return pushAndLoadSavedArticles(incoming);
}

export async function hydrateMySavedArticles(
  incoming: SavedBriefItem[]
): Promise<{ items: BriefItem[]; error?: string }> {
  const cleaned = incoming
    .map((item) => sanitizeSavedItem(item))
    .filter((item): item is SavedBriefItem => Boolean(item));
  if (cleaned.length === 0) return { items: [] };
  try {
    const items = await getBriefItemsForSaved(cleaned);
    return { items };
  } catch (err) {
    return {
      items: [],
      error:
        err instanceof Error ? err.message : "Could not load saved story details",
    };
  }
}
