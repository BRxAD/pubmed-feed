"use client";

import { useEffect, useId, useState } from "react";
import { brief } from "@/components/brief/briefTheme";

const STORAGE_KEY = "brief-survey-v1";
const DELAY_MS = 15_000;

type LocalState = {
  status: "deferred" | "done";
  showCount: number;
};

function readLocal(): LocalState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalState;
    if (parsed?.status !== "deferred" && parsed?.status !== "done") return null;
    return {
      status: parsed.status,
      showCount: Number(parsed.showCount) || 0,
    };
  } catch {
    return null;
  }
}

function writeLocal(state: LocalState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private mode / blocked storage — server IP gate still applies.
  }
}

function ScoreRow({
  name,
  value,
  onChange,
  label,
}: {
  name: string;
  value: number | null;
  onChange: (n: number) => void;
  label: string;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className={`${brief.sans} mb-2 text-sm font-medium ${brief.ink}`}>
        {label}
      </legend>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const selected = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${n} out of 10`}
              onClick={() => onChange(n)}
              className={`h-8 w-8 rounded-sm text-sm tabular-nums transition-colors ${
                selected
                  ? "bg-[#2A79A7] font-semibold text-[#F6F4EF]"
                  : `border border-[#D8D4C8] bg-[#F6F4EF] ${brief.ink} hover:border-[#2A79A7]`
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>
      <input type="hidden" name={name} value={value ?? ""} />
    </fieldset>
  );
}

/**
 * Homepage-only feedback prompt: after 15s, at most twice per visitor
 * (Ask later → once more next visit, then never). Anonymous; emailed via Resend.
 */
export default function FeedbackSurvey() {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [ease, setEase] = useState<number | null>(null);
  const [content, setContent] = useState<number | null>(null);
  const [featuresHelpful, setFeaturesHelpful] = useState("");
  const [contentFeedback, setContentFeedback] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "thanks" | "error">(
    "idle"
  );
  const [error, setError] = useState("");

  useEffect(() => {
    const local = readLocal();
    if (local?.status === "done" || (local?.showCount ?? 0) >= 2) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/brief/survey", { method: "GET" });
        const data = (await res.json()) as {
          ok?: boolean;
          show?: boolean;
        };
        if (cancelled) return;
        if (!data.show) {
          writeLocal({ status: "done", showCount: 2 });
          return;
        }
        const again = readLocal();
        if (again?.status === "done" || (again?.showCount ?? 0) >= 2) return;

        await fetch("/api/brief/survey", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "shown" }),
        });
        if (cancelled) return;

        const prev = readLocal();
        const nextCount = Math.min((prev?.showCount ?? 0) + 1, 2);
        writeLocal({
          status: nextCount >= 2 ? "deferred" : "deferred",
          showCount: nextCount,
        });
        setOpen(true);
      } catch {
        // Offline / API down — skip quietly.
      }
    }, DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void onLater();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  async function onLater() {
    setOpen(false);
    try {
      await fetch("/api/brief/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "later" }),
      });
    } catch {
      // ignore
    }
    const local = readLocal();
    const showCount = local?.showCount ?? 1;
    writeLocal({
      status: showCount >= 2 ? "done" : "deferred",
      showCount,
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (ease == null || content == null) {
      setError("Please rate both ease of use and content (1–10).");
      setStatus("error");
      return;
    }
    setStatus("saving");
    setError("");
    try {
      const res = await fetch("/api/brief/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          ease,
          content,
          featuresHelpful,
          contentFeedback,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Could not send");
      }
      writeLocal({ status: "done", showCount: 2 });
      setStatus("thanks");
      window.setTimeout(() => setOpen(false), 1800);
    } catch (err) {
      setStatus("error");
      setError(
        err instanceof Error
          ? err.message
          : "Could not send right now. Please try again."
      );
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center p-4 sm:items-center"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-[#1C0B19]/35"
        aria-label="Dismiss survey"
        onClick={() => void onLater()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-[201] w-full max-w-md max-h-[min(90vh,640px)] overflow-y-auto rounded-sm border border-[#D8D4C8] bg-[#F6F4EF] p-5 shadow-[0_16px_40px_rgba(28,11,25,0.2)] sm:p-6"
      >
        {status === "thanks" ? (
          <p className={`${brief.serif} text-xl font-semibold ${brief.ink}`}>
            Thank you — that helps a lot.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <p className={brief.kicker}>Quick feedback</p>
              <h2
                id={titleId}
                className={`${brief.serif} mt-1 text-xl font-bold leading-snug ${brief.ink}`}
              >
                How is The Stewardship Brief working for you?
              </h2>
              <p className={`mt-1.5 ${brief.sans} text-sm ${brief.muted}`}>
                Anonymous · takes under a minute
              </p>
            </div>

            <ScoreRow
              name="ease"
              label="Rate ease of use (1–10)"
              value={ease}
              onChange={setEase}
            />

            <label className="block min-w-0">
              <span className={`${brief.sans} mb-2 block text-sm font-medium ${brief.ink}`}>
                What features or design would make this more helpful?
              </span>
              <textarea
                value={featuresHelpful}
                onChange={(e) => setFeaturesHelpful(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Optional"
                className="box-border w-full rounded-sm border border-[#D8D4C8] bg-white px-3 py-2.5 text-sm text-[#1C0B19] outline-none placeholder:text-[#72705B]/60 focus:border-[#2A79A7] focus:ring-2 focus:ring-[#7BC1D4]/40"
              />
            </label>

            <ScoreRow
              name="content"
              label="Rate site content (1–10)"
              value={content}
              onChange={setContent}
            />

            <label className="block min-w-0">
              <span className={`${brief.sans} mb-2 block text-sm font-medium ${brief.ink}`}>
                What content would you like to see more or less of?
              </span>
              <textarea
                value={contentFeedback}
                onChange={(e) => setContentFeedback(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Optional"
                className="box-border w-full rounded-sm border border-[#D8D4C8] bg-white px-3 py-2.5 text-sm text-[#1C0B19] outline-none placeholder:text-[#72705B]/60 focus:border-[#2A79A7] focus:ring-2 focus:ring-[#7BC1D4]/40"
              />
            </label>

            {status === "error" && error && (
              <p className={`${brief.sans} text-sm text-red-800`}>{error}</p>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={status === "saving"}
                className={`${brief.sans} rounded-sm bg-[#1C0B19] px-4 py-2 text-sm font-semibold tracking-wide text-[#F6F4EF] transition-colors hover:bg-[#2A79A7] disabled:opacity-50`}
              >
                {status === "saving" ? "Sending…" : "Send feedback"}
              </button>
              <button
                type="button"
                onClick={() => void onLater()}
                className={brief.action}
              >
                Ask me later
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
