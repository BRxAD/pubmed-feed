import { BRIEF_SETTING_OPTIONS } from "@/lib/brief/settingFilter";
import { BRIEF_TOPIC_OPTIONS } from "@/lib/brief/topicFilter";

export type EmailFrequency = "daily" | "weekly" | "none";

export type UserPreferences = {
  emailFrequency: EmailFrequency;
  settingsTags: string[];
  topicsTags: string[];
  highImpactOnly: boolean;
};

export const EMAIL_FREQUENCY_OPTIONS: {
  value: EmailFrequency;
  label: string;
  hint: string;
}[] = [
  {
    value: "daily",
    label: "Daily",
    hint: "Each morning, after the overnight scan.",
  },
  {
    value: "weekly",
    label: "Weekly",
    hint: "One roundup per week.",
  },
  {
    value: "none",
    label: "None",
    hint: "Pause email. Your account stays.",
  },
];

export const SETTINGS_TAG_OPTIONS = BRIEF_SETTING_OPTIONS.filter(
  (opt) => opt.value !== ""
);

export const TOPICS_TAG_OPTIONS = BRIEF_TOPIC_OPTIONS.filter(
  (opt) => opt.value !== ""
);

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  emailFrequency: "daily",
  settingsTags: [],
  topicsTags: [],
  highImpactOnly: false,
};

const ALLOWED_FREQUENCIES = new Set<EmailFrequency>(
  EMAIL_FREQUENCY_OPTIONS.map((o) => o.value)
);
const ALLOWED_SETTINGS = new Set<string>(
  SETTINGS_TAG_OPTIONS.map((o) => o.value)
);
const ALLOWED_TOPICS = new Set<string>(
  TOPICS_TAG_OPTIONS.map((o) => o.value)
);

export function parseEmailFrequency(raw: unknown): EmailFrequency {
  if (raw === "daily" || raw === "weekly" || raw === "none") return raw;
  return "daily";
}

export function sanitizeUserPreferences(input: {
  emailFrequency?: unknown;
  settingsTags?: unknown;
  topicsTags?: unknown;
  highImpactOnly?: unknown;
}): UserPreferences {
  const settingsTags = Array.isArray(input.settingsTags)
    ? input.settingsTags
        .map((v) => String(v ?? "").trim())
        .filter((v) => ALLOWED_SETTINGS.has(v))
    : [];
  const topicsTags = Array.isArray(input.topicsTags)
    ? input.topicsTags
        .map((v) => String(v ?? "").trim())
        .filter((v) => ALLOWED_TOPICS.has(v))
    : [];

  return {
    emailFrequency: parseEmailFrequency(input.emailFrequency),
    settingsTags: [...new Set(settingsTags)],
    topicsTags: [...new Set(topicsTags)],
    highImpactOnly: Boolean(input.highImpactOnly),
  };
}

export function isAllowedFrequency(value: string): value is EmailFrequency {
  return ALLOWED_FREQUENCIES.has(value as EmailFrequency);
}
