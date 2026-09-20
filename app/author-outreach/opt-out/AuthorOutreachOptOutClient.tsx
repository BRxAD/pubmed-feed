"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { brief } from "@/components/brief/briefTheme";

type Status = "idle" | "loading" | "ok" | "error";

export default function AuthorOutreachOptOutClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState<string | null>(null);

  const optOut = useCallback(async () => {
    if (!token) {
      setStatus("error");
      setMessage("This opt-out link is missing a token.");
      return;
    }
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch(
        `/api/author-outreach/opt-out?token=${encodeURIComponent(token)}`,
        { method: "POST" }
      );
      const data = (await res.json()) as {
        ok?: boolean;
        email?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Opt-out failed");
      }
      setEmail(data.email ?? null);
      setStatus("ok");
      setMessage(
        data.email
          ? `${data.email} will not receive author-feature notices.`
          : "You will not receive author-feature notices."
      );
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong");
    }
  }, [token]);

  useEffect(() => {
    const auto =
      searchParams.get("confirm") === "1" ||
      searchParams.get("List-Unsubscribe") === "One-Click";
    if (auto && token && status === "idle") {
      void optOut();
    }
  }, [searchParams, token, status, optOut]);

  return (
    <main className={`min-h-screen ${brief.bg} ${brief.ink} px-5 py-16`}>
      <div className="mx-auto max-w-md">
        <p className={`${brief.kicker} mb-3`}>The Stewardship Brief</p>
        <h1 className={`${brief.serif} text-3xl font-semibold tracking-tight mb-4`}>
          Opt out of author notices
        </h1>

        {status === "ok" ? (
          <>
            <p className={`${brief.sans} text-sm leading-relaxed mb-6`}>
              {message}
            </p>
            <p className={`${brief.sans} text-sm ${brief.muted} mb-8`}>
              This does not change The Stewardship Brief subscriber list. It
              only stops notices when a paper of yours is featured.
            </p>
          </>
        ) : (
          <>
            <p className={`${brief.sans} text-sm leading-relaxed mb-6`}>
              Stop receiving a notice when your papers are featured in The
              Stewardship Brief
              {email ? ` at ${email}` : ""}.
            </p>
            {!token ? (
              <p className={`${brief.sans} text-sm text-red-800 mb-6`}>
                This link is incomplete. Use the opt-out link from a recent
                author notice.
              </p>
            ) : (
              <button
                type="button"
                onClick={() => void optOut()}
                disabled={status === "loading"}
                className={`${brief.sans} text-sm ${brief.accent} ${brief.accentHover} disabled:opacity-50 mb-4`}
              >
                {status === "loading" ? "Saving…" : "Confirm opt out →"}
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
