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
