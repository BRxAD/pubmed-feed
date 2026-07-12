"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { brief } from "@/components/brief/briefTheme";

export default function SettingsUnlock() {
  const [secret, setSecret] = useState("");
  const router = useRouter();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = secret.trim();
    if (!trimmed) return;
    router.push(
      `/stewardshipbrief/settings?secret=${encodeURIComponent(trimmed)}`
    );
  }

  return (
    <section className={`rounded-sm border ${brief.hairline} bg-[#EFECE4]/60 p-6`}>
      <h2 className={`${brief.kicker} mb-3`}>Unlock</h2>
      <p className={`${brief.sans} text-sm ${brief.muted} mb-4`}>
        Enter your admin secret to adjust relevance factors. Set{" "}
        <code className="text-xs">BRIEF_ADMIN_SECRET</code> in Vercel, or use
        your existing cron secret.
      </p>
      <form onSubmit={onSubmit} className="flex flex-wrap gap-3">
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="Admin secret"
          className={`flex-1 min-w-[200px] ${brief.sans} text-sm bg-transparent border-0 border-b ${brief.rule} py-2 focus:outline-none focus:border-[#2A79A7]`}
        />
        <button
          type="submit"
          className={`${brief.sans} text-sm ${brief.accent} ${brief.accentHover}`}
        >
          Continue →
        </button>
      </form>
    </section>
  );
}
