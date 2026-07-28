import type { ArticleSetting } from "@/lib/classifySetting";
import { scoreAllSettings } from "@/lib/classifySetting";
import type { BriefItem } from "@/lib/brief/items";

/** URL setting values for the brief pill bar. */
export type BriefSettingFilter =
  | ""
  | "hospital"
  | "community"
  | "long-term care"
  | "global-health";

export const BRIEF_SETTING_OPTIONS: {
  value: BriefSettingFilter;
  label: string;
}[] = [
  { value: "", label: "All" },
  { value: "hospital", label: "Hospital" },
  { value: "community", label: "Community" },
  { value: "long-term care", label: "Long-term care" },
  { value: "global-health", label: "Global Health" },
];

export function parseBriefSetting(raw: string | undefined): BriefSettingFilter {
  const v = raw?.trim().toLowerCase() ?? "";
  if (
    v === "hospital" ||
    v === "community" ||
    v === "long-term care" ||
    v === "global-health"
  ) {
    return v;
  }
  return "";
}

function matchesGlobalHealth(item: BriefItem): boolean {
  if (item.setting === "environment" || item.setting === "animal") return true;
  const text =
    `${item.title} ${item.keywords.join(" ")} ${item.bottomLine ?? ""}`.toLowerCase();
  return (
    text.includes("global health") ||
    text.includes("one health") ||
    text.includes("low-income") ||
    text.includes("lmic") ||
    text.includes("world health") ||
    text.includes("international")
  );
}

/** Soft match score floor so Top 10 capsules can fill when auto-class is null. */
const SOFT_SETTING_MIN = 3;

export function matchesBriefSettingFilter(
  item: BriefItem,
  filter: BriefSettingFilter,
  soft = false
): boolean {
  if (!filter) return true;
  if (filter === "global-health") {
    if (matchesGlobalHealth(item)) return true;
    if (!soft) return false;
    const scores = scoreAllSettings({
      title: item.title,
      abstract: null,
      keywords: item.keywords,
    });
    return (
      scores.animal >= SOFT_SETTING_MIN ||
      scores.environment >= SOFT_SETTING_MIN
    );
  }
  if (item.setting === filter) return true;
  if (!soft) return false;

  const target = filter as ArticleSetting;
  const scores = scoreAllSettings({
    title: item.title,
    abstract: null,
    keywords: item.keywords,
  });
  return (scores[target] ?? 0) >= SOFT_SETTING_MIN;
}

export function briefSettingLabel(
  setting: ArticleSetting | null
): string | null {
  if (!setting) return null;
  const labels: Record<ArticleSetting, string> = {
    hospital: "Hospital",
    community: "Outpatient / Primary care",
    "long-term care": "Long-term care",
    animal: "Global Health",
    environment: "Global Health",
  };
  return labels[setting] ?? setting;
}
