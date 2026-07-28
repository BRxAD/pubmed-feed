"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { brief } from "@/components/brief/briefTheme";

type Status = "idle" | "loading" | "ok" | "error";

export default function UnsubscribeClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState<string | null>(null);

  const unsubscribe = useCallback(async () => {
    if (!token) {
      setStatus("error");
      setMessage("This unsubscribe link is missing a token.");
      return;
    }
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch(
        `/api/brief/unsubscribe?token=${encodeURIComponent(token)}`,
        { method: "POST" }
      );
      const data = (await res.json()) as {
        ok?: boolean;
        email?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Unsubscribe failed");
      }
      setEmail(data.email ?? null);
      setStatus("ok");
      setMessage(
        data.email
          ? `${data.email} has been removed from The Stewardship Brief list.`
          : "You have been removed from The Stewardship Brief list."
      );
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong");
    }
  }, [token]);

  // Auto-confirm when clients follow List-Unsubscribe one-click, or when
  // the user lands with ?confirm=1 from a plain link they already trust.
  useEffect(() => {
    const auto =
      searchParams.get("confirm") === "1" ||
      searchParams.get("List-Unsubscribe") === "One-Click";
    if (auto && token && status === "idle") {
      void unsubscribe();
    }
  }, [searchParams, token, status, unsubscribe]);

  return (
    <main className={`min-h-screen ${brief.bg} ${brief.ink} px-5 py-16`}>
      <div className="mx-auto max-w-md">
        <p className={`${brief.kicker} mb-3`}>The Stewardship Brief</p>
        <h1 className={`${brief.serif} text-3xl font-semibold tracking-tight mb-4`}>
          Unsubscribe
        </h1>

        {status === "ok" ? (
          <>
            <p className={`${brief.sans} text-sm leading-relaxed mb-6`}>
              {message}
            </p>
            <p className={`${brief.sans} text-sm ${brief.muted} mb-8`}>
              You can subscribe again anytime from the homepage.
            </p>
          </>
        ) : (
          <>
            <p className={`${brief.sans} text-sm leading-relaxed mb-6`}>
              Stop receiving the daily Stewardship Brief email
              {email ? ` at ${email}` : ""}.
            </p>
            {!token ? (
              <p className={`${brief.sans} text-sm text-red-800 mb-6`}>
                This link is incomplete. Use the Unsubscribe link from a recent
                brief email.
              </p>
            ) : (
              <button
                type="button"
                onClick={() => void unsubscribe()}
                disabled={status === "loading"}
                className={`${brief.sans} text-sm ${brief.accent} ${brief.accentHover} disabled:opacity-50 mb-4`}
              >
                {status === "loading"
                  ? "Unsubscribing…"
                  : "Confirm unsubscribe →"}
              </button>
            )}
            {status === "error" && message && (
              <p className={`${brief.sans} text-xs text-red-800 mb-6`}>
                {message}
              </p>
            )}
          </>
        )}

        <Link href="/" className={`${brief.action}`}>
          ← Back to the brief
        </Link>
      </div>
    </main>
  );
}
