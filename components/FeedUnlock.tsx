"use client";

import { useState } from "react";

/** Unlock /feed with the admin secret, or /feed2 with its own password. */
export default function FeedUnlock({
  nextPath = "/feed",
}: {
  nextPath?: string;
}) {
  const isFeed2 = nextPath === "/feed2";
  const [secret, setSecret] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "error">("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = secret.trim();
    if (!trimmed) {
      setStatus("error");
      setError(isFeed2 ? "Enter the password." : "Enter your admin secret.");
      return;
    }

    setStatus("checking");
    setError("");

    try {
      const res = isFeed2
        ? await fetch("/api/admin/second-rater", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ secret: trimmed }),
          })
        : await fetch("/api/brief/settings", {
            headers: { "x-brief-admin-secret": trimmed },
          });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!res.ok || !data.ok) {
        setStatus("error");
        setError(
          data.error === "Unauthorized" || res.status === 401
            ? isFeed2
              ? "That password does not match."
              : "That secret does not match. Use the same value that unlocks Brief settings (CRON_SECRET in Vercel)."
            : data.error ?? "Could not unlock the feed."
        );
        return;
      }

      const admin = nextPath === "/feed" ? "&admin=1" : "";
      window.location.assign(
        `${nextPath}?secret=${encodeURIComponent(trimmed)}${admin}`
      );
    } catch {
      setStatus("error");
      setError("Network error — try again.");
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-16 font-sans text-zinc-900 dark:text-zinc-100">
      <h1 className="text-2xl font-semibold tracking-tight">
        {isFeed2 ? "Second rater" : "Feed access"}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        {isFeed2
          ? "Enter the password you were given for this page."
          : "Use the same admin secret as Brief settings (/stewardshipbrief/settings). That is your CRON_SECRET in Vercel (or BRIEF_ADMIN_SECRET if set)."}
      </p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder={isFeed2 ? "Password" : "Same secret as Brief settings"}
          autoComplete="current-password"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
        />
        <button
          type="submit"
          disabled={status === "checking"}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {status === "checking" ? "Checking…" : "Unlock feed →"}
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      <p className="mt-8 text-sm">
        <a href="/" className="text-[#2A79A7] underline">
          ← Back to The Stewardship Brief
        </a>
      </p>
    </div>
  );
}
