"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { saveEmailPreferences } from "@/app/settings/actions";
import { brief } from "@/components/brief/briefTheme";
import {
  EMAIL_FREQUENCY_OPTIONS,
  SETTINGS_TAG_OPTIONS,
  TOPICS_TAG_OPTIONS,
  type UserPreferences,
} from "@/lib/userPreferences";

type Props = {
  email: string | null;
  initialPreferences: UserPreferences;
  /** When true, skip the signed-in / sign-out chrome (shown above by the page). */
  hideAccountChrome?: boolean;
};

function toggleInList(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

function CheckboxCard({
  checked,
  onChange,
  label,
  hint,
  name,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  hint?: string;
  name: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-sm border px-3 py-3 transition-colors ${
        checked
          ? "border-[#1C0B19] bg-[#EFECE4]"
          : "border-[#D8D4C8] bg-white hover:border-[#1C0B19]/40"
      }`}
    >
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={onChange}
        className="mt-1 accent-[#2A79A7]"
      />
      <span>
        <span className={`${brief.sans} text-sm ${brief.ink}`}>{label}</span>
        {hint ? (
          <p className={`mt-0.5 ${brief.sans} text-xs leading-relaxed ${brief.muted}`}>
            {hint}
          </p>
        ) : null}
      </span>
    </label>
  );
}

export default function EmailPreferencesDashboard({
  email,
  initialPreferences,
  hideAccountChrome = false,
}: Props) {
  const [preferences, setPreferences] =
    useState<UserPreferences>(initialPreferences);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setMessage("");
    const result = await saveEmailPreferences(preferences);
    if (!result.ok) {
      setStatus("error");
      setMessage(result.error);
      return;
    }
    setStatus("saved");
    setMessage(result.warning ?? "Preferences saved.");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-10">
      {!hideAccountChrome ? (
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#D8D4C8] pb-4">
          <div>
            <p className={brief.kicker}>Signed in</p>
            <p className={`mt-1 ${brief.sans} text-sm ${brief.ink}`}>
              {email ?? "Your account"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void signOut({ callbackUrl: "/settings" })}
            className={`${brief.action}`}
          >
            Sign out
          </button>
        </div>
      ) : null}

      <section>
        <h2 className={`${brief.kicker} mb-2`}>Email frequency</h2>
        <p className={`mb-4 ${brief.sans} text-sm ${brief.muted}`}>
          Choose how often we send the Brief. Pick one.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {EMAIL_FREQUENCY_OPTIONS.map((opt) => (
            <CheckboxCard
              key={opt.value}
              name="emailFrequency"
              checked={preferences.emailFrequency === opt.value}
              onChange={() =>
                setPreferences((prev) => ({
                  ...prev,
                  emailFrequency: opt.value,
                }))
              }
              label={opt.label}
              hint={opt.hint}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className={`${brief.kicker} mb-2`}>Care setting</h2>
        <p className={`mb-4 ${brief.sans} text-sm ${brief.muted}`}>
          Limit email to the settings you care about. Leave all unchecked to
          keep every setting.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {SETTINGS_TAG_OPTIONS.map((tag) => (
            <CheckboxCard
              key={tag.value}
              name="settingsTags"
              checked={preferences.settingsTags.includes(tag.value)}
              onChange={() =>
                setPreferences((prev) => ({
                  ...prev,
                  settingsTags: toggleInList(prev.settingsTags, tag.value),
                }))
              }
              label={tag.label}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className={`${brief.kicker} mb-2`}>Topics</h2>
        <p className={`mb-4 ${brief.sans} text-sm ${brief.muted}`}>
          Limit email to these topic capsules. Leave all unchecked to keep every
          topic.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {TOPICS_TAG_OPTIONS.map((tag) => (
            <CheckboxCard
              key={tag.value}
              name="topicsTags"
              checked={preferences.topicsTags.includes(tag.value)}
              onChange={() =>
                setPreferences((prev) => ({
                  ...prev,
                  topicsTags: toggleInList(prev.topicsTags, tag.value),
                }))
              }
              label={tag.label}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className={`${brief.kicker} mb-3`}>Which articles</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <CheckboxCard
            name="highImpactOnly"
            checked={!preferences.highImpactOnly}
            onChange={() =>
              setPreferences((prev) => ({ ...prev, highImpactOnly: false }))
            }
            label="All important articles"
            hint="Moderate and highest ranking articles."
          />
          <CheckboxCard
            name="highImpactOnly"
            checked={preferences.highImpactOnly}
            onChange={() =>
              setPreferences((prev) => ({ ...prev, highImpactOnly: true }))
            }
            label="Only highest impact"
            hint="Highest ranked articles."
          />
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-4 border-t border-[#D8D4C8] pt-6">
        <button
          type="submit"
          disabled={status === "saving"}
          className={`${brief.sans} inline-flex items-center justify-center rounded-sm bg-[#1C0B19] px-6 py-3 text-sm font-semibold tracking-wide text-[#F6F4EF] transition-colors hover:bg-[#2A79A7] disabled:opacity-50`}
        >
          {status === "saving" ? "Saving…" : "Save preferences"}
        </button>
        {message ? (
          <p
            className={`${brief.sans} text-sm ${
              status === "error" ? "text-red-800" : brief.muted
            }`}
            role="status"
          >
            {message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
