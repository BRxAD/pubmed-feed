import {
  ARTICLE_SETTING_LABELS,
  type ArticleSetting,
} from "@/lib/classifySetting";
import { scoreAllSettings } from "@/lib/classifySetting";
import type { BriefItem } from "@/lib/brief/items";

/** URL setting values for the brief pill bar. */
export type BriefSettingFilter =
  | ""
  | "hospital"
  | "community"
  | "long-term care"
  | "dentistry"
  | "one-health"
  | "global-health";

export const BRIEF_SETTING_OPTIONS: {
  value: BriefSettingFilter;
  label: string;
}[] = [
  { value: "", label: "All" },
  { value: "hospital", label: "Hospital" },
  { value: "community", label: "Outpatient" },
  { value: "long-term care", label: "Long-term care" },
  { value: "dentistry", label: "Dentistry" },
  { value: "one-health", label: "One Health" },
  { value: "global-health", label: "Global Health" },
];

export function parseBriefSetting(raw: string | undefined): BriefSettingFilter {
  const v = raw?.trim().toLowerCase() ?? "";
  if (
    v === "hospital" ||
    v === "community" ||
    v === "long-term care" ||
    v === "dentistry" ||
    v === "one-health" ||
    v === "global-health"
  ) {
    return v;
  }
  return "";
}

function itemSettings(item: BriefItem): ArticleSetting[] {
  if (item.settings?.length) return item.settings;
  if (item.setting) return [item.setting];
  return [];
}

/** Soft match score floor so Top 10 capsules can fill when auto-class is null. */
const SOFT_SETTING_MIN = 3;

export function matchesBriefSettingFilter(
  item: BriefItem,
  filter: BriefSettingFilter,
  soft = false
): boolean {
  if (!filter) return true;

  const settings = itemSettings(item);

  if (filter === "global-health") {
    if (
      settings.includes("global-health") ||
      settings.includes("environment")
    ) {
      return true;
    }
  } else if (filter === "one-health") {
    if (settings.includes("one-health") || settings.includes("animal")) {
      return true;
    }
  } else if (settings.includes(filter as ArticleSetting)) {
    return true;
  }

  if (!soft) return false;

  const scores = scoreAllSettings({
    title: item.title,
    abstract: null,
    keywords: item.keywords,
  });

  if (filter === "global-health") {
    return (
      (scores["global-health"] ?? 0) >= SOFT_SETTING_MIN ||
      (scores.environment ?? 0) >= SOFT_SETTING_MIN
    );
  }
  if (filter === "one-health") {
    return (
      (scores["one-health"] ?? 0) >= SOFT_SETTING_MIN ||
      (scores.animal ?? 0) >= SOFT_SETTING_MIN
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
