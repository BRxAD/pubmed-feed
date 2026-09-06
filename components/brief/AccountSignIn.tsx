"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { registerPasswordAccount } from "@/app/settings/actions";
import { brief } from "@/components/brief/briefTheme";

const FIELD =
  "box-border w-full max-w-full min-w-0 rounded-sm border border-[#D8D4C8] bg-white px-3.5 py-3 text-sm text-[#1C0B19] outline-none transition-colors placeholder:text-[#72705B]/60 focus:border-[#2A79A7] focus:ring-2 focus:ring-[#7BC1D4]/40";

type Mode = "signin" | "register";

export default function AccountSignIn({
  googleEnabled,
  initialError,
}: {
  googleEnabled: boolean;
  initialError?: string | null;
}) {
  const [showEmail, setShowEmail] = useState(!googleEnabled);
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">(
    initialError ? "error" : "idle"
  );
  const [error, setError] = useState(initialError ?? "");

  async function onGoogle() {
    setStatus("loading");
    setError("");
    await signIn("google", { callbackUrl: "/settings" });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError("");
    try {
      if (mode === "register") {
        if (password !== confirm) {
          throw new Error("Those passwords do not match.");
        }
        const created = await registerPasswordAccount({ email, password });
        if (!created.ok) throw new Error(created.error);
      }

      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        callbackUrl: "/settings",
        redirect: false,
      });
      if (!result || result.error || result.ok === false) {
        throw new Error(
          mode === "register"
            ? "Account created, but sign-in failed. Try signing in."
            : "Email or password is not correct."
        );
      }
      window.location.assign(result.url || "/settings");
    } catch (err) {
      setStatus("error");
      setError(
        err instanceof Error ? err.message : "Could not sign in. Try again."
      );
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-sm border border-[#D8D4C8] bg-white p-6 shadow-[0_1px_2px_rgba(28,11,25,0.04)] sm:p-8">
      <h1
        className={`${brief.serif} text-center text-2xl font-semibold tracking-tight`}
      >
        Sign in
      </h1>
      <p
        className={`mt-2 text-center ${brief.sans} text-sm leading-relaxed ${brief.muted}`}
      >
        Save articles and manage your email brief.
      </p>

      {error ? (
        <p
          className={`mt-4 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-center ${brief.sans} text-sm text-red-800`}
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {googleEnabled ? (
        <button
          type="button"
          onClick={() => void onGoogle()}
          disabled={status === "loading"}
          className={`${brief.sans} mt-8 flex w-full items-center justify-center gap-3 rounded-sm bg-[#1C0B19] px-6 py-3.5 text-sm font-semibold tracking-wide text-[#F6F4EF] transition-colors hover:bg-[#2A79A7] disabled:opacity-50`}
        >
          <GoogleMark />
          Continue with Google
        </button>
      ) : null}

      {googleEnabled && !showEmail ? (
        <button
          type="button"
          onClick={() => setShowEmail(true)}
          className={`mt-5 w-full text-center ${brief.sans} text-sm ${brief.action}`}
        >
          Use email instead
        </button>
      ) : null}

      {showEmail ? (
        <div className={googleEnabled ? "mt-8 border-t border-[#D8D4C8] pt-8" : "mt-8"}>
          {googleEnabled ? (
            <p
              className={`mb-5 text-center ${brief.sans} text-[0.6875rem] font-medium uppercase tracking-[0.14em] ${brief.muted}`}
            >
              Email and password
            </p>
          ) : null}

          <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
            <div>
              <label htmlFor="account-email" className={`${brief.meta} mb-2 block`}>
                Email
              </label>
              <input
                id="account-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
                className={FIELD}
              />
            </div>
            <div>
              <label
                htmlFor="account-password"
                className={`${brief.meta} mb-2 block`}
              >
                Password
              </label>
              <input
                id="account-password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={
                  mode === "register" ? "new-password" : "current-password"
                }
                placeholder="At least 8 characters"
                className={FIELD}
              />
            </div>
            {mode === "register" ? (
              <div>
                <label
                  htmlFor="account-confirm"
                  className={`${brief.meta} mb-2 block`}
                >
                  Confirm password
                </label>
                <input
                  id="account-confirm"
                  type="password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  className={FIELD}
                />
              </div>
            ) : null}
            <button
              type="submit"
              disabled={status === "loading"}
              className={`${brief.sans} w-full rounded-sm border border-[#1C0B19] bg-[#F6F4EF] px-6 py-3 text-sm font-semibold tracking-wide text-[#1C0B19] transition-colors hover:bg-[#1C0B19] hover:text-[#F6F4EF] disabled:opacity-50`}
            >
              {status === "loading"
                ? "Working…"
                : mode === "register"
                  ? "Create account"
                  : "Sign in"}
            </button>
            {status === "error" && error && showEmail ? (
              <p className={`${brief.sans} text-sm text-red-800`} role="alert">
                {error}
              </p>
            ) : null}
          </form>

          <p className={`mt-5 text-center ${brief.sans} text-sm ${brief.muted}`}>
            {mode === "signin" ? (
              <>
                New here?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("register");
                    setError("");
                  }}
                  className={brief.action}
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("signin");
                    setError("");
                  }}
                  className={brief.action}
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#FFFFFF"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
        opacity=".9"
      />
      <path
        fill="#FFFFFF"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
        opacity=".75"
      />
      <path
        fill="#FFFFFF"
        d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33z"
        opacity=".75"
      />
      <path
        fill="#FFFFFF"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A8.96 8.96 0 0 0 9 0 9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
        opacity=".9"
      />
    </svg>
  );
}
