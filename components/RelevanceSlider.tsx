"use client";

import { useState } from "react";

type Props = {
  defaultValue: number;
};

export default function RelevanceSlider({ defaultValue }: Props) {
  const [value, setValue] = useState(defaultValue);
  const isActive = value > 0;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
        Min relevance
      </span>
      <div className="flex items-center gap-2.5">
        <input
          type="range"
          name="minRelevance"
          min={0}
          max={80}
          step={5}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          className="w-36 cursor-pointer accent-zinc-700 dark:accent-zinc-400"
          aria-label={`Minimum relevance: ${isActive ? `${value}%` : "off"}`}
        />
        {/* Live % badge */}
        <span
          className={`min-w-[3rem] rounded-md px-2 py-0.5 text-center text-sm font-bold tabular-nums transition-colors ${
            isActive
              ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900"
              : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
          }`}
        >
          {isActive ? `${value}%` : "off"}
        </span>
        {isActive && (
          <button
            type="button"
            onClick={() => setValue(0)}
            className="text-xs text-zinc-400 transition hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
            aria-label="Clear relevance filter"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
