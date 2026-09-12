"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { brief } from "@/components/brief/briefTheme";
import { SidebarHeading } from "@/components/brief/SidebarCard";
import { getMyEmailPreferences } from "@/app/settings/actions";
import {
  DEFAULT_USER_PREFERENCES,
  type UserPreferences,
} from "@/lib/userPreferences";
import {
  ARTICLE_SETTING_LABELS,
  type ArticleSetting,
} from "@/lib/classifySetting";

function GoogleIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.16 0 9.98 0 12s.45 3.84 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
}

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
        /* Guest View: Personalization framing & 1-tap Google sign-in */
        <div className="space-y-3">
          <p className={`${brief.sans} text-sm leading-[1.55] ${brief.ink}`}>
            Get The Stewardship Brief in your inbox — tailored to your clinical
            setting and schedule.
          </p>

          <p className={`${brief.sans} text-xs leading-relaxed ${brief.muted}`}>
            Sign in to activate your alerts and choose daily or weekly delivery.
          </p>

          <div className="pt-1 space-y-2">
            {googleEnabled ? (
              <>
                <button
                  type="button"
                  onClick={() =>
                    signIn("google", { callbackUrl: "/settings?tab=email" })
                  }
                  className="flex w-full items-center justify-center gap-2 rounded-sm border border-[#D8D4C8] bg-white px-3 py-2 text-xs font-semibold text-[#1C0B19] shadow-xs transition-colors hover:border-[#72705B] hover:bg-[#FAF9F5]"
                >
                  <GoogleIcon className="h-4 w-4 shrink-0" />
                  <span>Continue with Google</span>
                </button>
                <div className="text-center">
                  <Link
                    href="/settings?tab=email"
                    className={`${brief.action} text-xs font-medium`}
                  >
                    or sign in with email →
                  </Link>
                </div>
              </>
            ) : (
              <Link
                href="/settings?tab=email"
                className="flex w-full items-center justify-center rounded-sm border border-[#2A79A7] bg-[#2A79A7] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#236389]"
              >
                Sign in to set email alerts →
              </Link>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
