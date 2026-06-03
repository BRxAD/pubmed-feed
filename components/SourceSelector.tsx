"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import type { FeedSource } from "@/lib/feedSource";

type Props = {
  source: FeedSource;
  basePath: string;
};

const OPTIONS: { value: FeedSource; label: string }[] = [
  { value: "pubmed", label: "PubMed" },
  { value: "openalex", label: "OpenAlex" },
];

export default function SourceSelector({ source, basePath }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const onChange = useCallback(
    (next: FeedSource) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "pubmed") {
        params.delete("source");
      } else {
        params.set("source", next);
      }
      params.delete("page");
      const qs = params.toString();
      router.push(qs ? `${basePath}?${qs}` : basePath);
    },
    [basePath, router, searchParams]
  );

  return (
    <div
      className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400"
      role="group"
      aria-label="Article source"
    >
      <span className="font-medium">Source</span>
      <div className="inline-flex rounded-lg border border-zinc-300 bg-zinc-50 p-0.5 dark:border-zinc-600 dark:bg-zinc-800">
        {OPTIONS.map((opt) => {
          const active = source === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              aria-pressed={active}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                active
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
