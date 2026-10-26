"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export default function SecondRaterScore({
  pmid,
  initialRating,
  secret,
}: {
  pmid: string;
  initialRating: number | null;
  secret: string;
}) {
  const router = useRouter();
  const [rating, setRating] = useState<number | null>(initialRating);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );

  async function choose(next: number) {
    setRating(next);
    setStatus("saving");
    try {
      const res = await fetch("/api/admin/second-rater", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pmid, rating: next, secret }),
      });
      if (!res.ok) throw new Error("save failed");
      setStatus("saved");
      router.refresh();
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="mt-4">
      <p className="text-sm font-medium text-amber-300">
        Your score, 1 to 10. 5 or higher is worth including.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {SCORES.map((score) => {
          const on = rating === score;
          return (
            <button
              key={score}
              type="button"
              disabled={status === "saving"}
              onClick={() => choose(score)}
              className={
                on
                  ? "h-9 w-9 rounded-md bg-amber-400 text-sm font-semibold text-zinc-950"
                  : "h-9 w-9 rounded-md border border-zinc-600 text-sm text-zinc-100 hover:border-amber-400"
              }
            >
              {score}
            </button>
          );
        })}
      </div>
      {status === "saving" && (
        <p className="mt-2 text-sm text-zinc-400">Saving…</p>
      )}
      {status === "saved" && (
        <p className="mt-2 text-sm text-green-400">Saved</p>
      )}
      {status === "error" && (
        <p className="mt-2 text-sm text-red-400">Save failed. Try again.</p>
      )}
    </div>
  );
}
