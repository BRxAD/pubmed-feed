import "server-only";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export type BriefAnnouncement = {
  id?: string;
  title: string;
  body: string;
  active: boolean;
  updatedAt?: string;
};

export const DEFAULT_ANNOUNCEMENT: BriefAnnouncement = {
  id: "active",
  title: "",
  body: "",
  active: false,
};

/** Load the active announcement if enabled and has content. */
export async function getActiveAnnouncement(): Promise<BriefAnnouncement | null> {
  const config = await getAnnouncementConfig();
  if (config.active && (config.title.trim() || config.body.trim())) {
    return config;
  }
  return null;
}

/** Load announcement record for admin preview/editing. */
export async function getAnnouncementConfig(): Promise<BriefAnnouncement> {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("brief_announcements")
      .select("id, title, body, active, updated_at")
      .eq("id", "active")
      .maybeSingle();

    if (error) {
      if (!error.message.toLowerCase().includes("brief_announcements")) {
        console.warn("[announcements] load failed:", error.message);
      }
      return DEFAULT_ANNOUNCEMENT;
    }

    if (!data) return DEFAULT_ANNOUNCEMENT;

    return {
      id: "active",
      title: String((data as { title?: string }).title ?? "").trim(),
      body: String((data as { body?: string }).body ?? "").trim(),
      active: Boolean((data as { active?: boolean }).active),
      updatedAt: String((data as { updated_at?: string }).updated_at ?? ""),
    };
  } catch (err) {
    console.warn("[announcements] load error:", err);
    return DEFAULT_ANNOUNCEMENT;
  }
}

/** Upsert the active announcement configuration. */
export async function updateAnnouncementConfig(input: {
  title: string;
  body: string;
  active: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("brief_announcements").upsert(
      {
        id: "active",
        title: input.title.trim(),
        body: input.body.trim(),
        active: Boolean(input.active),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Save announcement failed",
    };
  }
}
