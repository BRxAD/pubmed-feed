"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { brief } from "@/components/brief/briefTheme";
import { SidebarCard } from "@/components/brief/SidebarCard";

const MASTHEAD_ALERTS_DISMISS_KEY = "stewardship-brief-masthead-alerts-dismissed";
const MASTHEAD_ALERTS_DISMISS_EVENT =
  "stewardship-brief-masthead-alerts-dismissed";

function subscribeDismissed(onStoreChange: () => void) {
  window.addEventListener(MASTHEAD_ALERTS_DISMISS_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(MASTHEAD_ALERTS_DISMISS_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function getDismissedSnapshot() {
  try {
    return window.localStorage.getItem(MASTHEAD_ALERTS_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function dismissMastheadAlerts() {
  try {
    window.localStorage.setItem(MASTHEAD_ALERTS_DISMISS_KEY, "1");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(MASTHEAD_ALERTS_DISMISS_EVENT));
}

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

const EMAIL_SETTINGS_HREF = "/settings?tab=email";

function GuestActions({ googleEnabled }: { googleEnabled: boolean }) {
  if (!googleEnabled) {
    return (
      <Link
        href={EMAIL_SETTINGS_HREF}
        className="flex w-full items-center justify-center rounded-sm border border-[#2A79A7] bg-[#2A79A7] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#236389]"
      >
        Sign in to set email alerts →
      </Link>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => signIn("google", { callbackUrl: EMAIL_SETTINGS_HREF })}
        className="flex w-full items-center justify-center gap-2 rounded-sm border border-[#D8D4C8] bg-white px-3 py-2 text-xs font-semibold text-[#1C0B19] shadow-xs transition-colors hover:border-[#72705B] hover:bg-[#FAF9F5]"
      >
        <GoogleIcon className="h-4 w-4 shrink-0" />
        <span>Continue with Google</span>
      </button>
      <div className="text-center">
        <Link
          href={EMAIL_SETTINGS_HREF}
          className={`${brief.action} text-xs font-medium`}
        >
          or sign in with email →
        </Link>
      </div>
    </div>
  );
}

/** Guest signup copy + Google / email actions — used in the sidebar and masthead. */
export default function EmailAlertCta({
  googleEnabled = true,
  variant = "sidebar",
}: {
  googleEnabled?: boolean;
  variant?: "sidebar" | "masthead";
}) {
  const compact = variant === "masthead";

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {compact ? (
        <p className={`${brief.kicker} mb-0`}>
          <span className="inline-block border-b border-[#FFA69E] pb-0.5">
            Email alerts
          </span>
        </p>
      ) : null}
      <p
        className={`${brief.sans} ${
          compact
            ? "text-xs font-medium leading-snug"
            : "text-sm leading-[1.55]"
        } ${brief.ink}`}
      >
        {compact
          ? "Get the daily brief by email."
          : "Get The Stewardship Brief in your inbox — tailored to your clinical setting and schedule."}
      </p>
      <p className={`${brief.sans} text-xs leading-relaxed ${brief.muted}`}>
        {compact
          ? "Sign in to choose daily or weekly delivery."
          : "Sign in to activate your alerts and choose daily or weekly delivery."}
      </p>
      <div className={compact ? undefined : "pt-1"}>
        <GuestActions googleEnabled={googleEnabled} />
      </div>
    </div>
  );
}

/** Compact masthead / mobile-strip CTA — hidden once the reader is signed in. */
export function MastheadEmailAlert({
  googleEnabled = true,
}: {
  googleEnabled?: boolean;
}) {
  const { data: session, status } = useSession();
  const dismissed = useSyncExternalStore(
    subscribeDismissed,
    getDismissedSnapshot,
    () => false
  );
  const signedIn =
    status === "authenticated" &&
    Boolean(session?.user?.email || session?.user?.id);

  if (status === "loading" || signedIn || dismissed) return null;

  return (
    <SidebarCard accent="steel" compact className="relative pr-8">
      <button
        type="button"
        onClick={dismissMastheadAlerts}
        aria-label="Close email alerts"
        className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-sm text-[#72705B] transition-colors hover:bg-[#1C0B19]/5 hover:text-[#1C0B19] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2A79A7]"
      >
        <span aria-hidden className="text-sm leading-none">
          ×
        </span>
      </button>
      <EmailAlertCta googleEnabled={googleEnabled} variant="masthead" />
    </SidebarCard>
  );
}
