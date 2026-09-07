import "server-only";
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

export async function resolveSavedUserId(): Promise<
  { id: string } | { error: string }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email && !session?.user?.id) {
    return { error: "Please sign in to save articles." };
  }
  return ensureAuthUserId({
    id: session?.user?.id,
    email: session?.user?.email,
    name: session?.user?.name,
    image: session?.user?.image,
  });
}

export async function loadAccountSavedArticles(): Promise<{
  items: SavedBriefItem[];
  error?: string;
}> {
  const auth = await resolveSavedUserId();
  if ("error" in auth) return { items: [], error: auth.error };
  return listSavedArticles(auth.id);
}

export async function pushAndLoadSavedArticles(
  incoming: SavedBriefItem[]
): Promise<{ items: SavedBriefItem[]; error?: string }> {
  const auth = await resolveSavedUserId();
  if ("error" in auth) return { items: incoming, error: auth.error };
  return mergeSavedArticles(auth.id, incoming);
}

export async function writeSavedArticle(input: {
  pmid: string;
  title?: string | null;
  pubmedUrl?: string | null;
  saved: boolean;
}): Promise<
  { ok: true; items: SavedBriefItem[] } | { ok: false; error: string }
> {
  const auth = await resolveSavedUserId();
  if ("error" in auth) return { ok: false, error: auth.error };

  const item = sanitizeSavedItem({
    pmid: input.pmid,
    title: input.title,
    pubmedUrl: input.pubmedUrl,
  });
  if (!item) return { ok: false, error: "That article id is not valid." };

  const result = await setSavedArticle(auth.id, item, input.saved);
  if (!result.success) {
    return {
      ok: false,
      error: result.error ?? "Could not update saved article.",
    };
  }

  const listed = await listSavedArticles(auth.id);
  return { ok: true, items: listed.items };
}
