import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeSearchWindow,
  getDateNDaysAgo,
  getTodayISO,
} from "@/lib/pubmed/watermark";

type IngestStateRow = { last_publication_max: string };

export async function getOpenAlexWatermark(
  topicId: string,
  supabase: SupabaseClient
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("openalex_ingest_state")
      .select("last_publication_max")
      .eq("topic_id", topicId)
      .maybeSingle();

    if (error) {
      console.warn("[openalex watermark] get error:", error.message);
      return null;
    }
    return (data as IngestStateRow | null)?.last_publication_max ?? null;
  } catch (err) {
    console.warn("[openalex watermark] get threw:", err);
    return null;
  }
}

export async function setOpenAlexWatermark(
  topicId: string,
  maxdate: string,
  supabase: SupabaseClient
): Promise<void> {
  try {
    const { error } = await supabase.from("openalex_ingest_state").upsert(
      {
        topic_id: topicId,
        last_publication_max: maxdate,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "topic_id" }
    );
    if (error) {
      console.warn("[openalex watermark] set error:", error.message);
    }
  } catch (err) {
    console.warn("[openalex watermark] set threw:", err);
  }
}

export function computeOpenAlexWindow(lastMax: string | null): {
  mindate: string;
  maxdate: string;
  isFirstRun: boolean;
} {
  return computeSearchWindow(lastMax);
}

export { getDateNDaysAgo, getTodayISO };
