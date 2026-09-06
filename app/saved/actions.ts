"use server";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import {
  listSavedArticles,
  mergeSavedArticles,
  setSavedArticle,
} from "@/lib/savedArticles";
import {
  sanitizeSavedItem,
  type SavedBriefItem,
} from "@/lib/savedArticleTypes";
import { getBriefItemsForSaved } from "@/lib/brief/savedBriefItems";
import type { BriefItem } from "@/lib/brief/items";

async function requireUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.id ?? null;
}

export async function listMySavedArticles(): Promise<{
  items: SavedBriefItem[];
  error?: string;
}> {
  const userId = await requireUserId();
  if (!userId) return { items: [] };
  return listSavedArticles(userId);
}

export async function toggleMySavedArticle(input: {
  pmid: string;
  title?: string | null;
  pubmedUrl?: string | null;
  saved: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "Please sign in to save articles." };

  const item = sanitizeSavedItem({
    pmid: input.pmid,
    title: input.title,
    pubmedUrl: input.pubmedUrl,
  });
  if (!item) return { ok: false, error: "That article id is not valid." };

  const result = await setSavedArticle(userId, item, input.saved);
  if (!result.success) {
    return { ok: false, error: result.error ?? "Could not update saved article." };
  }
  return { ok: true };
}

export async function syncLocalSavedArticles(
  incoming: SavedBriefItem[]
): Promise<{ items: SavedBriefItem[]; error?: string }> {
  const userId = await requireUserId();
  if (!userId) return { items: [] };
  return mergeSavedArticles(userId, incoming);
}

export async function hydrateMySavedArticles(
  incoming: SavedBriefItem[]
): Promise<{ items: BriefItem[]; error?: string }> {
  const userId = await requireUserId();
  if (!userId) return { items: [] };
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
