import "server-only";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

/** All active brief email subscribers (lowercased, deduped). */
export async function getBriefSubscribers(): Promise<string[]> {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("brief_subscribers")
      .select("email")
      .order("created_at", { ascending: true });

    if (error) {
      if (error.message.toLowerCase().includes("brief_subscribers")) {
        return [];
      }
      throw new Error(error.message);
    }

    return [
      ...new Set(
        (data ?? [])
          .map((r) => String((r as { email?: string }).email ?? "").trim().toLowerCase())
          .filter((e) => e.includes("@"))
      ),
    ];
  } catch {
    return [];
  }
}

export async function countBriefSubscribers(): Promise<number> {
  const list = await getBriefSubscribers();
  return list.length;
}

/** Remove a subscriber by email. Returns whether a row was deleted. */
export async function removeBriefSubscriber(email: string): Promise<{
  removed: boolean;
  error?: string;
}> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) {
    return { removed: false, error: "Invalid email" };
  }

  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("brief_subscribers")
      .delete()
      .eq("email", normalized)
      .select("email");

    if (error) {
      if (error.message.toLowerCase().includes("brief_subscribers")) {
        return {
          removed: false,
          error:
            "Signup storage not ready — run scripts/add_brief_subscribers.sql in Supabase.",
        };
      }
      return { removed: false, error: error.message };
    }

    return { removed: (data?.length ?? 0) > 0 };
  } catch (err) {
    return {
      removed: false,
      error: err instanceof Error ? err.message : "Unsubscribe failed",
    };
  }
}
