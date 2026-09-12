import "server-only";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { listApprovedNewsForBrief } from "@/lib/news/store";
import type { NewsItem } from "@/lib/news/types";

/** News item IDs already included in a prior brief digest email. */
export async function getPreviouslyEmailedNewsIds(): Promise<Set<string>> {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("brief_news_email_sends")
      .select("news_id")
      .limit(5000);

    if (error) {
      if (error.message.toLowerCase().includes("brief_news_email_sends")) {
        return new Set();
      }
      console.warn("[briefNewsSends] load failed:", error.message);
      return new Set();
    }

    return new Set(
      (data ?? [])
        .map((r) => String((r as { news_id?: string }).news_id ?? "").trim())
        .filter(Boolean)
    );
  } catch {
    return new Set();
  }
}

/** Record that these news items have been included in an email brief. */
export async function recordBriefNewsEmailSends(
  newsIds: string[]
): Promise<void> {
  const unique = [...new Set(newsIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return;

  try {
    const supabase = getSupabaseServerClient();
    const rows = unique.map((news_id) => ({ news_id }));
    const { error } = await supabase
      .from("brief_news_email_sends")
      .upsert(rows, { onConflict: "news_id" });

    if (
      error &&
      !error.message.toLowerCase().includes("brief_news_email_sends")
    ) {
      console.warn("[briefNewsSends] record failed:", error.message);
    }
  } catch (err) {
    console.warn("[briefNewsSends] record failed:", err);
  }
}

/**
 * Fetch approved news items that have never been sent in a prior email brief.
 * Defaults to up to 3 stories, newest published first.
 */
export async function getUnsentApprovedNews(limit = 3): Promise<NewsItem[]> {
  try {
    const [allApproved, previouslySent] = await Promise.all([
      listApprovedNewsForBrief(Math.max(12, limit * 3)),
      getPreviouslyEmailedNewsIds(),
    ]);

    return allApproved
      .filter((item) => !previouslySent.has(item.id))
      .slice(0, Math.max(1, limit));
  } catch (err) {
    console.warn("[briefNewsSends] getUnsentApprovedNews failed:", err);
    return [];
  }
}
