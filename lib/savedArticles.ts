import "server-only";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import {
  capSavedItems,
  sanitizePmid,
  sanitizeSavedItem,
  type SavedBriefItem,
} from "@/lib/savedArticleTypes";

type SavedRow = {
  pmid: string;
  title: string | null;
  pubmed_url: string | null;
};

function rowToItem(row: SavedRow): SavedBriefItem | null {
  return sanitizeSavedItem({
    pmid: row.pmid,
    title: row.title,
    pubmedUrl: row.pubmed_url,
  });
}

function isMissingTable(message: string | undefined): boolean {
  const m = (message ?? "").toLowerCase();
  return m.includes("schema cache") || m.includes("does not exist");
}

function publicSavedError(message: string | undefined): string | undefined {
  if (!message) return undefined;
  if (isMissingTable(message)) {
    return "Saved-article storage is not ready. Run scripts/add_next_auth.sql in Supabase.";
  }
  // Never surface raw Postgres / FK noise in the product UI.
  return undefined;
}

export async function listSavedArticles(
  userId: string
): Promise<{ items: SavedBriefItem[]; error?: string }> {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("saved_articles")
      .select("pmid, title, pubmed_url")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.warn("[savedArticles] list failed:", error.message);
      return { items: [], error: publicSavedError(error.message) };
    }

    const items = (data as SavedRow[] | null)
      ?.map(rowToItem)
      .filter((item): item is SavedBriefItem => Boolean(item));
    return { items: items ?? [] };
  } catch (err) {
    return {
      items: [],
      error:
        err instanceof Error ? publicSavedError(err.message) : undefined,
    };
  }
}

export async function setSavedArticle(
  userId: string,
  item: SavedBriefItem,
  saved: boolean
): Promise<{ success: boolean; error?: string }> {
  const clean = sanitizeSavedItem(item);
  if (!clean) return { success: false, error: "That article id is not valid." };

  try {
    const supabase = getSupabaseServerClient();
    if (!saved) {
      const { error } = await supabase
        .from("saved_articles")
        .delete()
        .eq("user_id", userId)
        .eq("pmid", clean.pmid);
      if (error) return { success: false, error: publicSavedError(error.message) };
      return { success: true };
    }

    const { error } = await supabase.from("saved_articles").upsert(
      {
        user_id: userId,
        pmid: clean.pmid,
        title: clean.title,
        pubmed_url: clean.pubmedUrl,
      },
      { onConflict: "user_id,pmid" }
    );
    if (error) {
      console.warn("[savedArticles] upsert failed:", error.message);
      return { success: false, error: publicSavedError(error.message) };
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? publicSavedError(err.message) : undefined,
    };
  }
}

export async function mergeSavedArticles(
  userId: string,
  incoming: SavedBriefItem[]
): Promise<{ items: SavedBriefItem[]; error?: string }> {
  const cleaned = capSavedItems(
    incoming
      .map((item) => sanitizeSavedItem(item))
      .filter((item): item is SavedBriefItem => Boolean(item))
  );
  if (cleaned.length === 0) return listSavedArticles(userId);

  try {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("saved_articles").upsert(
      cleaned.map((item) => ({
        user_id: userId,
        pmid: item.pmid,
        title: item.title,
        pubmed_url: item.pubmedUrl,
      })),
      { onConflict: "user_id,pmid" }
    );
    if (error) {
      console.warn("[savedArticles] merge failed:", error.message);
      const publicError = publicSavedError(error.message);
      return { items: [], error: publicError };
    }
    return listSavedArticles(userId);
  } catch (err) {
    return {
      items: [],
      error:
        err instanceof Error ? publicSavedError(err.message) : undefined,
    };
  }
}

export function isValidPmid(raw: unknown): boolean {
  return Boolean(sanitizePmid(raw));
}
