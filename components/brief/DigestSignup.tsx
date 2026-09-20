"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { brief } from "@/components/brief/briefTheme";
import { SidebarHeading } from "@/components/brief/SidebarCard";
import EmailAlertCta from "@/components/brief/EmailAlertCta";
import { getMyEmailPreferences } from "@/app/settings/actions";
import {
  DEFAULT_USER_PREFERENCES,
  type UserPreferences,
} from "@/lib/userPreferences";
import {
  ARTICLE_SETTING_LABELS,
  type ArticleSetting,
} from "@/lib/classifySetting";

function formatSettingsSummary(tags: string[]): string {
  if (!tags || tags.length === 0) return "All settings";
  if (tags.length === 1) {
    const label = ARTICLE_SETTING_LABELS[tags[0] as ArticleSetting];
    return label ? label.split(" & ")[0] : "1 setting";
  }
  return `${tags.length} settings`;
}

export default function DigestSignup({
  googleEnabled = true,
}: {
  googleEnabled?: boolean;
}) {
  const { data: session, status } = useSession();
  const signedIn =
    status === "authenticated" &&
    Boolean(session?.user?.email || session?.user?.id);

  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_USER_PREFERENCES);
  const [loadingPrefs, setLoadingPrefs] = useState(false);

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    setLoadingPrefs(true);
    getMyEmailPreferences()
      .then((res) => {
        if (active && res.preferences) {
          setPrefs(res.preferences);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingPrefs(false);
      });

    return () => {
      active = false;
    };
  }, [signedIn]);

  const email = session?.user?.email;
  const isPaused = prefs.emailFrequency === "none";
  const freqLabel = prefs.emailFrequency === "weekly" ? "Weekly" : "Daily";
  const settingsLabel = formatSettingsSummary(prefs.settingsTags);
  const impactLabel = prefs.highImpactOnly ? " · Highest impact" : "";

  return (
    <section aria-labelledby="digest-heading">
      <SidebarHeading id="digest-heading">Email Brief & Alerts</SidebarHeading>

      {status === "loading" ? (
        <p className={`${brief.sans} text-xs ${brief.muted} py-2`}>
          Checking status…
        </p>
      ) : signedIn ? (
        /* Signed-in View: State-aware status & direct preferences link */
        <div className="space-y-3">
          <div
            className={`rounded-sm border p-3 text-xs ${
              isPaused
                ? "border-[#D8D4C8] bg-white/70 text-[#1C0B19]"
                : "border-[#2A79A7]/30 bg-[#2A79A7]/5 text-[#1C0B19]"
            }`}
          >
            <div className="flex items-center gap-1.5 font-semibold">
              {isPaused ? (
                <span className="text-[#72705B]">Alerts paused</span>
              ) : (
                <span className="text-[#2A79A7]">✓ Alerts active</span>
              )}
            </div>

            {email && (
              <p className="mt-1 truncate font-medium text-[#1C0B19]" title={email}>
                {email}
              </p>
            )}

            {!isPaused && (
              <p className="mt-1 text-[11px] leading-relaxed text-[#72705B]">
                {loadingPrefs
                  ? "Loading delivery preferences…"
                  : `Delivered ${freqLabel} · ${settingsLabel}${impactLabel}`}
              </p>
            )}
          </div>

          <Link
            href="/settings?tab=email"
            className={`${brief.action} inline-flex items-center gap-1 text-xs font-semibold`}
          >
            {isPaused ? "Turn on email alerts →" : "Customize preferences →"}
          </Link>
        </div>
      ) : (
        <EmailAlertCta googleEnabled={googleEnabled} variant="sidebar" />
      )}
    </section>
  );
}
