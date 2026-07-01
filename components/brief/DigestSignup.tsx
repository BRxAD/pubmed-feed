"use client";

import { useState } from "react";
import { brief } from "@/components/brief/briefTheme";

export default function DigestSignup() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/brief/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Subscribe failed");
      setStatus("ok");
      setMessage("You are on the list. Look for the 7am brief.");
      setEmail("");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <section aria-labelledby="signup-heading">
      <h2
        id="signup-heading"
        className={`${brief.kicker} mb-2 pb-2 border-b ${brief.hairline}`}
      >
        Morning email
      </h2>
      <p className={`${brief.sans} text-sm leading-[1.55] ${brief.ink} mb-4`}>
        Get the 7am email — top headlines, one bottom line each.
      </p>
      <form onSubmit={onSubmit} className="space-y-3">
        <label htmlFor="brief-email" className="sr-only">
          Email address
        </label>
        <input
          id="brief-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className={`w-full ${brief.sans} text-sm bg-transparent border-0 border-b ${brief.rule} py-2 focus:outline-none focus:border-[#b0672e] ${brief.ink}`}
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className={`${brief.sans} text-sm ${brief.accent} ${brief.accentHover} disabled:opacity-50`}
        >
          Subscribe →
        </button>
      </form>
      {message && (
        <p
          className={`mt-3 ${brief.sans} text-xs ${
            status === "error" ? "text-red-800" : brief.muted
          }`}
        >
          {message}
        </p>
      )}
    </section>
  );
}
