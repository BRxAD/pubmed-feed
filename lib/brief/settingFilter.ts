import {
  ARTICLE_SETTING_LABELS,
  type ArticleSetting,
} from "@/lib/classifySetting";
import { scoreAllSettings } from "@/lib/classifySetting";
import type { BriefItem } from "@/lib/brief/items";

/**
 * URL setting values for the brief pill bar.
 * Dentistry and long-term care stay in the classifier / feed admin, but are
 * not offered as homepage capsules.
 */
export type BriefSettingFilter =
  | ""
  | "hospital"
  | "community"
  | "one-health";

export const BRIEF_SETTING_OPTIONS: {
  value: BriefSettingFilter;
  label: string;
}[] = [
  { value: "", label: "All" },
  { value: "hospital", label: "Hospital" },
  { value: "community", label: "Community" },
  { value: "one-health", label: "One Health / Global" },
];

export function parseBriefSetting(raw: string | undefined): BriefSettingFilter {
  const v = raw?.trim().toLowerCase() ?? "";
  if (v === "hospital" || v === "community" || v === "one-health") {
    return v;
  }
  // Legacy URLs: former Global Health tab → combined One Health / Global
  if (v === "global-health") return "one-health";
  return "";
}

function itemSettings(item: BriefItem): ArticleSetting[] {
  if (item.settings?.length) return item.settings;
  if (item.setting) return [item.setting];
  return [];
}

/** Soft match score floor so Top 10 capsules can fill when auto-class is null. */
const SOFT_SETTING_MIN = 3;

const ONE_HEALTH_GLOBAL_SETTINGS: ArticleSetting[] = [
  "one-health",
  "global-health",
  "animal",
  "environment",
];

export function matchesBriefSettingFilter(
  item: BriefItem,
  filter: BriefSettingFilter,
  soft = false
): boolean {
  if (!filter) return true;

  const settings = itemSettings(item);

  if (filter === "one-health") {
    if (ONE_HEALTH_GLOBAL_SETTINGS.some((s) => settings.includes(s))) {
      return true;
    }
  } else if (settings.includes(filter as ArticleSetting)) {
    return true;
  }

  // Human admin override is exclusive: never soft-match into another capsule.
  if (!soft || item.adminSetting) return false;

  const scores = scoreAllSettings({
    title: item.title,
    abstract: null,
    keywords: item.keywords,
  });

  if (filter === "one-health") {
    return ONE_HEALTH_GLOBAL_SETTINGS.some(
      (s) => (scores[s] ?? 0) >= SOFT_SETTING_MIN
    );
  }

  return (scores[filter as ArticleSetting] ?? 0) >= SOFT_SETTING_MIN;
}

export function briefSettingLabel(
  setting: ArticleSetting | null
): string | null {
  if (!setting) return null;
  return ARTICLE_SETTING_LABELS[setting] ?? setting;
}

export function briefSettingsLabel(
  settings: ArticleSetting[] | null | undefined,
  primary?: ArticleSetting | null
): string | null {
  const list =
    settings && settings.length > 0
      ? settings
      : primary
        ? [primary]
        : [];
  if (list.length === 0) return null;
  return list.map((s) => ARTICLE_SETTING_LABELS[s] ?? s).join(" · ");
}
