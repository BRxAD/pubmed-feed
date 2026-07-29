"use client";

import type { BriefFeedSettings } from "@/lib/brief/feedSettings";
import type { RankingWeights } from "@/lib/ranking";

type Props = {
  settings: BriefFeedSettings;
  settingsHref: string;
};

function fmtPoints(n: number): string {
  if (n > 0) return `+${n}`;
  return String(n);
}

function WeightChip({
  label,
  value,
  off,
}: {
  label: string;
  value: string;
  off?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[0.6875rem] ${
        off
          ? "border-zinc-200 text-zinc-400 dark:border-zinc-700 dark:text-zinc-500"
          : "border-amber-200/80 bg-white/70 text-zinc-700 dark:border-amber-800/50 dark:bg-zinc-900/40 dark:text-zinc-200"
      }`}
    >
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <strong className="tabular-nums font-semibold">{value}</strong>
    </span>
  );
}

/** Read-only view of Brief settings used for live relevance scoring. */
export default function RelevanceWeightsPanel({
  settings,
  settingsHref,
}: Props) {
  const w: RankingWeights = settings;
  const clinical = [
    ["Q1", w.q1Journal],
    ["RCT/SR", w.rctOrSr],
    ["Multicenter", w.multicenter],
    ["Clinical ASP", w.clinicalStewardship],
    ["Novelty", w.novelty],
    ["Cohort", w.cohort],
    ["Intervention", w.intervention],
    ["Guideline", w.guideline],
    ["Non-human", w.nonHumanPenalty],
  ] as const;

  return (
    <details
      open
      className="mt-3 rounded-lg border border-amber-200/70 bg-amber-50/60 dark:border-amber-800/40 dark:bg-amber-950/30"
    >
      <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-400 [&::-webkit-details-marker]:hidden">
        Relevance scoring · from Brief settings
      </summary>
      <div className="space-y-3 px-3 pb-3 pt-1">
        <p className="text-[0.6875rem] leading-relaxed text-zinc-500 dark:text-zinc-400">
          Article scores below use these saved weights. Edit them on the Brief
          settings page — URL weight overrides are no longer used.
        </p>

        <div>
          <p className="mb-1.5 text-[0.6875rem] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Base signals
          </p>
          <div className="flex flex-wrap gap-1.5">
            <WeightChip
              label="Title"
              value={String(w.stewardshipTitle)}
              off={w.stewardshipTitle === 0}
            />
            <WeightChip
              label="Abstract"
              value={String(w.stewardshipAbstract)}
              off={w.stewardshipAbstract === 0}
            />
            <WeightChip
              label="Large study"
              value={String(w.largeStudy)}
              off={w.largeStudy === 0}
            />
            <WeightChip
              label="Study boost"
              value={w.studyTypeBoost ? "on" : "off"}
              off={!w.studyTypeBoost}
            />
            <WeightChip
              label="JIF ×1.2"
              value={w.jifMultiplier ? "on" : "off"}
              off={!w.jifMultiplier}
            />
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[0.6875rem] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Clinical rubric (editorial pts → ×10 in score)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {clinical.map(([label, pts]) => (
              <WeightChip
                key={label}
                label={label}
                value={fmtPoints(pts)}
                off={pts === 0}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[0.6875rem] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Down-rates
          </p>
          <div className="flex flex-wrap gap-1.5">
            <WeightChip
              label="Veterinary"
              value={`×${settings.veterinary.toFixed(2)}`}
              off={settings.veterinary >= 1}
            />
            <WeightChip
              label="Single-center small"
              value={`×${settings.singleCenterSmall.toFixed(2)}`}
              off={settings.singleCenterSmall >= 1}
            />
            <WeightChip
              label="Descriptive AMR"
              value={`×${settings.descriptiveAmr.toFixed(2)}`}
              off={settings.descriptiveAmr >= 1}
            />
          </div>
        </div>

        <a
          href={settingsHref}
          className="inline-block text-xs font-medium text-[#2A79A7] underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          Edit Brief ranking settings →
        </a>
      </div>
    </details>
  );
}
