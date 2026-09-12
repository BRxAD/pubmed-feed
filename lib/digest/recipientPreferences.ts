import "server-only";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import {
  DEFAULT_USER_PREFERENCES,
  sanitizeUserPreferences,
  type UserPreferences,
} from "@/lib/userPreferences";
import type { BriefItem } from "@/lib/brief/items";
import {
  matchesBriefSettingFilter,
  type BriefSettingFilter,
} from "@/lib/brief/settingFilter";
import {
  matchesBriefTopicFilter,
  type BriefTopicFilter,
} from "@/lib/brief/topicFilter";

/** Same floor as Top 10 — “only highest impact” in account prefs. */
export const HIGH_IMPACT_EMAIL_MIN_PRIORITY = 6;

/**
 * Load account email preferences keyed by lowercased email.
 * Subscribers without an account row keep the defaults (daily, all important).
 */
export async function getPreferencesByEmails(
  emails: string[]
): Promise<Map<string, UserPreferences>> {
  const map = new Map<string, UserPreferences>();
  const normalized = [
    ...new Set(
      emails
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes("@"))
    ),
  ];
  for (const email of normalized) {
    map.set(email, { ...DEFAULT_USER_PREFERENCES });
  }
  if (normalized.length === 0) return map;

  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("auth_users")
      .select(
        "email, email_frequency, settings_tags, topics_tags, high_impact_only, include_news"
      )
      .in("email", normalized);

    if (error) {
      console.warn("[digest] preference load failed:", error.message);
      return map;
    }

    for (const row of data ?? []) {
      const email = String(
        (row as { email?: string | null }).email ?? ""
      )
        .trim()
        .toLowerCase();
      if (!email) continue;
      const r = row as {
        email_frequency?: string | null;
        settings_tags?: string[] | null;
        topics_tags?: string[] | null;
        high_impact_only?: boolean | null;
        include_news?: boolean | null;
      };
      map.set(
        email,
        sanitizeUserPreferences({
          emailFrequency: r.email_frequency,
          settingsTags: r.settings_tags ?? [],
          topicsTags: r.topics_tags ?? [],
          highImpactOnly: r.high_impact_only ?? false,
          includeNews: r.include_news ?? true,
        })
      );
    }
  } catch (err) {
    console.warn(
      "[digest] preference load error:",
      err instanceof Error ? err.message : err
    );
  }

  return map;
}

/** Whether this recipient should get a Brief email on this calendar day (ET). */
export function shouldSendBriefEmailToday(
  prefs: UserPreferences,
  now: Date = new Date()
): boolean {
  if (prefs.emailFrequency === "none") return false;
  if (prefs.emailFrequency === "daily") return true;
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "America/New_York",
  }).format(now);
  return weekday === "Mon";
}

/** Apply which-articles / setting / topic prefs to a digest item list. */
export function filterBriefItemsForPreferences(
  items: BriefItem[],
  prefs: UserPreferences
): BriefItem[] {
  let out = items;

  if (prefs.highImpactOnly) {
    out = out.filter(
      (item) => item.effectivePriority >= HIGH_IMPACT_EMAIL_MIN_PRIORITY
    );
  }

  if (prefs.settingsTags.length > 0) {
    out = out.filter((item) =>
      prefs.settingsTags.some((tag) =>
        matchesBriefSettingFilter(item, tag as BriefSettingFilter)
      )
    );
  }

  if (prefs.topicsTags.length > 0) {
    out = out.filter((item) =>
      prefs.topicsTags.some((tag) =>
        matchesBriefTopicFilter(item, tag as BriefTopicFilter)
      )
    );
  }

  return out;
}
