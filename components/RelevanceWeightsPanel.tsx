"use client";

import { useState } from "react";
import type { RankingWeights } from "@/lib/ranking";

type Props = {
  weights: RankingWeights;
  basePath: string;
  /** All current URL params to preserve (topicId, sort, keyword, etc.) */
  preservedParams: Record<string, string>;
};

function NumInput({
  label,
  name,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  name: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="range"
          name={name}
          min={min}
          max={max}
          step={5}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-24 cursor-pointer accent-amber-600 dark:accent-amber-400"
        />
        <span className="min-w-[2.5rem] text-center text-xs font-bold tabular-nums text-amber-700 dark:text-amber-400">
          {value}
        </span>
      </div>
    </label>
  );
}

function Toggle({
  label,
  name,
  checked,
  onChange,
}: {
  label: string;
  name: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 select-none">
      <input
        type="hidden"
        name={name}
        value={checked ? "1" : "0"}
      />
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-4 w-7 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${
          checked ? "bg-amber-500 dark:bg-amber-400" : "bg-zinc-300 dark:bg-zinc-600"
        }`}
      >
        <span
          className={`inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-3" : "translate-x-0"
          }`}
        />
      </button>
      <span className="text-xs text-zinc-600 dark:text-zinc-300">{label}</span>
    </label>
  );
}

export default function RelevanceWeightsPanel({
  weights,
  basePath,
  preservedParams,
}: Props) {
  const [w, setW] = useState(weights);

  return (
    <details className="mt-3 rounded-lg border border-amber-200/70 bg-amber-50/60 dark:border-amber-800/40 dark:bg-amber-950/30">
      <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-400 [&::-webkit-details-marker]:hidden">
        ⚙ Relevance weights
      </summary>
      <form
        method="GET"
        action={basePath}
        className="px-3 pb-3 pt-1"
      >
        {/* Preserve all current page params */}
        {Object.entries(preservedParams).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}

        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <NumInput
            label="Stewardship in title"
            name="wTitle"
            value={w.stewardshipTitle}
            min={0}
            max={120}
            onChange={(v) => setW((prev) => ({ ...prev, stewardshipTitle: v }))}
          />
          <NumInput
            label="Stewardship in abstract"
            name="wAbstract"
            value={w.stewardshipAbstract}
            min={0}
            max={50}
            onChange={(v) => setW((prev) => ({ ...prev, stewardshipAbstract: v }))}
          />
          <NumInput
            label="Large study bonus"
            name="wLarge"
            value={w.largeStudy}
            min={0}
            max={60}
            onChange={(v) => setW((prev) => ({ ...prev, largeStudy: v }))}
          />
          <Toggle
            label="Study-type boost (RCT / systematic)"
            name="studyBoost"
            checked={w.studyTypeBoost}
            onChange={(v) => setW((prev) => ({ ...prev, studyTypeBoost: v }))}
          />
          <Toggle
            label="JIF ×1.2 for top-50% journals"
            name="jifBoost"
            checked={w.jifMultiplier}
            onChange={(v) => setW((prev) => ({ ...prev, jifMultiplier: v }))}
          />
        </div>

        <div className="mt-3 flex items-center gap-3">
          <button
            type="submit"
            className="rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-400"
          >
            Apply weights
          </button>
          <a
            href={`${basePath}?${new URLSearchParams({ ...preservedParams, admin: "1" }).toString()}`}
            className="text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
          >
            Reset to defaults
          </a>
        </div>
      </form>
    </details>
  );
}
