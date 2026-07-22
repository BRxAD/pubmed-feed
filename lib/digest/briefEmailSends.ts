import "server-only";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

/** PMIDs already included in a prior brief digest email. */
export async function getPreviouslyEmailedPmids(): Promise<Set<string>> {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("brief_email_sends")
      .select("pmid")
      .limit(5000);

    if (error) {
      if (error.message.toLowerCase().includes("brief_email_sends")) {
        return new Set();
      }
      console.warn("[briefEmailSends] load failed:", error.message);
      return new Set();
    }

    return new Set(
      (data ?? [])
        .map((r) => String((r as { pmid?: string }).pmid ?? "").trim())
        .filter(Boolean)
    );
  } catch {
    return new Set();
  }
}

export async function recordBriefEmailSends(pmids: string[]): Promise<void> {
  const unique = [...new Set(pmids.map((p) => p.trim()).filter(Boolean))];
  if (unique.length === 0) return;

  try {
    const supabase = getSupabaseServerClient();
    const rows = unique.map((pmid) => ({ pmid }));
    const { error } = await supabase
      .from("brief_email_sends")
      .upsert(rows, { onConflict: "pmid" });

    if (error && !error.message.toLowerCase().includes("brief_email_sends")) {
      console.warn("[briefEmailSends] record failed:", error.message);
    }
  } catch (err) {
    console.warn("[briefEmailSends] record failed:", err);
  }
}
