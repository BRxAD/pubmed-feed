"use client";

import { useState } from "react";
import { brief } from "@/components/brief/briefTheme";

export default function SettingsUnlock() {
  const [secret, setSecret] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "error">("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = secret.trim();
    if (!trimmed) {
      setStatus("error");
      setError("Enter your admin secret.");
      return;
    }

    setStatus("checking");
    setError("");

    try {
      const res = await fetch("/api/brief/settings", {
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
            ? "That secret doesn’t match. Check CRON_SECRET (or BRIEF_ADMIN_SECRET) in Vercel → Environment Variables."
            : data.error ?? "Could not unlock settings."
        );
        return;
      }

      // Hard navigation so the server page re-renders with the secret.
      window.location.assign(
        `/stewardshipbrief/settings?secret=${encodeURIComponent(trimmed)}`
      );
    } catch {
      setStatus("error");
      setError("Network error — try again.");
    }
  }

  return (
    <section className={`rounded-sm border ${brief.hairline} bg-[#EFECE4]/60 p-6`}>
      <h2 className={`${brief.kicker} mb-3`}>Unlock</h2>
      <p className={`${brief.sans} text-sm ${brief.muted} mb-4`}>
        Enter your admin secret to adjust relevance factors. Use{" "}
        <code className="text-xs">CRON_SECRET</code> from Vercel → Settings →
        Environment Variables (or <code className="text-xs">BRIEF_ADMIN_SECRET</code> if
        set).
      </p>
      <form onSubmit={onSubmit} className="flex flex-wrap gap-3">
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="Admin secret"
          autoComplete="current-password"
          className={`flex-1 min-w-[200px] ${brief.sans} text-sm bg-transparent border-0 border-b ${brief.rule} py-2 focus:outline-none focus:border-[#2A79A7]`}
        />
        <button
          type="submit"
          disabled={status === "checking"}
          className={`${brief.sans} text-sm ${brief.accent} ${brief.accentHover} disabled:opacity-50`}
        >
          {status === "checking" ? "Checking…" : "Continue →"}
        </button>
      </form>
      {error && (
        <p className={`mt-3 ${brief.sans} text-xs text-red-800`}>{error}</p>
      )}
    </section>
  );
}
