import "server-only";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import type { BriefItem } from "@/lib/brief/items";
import type { BriefSettingFilter } from "@/lib/brief/settingFilter";

const LEAD_SETTING_KEY = "brief_homepage_lead";

export type StickyLeadState = {
  pmid: string;
  /** Calendar date in America/New_York (YYYY-MM-DD). */
  dateEt: string;
  effectivePriority: number;
  updatedAt: string;
};

/** Today's date in Eastern Time as YYYY-MM-DD. */
export function easternDateIso(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

async function loadStickyLead(): Promise<StickyLeadState | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", LEAD_SETTING_KEY)
    .maybeSingle();

  if (error || !data?.value) return null;
  try {
    const parsed = JSON.parse(String(data.value)) as Partial<StickyLeadState>;
    if (
      typeof parsed.pmid !== "string" ||
      typeof parsed.dateEt !== "string" ||
      typeof parsed.effectivePriority !== "number"
    ) {
      return null;
    }
    return {
      pmid: parsed.pmid,
      dateEt: parsed.dateEt,
      effectivePriority: parsed.effectivePriority,
      updatedAt:
        typeof parsed.updatedAt === "string"
          ? parsed.updatedAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function saveStickyLead(state: StickyLeadState): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("app_settings").upsert(
    {
      key: LEAD_SETTING_KEY,
      value: JSON.stringify(state),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
  if (error) {
    console.warn("[brief/leadStory] failed to persist lead:", error.message);
  }
}

function withLeadFirst(items: BriefItem[], leadPmid: string): BriefItem[] {
  const lead = items.find((i) => i.pmid === leadPmid);
  if (!lead) return items;
  return [lead, ...items.filter((i) => i.pmid !== leadPmid)];
}

/**
 * Homepage-only sticky lead for the calendar day (Eastern midnight).
 *
 * - Ranking rules produce a natural candidate (items[0]) — recency-first or
 *   priority-first depending on brief settings.
 * - That candidate becomes the day's lead.
 * - Sticky only blocks *lower*-priority churn from stealing the lead mid-day.
 *   Equal or higher priority at natural #1 always wins (so a newer same-score
 *   story can replace yesterday's pin under lead-by-recency).
 * - Filtered setting views are left alone so sticky lead is not rewritten.
 */
export async function applyStickyHomepageLead(
  items: BriefItem[],
  setting: BriefSettingFilter
): Promise<BriefItem[]> {
  if (items.length === 0) return items;
  if (setting) return items;

  const todayEt = easternDateIso();
  const natural = items[0]!;
  const sticky = await loadStickyLead();

  const stickyInPool =
    sticky && sticky.dateEt === todayEt
      ? items.find((i) => i.pmid === sticky.pmid)
      : undefined;

  // New day, missing sticky, or lead left the pool → adopt natural #1.
  if (!stickyInPool) {
    await saveStickyLead({
      pmid: natural.pmid,
      dateEt: todayEt,
      effectivePriority: natural.effectivePriority,
      updatedAt: new Date().toISOString(),
    });
    return items;
  }

  // Natural #1 with equal-or-higher priority replaces sticky.
  if (
    natural.pmid !== stickyInPool.pmid &&
    natural.effectivePriority >= stickyInPool.effectivePriority
  ) {
    await saveStickyLead({
      pmid: natural.pmid,
      dateEt: todayEt,
      effectivePriority: natural.effectivePriority,
      updatedAt: new Date().toISOString(),
    });
    return items;
  }

  // Keep sticky lead; refresh stored priority if the lead was re-rated.
  if (
    sticky &&
    stickyInPool.effectivePriority !== sticky.effectivePriority
  ) {
    await saveStickyLead({
      pmid: stickyInPool.pmid,
      dateEt: todayEt,
      effectivePriority: stickyInPool.effectivePriority,
      updatedAt: new Date().toISOString(),
    });
  }

  return withLeadFirst(items, stickyInPool.pmid);
}
