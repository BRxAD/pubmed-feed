"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

type Props = {
  topicId: string;
  pmid: string;
  initialPriority: number | null;
  featureSnapshot: Record<string, number | boolean>;
};

const OPTIONS = [
  { value: "", label: "Unset" },
  ...Array.from({ length: 10 }, (_, i) => ({
    value: String(i + 1),
    label: String(i + 1),
  })),
];

export default function AdminPrioritySelector({
  topicId,
  pmid,
  initialPriority,
  featureSnapshot,
}: Props) {
  const router = useRouter();
  const [priority, setPriority] = useState(
    initialPriority != null ? String(initialPriority) : ""
  );
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );

  const onChange = useCallback(
    async (next: string) => {
      setPriority(next);
      setStatus("saving");

      try {
        const res = await fetch("/api/admin/summary-priority", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topicId,
            pmid,
            priority: next === "" ? null : parseInt(next, 10),
            featureSnapshot,
          }),
        });

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }

        setStatus("saved");
        router.refresh();
        setTimeout(() => setStatus("idle"), 2000);
      } catch {
        setStatus("error");
      }
    },
    [topicId, pmid, featureSnapshot, router]
  );

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <label
        htmlFor={`priority-${pmid}`}
        className="font-medium text-amber-800 dark:text-amber-300"
      >
        Priority (1–10)
      </label>
      <select
        id={`priority-${pmid}`}
        value={priority}
        onChange={(e) => onChange(e.target.value)}
        disabled={status === "saving"}
        className="rounded-md border border-amber-300 bg-white px-2 py-1 text-zinc-800 dark:border-amber-700 dark:bg-zinc-900 dark:text-zinc-100"
      >
        {OPTIONS.map((opt) => (
          <option key={opt.value || "unset"} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {status === "saving" && (
        <span className="text-zinc-500">Saving…</span>
      )}
      {status === "saved" && (
        <span className="text-green-700 dark:text-green-400">Saved</span>
      )}
      {status === "error" && (
        <span className="text-red-600 dark:text-red-400">Save failed</span>
      )}
    </div>
  );
}
