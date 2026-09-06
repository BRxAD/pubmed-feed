"use server";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { ensureAuthUserId } from "@/lib/ensureAuthUser";
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

async function requireAuthUserId(): Promise<
  { id: string } | { error: string }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { error: "Please sign in to save articles." };
  }
  return ensureAuthUserId({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image,
  });
}

export async function listMySavedArticles(): Promise<{
  items: SavedBriefItem[];
  error?: string;
}> {
  const auth = await requireAuthUserId();
  if ("error" in auth) return { items: [] };
  return listSavedArticles(auth.id);
}

export async function toggleMySavedArticle(input: {
  pmid: string;
  title?: string | null;
  pubmedUrl?: string | null;
  saved: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireAuthUserId();
  if ("error" in auth) return { ok: false, error: auth.error };

  const item = sanitizeSavedItem({
    pmid: input.pmid,
    title: input.title,
    pubmedUrl: input.pubmedUrl,
  });
  if (!item) return { ok: false, error: "That article id is not valid." };

  const result = await setSavedArticle(auth.id, item, input.saved);
  if (!result.success) {
    return { ok: false, error: result.error ?? "Could not update saved article." };
  }
  return { ok: true };
}

export async function syncLocalSavedArticles(
  incoming: SavedBriefItem[]
): Promise<{ items: SavedBriefItem[]; error?: string }> {
  const auth = await requireAuthUserId();
  if ("error" in auth) return { items: incoming, error: auth.error };
  return mergeSavedArticles(auth.id, incoming);
}

export async function hydrateMySavedArticles(
  incoming: SavedBriefItem[]
): Promise<{ items: BriefItem[]; error?: string }> {
  const auth = await requireAuthUserId();
  if ("error" in auth) return { items: [] };
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
