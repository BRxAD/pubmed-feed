"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { BriefFeedSettings } from "@/lib/brief/feedSettings";
import { brief } from "@/components/brief/briefTheme";

type Props = {
  initialSecret: string;
};

function SliderRow({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  const display = format ? format(value) : String(value);
  return (
    <label className="block">
      <div className="flex items-baseline justify-between gap-2">
        <span className={`${brief.sans} text-sm ${brief.ink}`}>{label}</span>
        <span className={`${brief.sans} text-xs tabular-nums ${brief.accent}`}>
          {display}
        </span>
      </div>
      {hint && (
        <p className={`mt-0.5 ${brief.sans} text-xs ${brief.muted}`}>{hint}</p>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-[#2A79A7]"
      />
    </label>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 accent-[#2A79A7]"
      />
      <span>
        <span className={`${brief.sans} text-sm ${brief.ink}`}>{label}</span>
        {hint && (
          <p className={`mt-0.5 ${brief.sans} text-xs ${brief.muted}`}>{hint}</p>
        )}
      </span>
    </label>
  );
}

export default function SettingsDashboard({ initialSecret }: Props) {
  const [settings, setSettings] = useState<BriefFeedSettings | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "error">(
    "loading"
  );
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetch("/api/brief/settings", {
        headers: { "x-brief-admin-secret": initialSecret },
      });
      const data = (await res.json()) as {
        ok?: boolean;
        settings?: BriefFeedSettings;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.settings) {
        throw new Error(data.error ?? "Failed to load settings");
      }
      setSettings(data.settings);
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Load failed");
    }
  }, [initialSecret]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!settings) return;
    setStatus("saving");
    setMessage("");
    try {
      const res = await fetch("/api/brief/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-brief-admin-secret": initialSecret,
        },
        body: JSON.stringify({ settings }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        settings?: BriefFeedSettings;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Save failed");
      if (data.settings) setSettings(data.settings);
      setStatus("ready");
      setMessage("Settings saved.");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Save failed");
    }
  }

  if (status === "loading" && !settings) {
    return (
      <p className={`${brief.sans} text-sm ${brief.muted}`}>Loading settings…</p>
    );
  }

  if (!settings) {
    return (
      <p className={`${brief.sans} text-sm text-red-800`}>
        {message || "Could not load settings."}
      </p>
    );
  }

  return (
    <div className="space-y-10">
      <section>
        <h2 className={`${brief.kicker} mb-4 pb-2 border-b ${brief.hairline}`}>
          Relevance scoring
        </h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <SliderRow
            label="Stewardship in title"
            hint="Points when stewardship appears in the article title."
            value={settings.stewardshipTitle}
            min={0}
            max={120}
            step={5}
            onChange={(v) => setSettings((s) => s && { ...s, stewardshipTitle: v })}
          />
          <SliderRow
            label="Stewardship in abstract"
            value={settings.stewardshipAbstract}
            min={0}
            max={50}
            step={5}
            onChange={(v) =>
              setSettings((s) => s && { ...s, stewardshipAbstract: v })
            }
          />
          <SliderRow
            label="Large study bonus"
            hint={`Award when sample size exceeds ${settings.brief.largeStudyThreshold}.`}
            value={settings.largeStudy}
            min={0}
            max={60}
            step={5}
            onChange={(v) => setSettings((s) => s && { ...s, largeStudy: v })}
          />
          <SliderRow
            label="Large study threshold (n)"
            value={settings.brief.largeStudyThreshold}
            min={50}
            max={500}
            step={25}
            onChange={(v) =>
              setSettings((s) =>
                s ? { ...s, brief: { ...s.brief, largeStudyThreshold: v } } : s
              )
            }
          />
        </div>
        <div className="mt-6 space-y-3">
          <ToggleRow
            label="Study-type boost (RCT / systematic review)"
            checked={settings.studyTypeBoost}
            onChange={(v) => setSettings((s) => s && { ...s, studyTypeBoost: v })}
          />
          <ToggleRow
            label="JIF ×1.2 for top-50% journals"
            checked={settings.jifMultiplier}
            onChange={(v) => setSettings((s) => s && { ...s, jifMultiplier: v })}
          />
        </div>
      </section>

      <section>
        <h2 className={`${brief.kicker} mb-4 pb-2 border-b ${brief.hairline}`}>
          Relevance down-rates
        </h2>
        <p className={`${brief.sans} text-sm ${brief.muted} mb-4`}>
          Multipliers applied to final relevance (lower = stronger down-rate).
        </p>
        <div className="grid gap-6 sm:grid-cols-2">
          <SliderRow
            label="Veterinary (non–One Health)"
            value={settings.veterinary}
            min={0.1}
            max={1}
            step={0.05}
            format={(v) => `×${v.toFixed(2)}`}
            onChange={(v) => setSettings((s) => s && { ...s, veterinary: v })}
          />
          <SliderRow
            label="Single-center, small sample"
            value={settings.singleCenterSmall}
            min={0.1}
            max={1}
            step={0.05}
            format={(v) => `×${v.toFixed(2)}`}
            onChange={(v) =>
              setSettings((s) => s && { ...s, singleCenterSmall: v })
            }
          />
          <SliderRow
            label="Small-scope descriptive AMR/use"
            value={settings.descriptiveAmr}
            min={0.1}
            max={1}
            step={0.05}
            format={(v) => `×${v.toFixed(2)}`}
            onChange={(v) =>
              setSettings((s) => s && { ...s, descriptiveAmr: v })
            }
          />
          <SliderRow
            label="Small sample cutoff (n)"
            value={settings.brief.smallSampleMax}
            min={20}
            max={200}
            step={10}
            onChange={(v) =>
              setSettings((s) =>
                s ? { ...s, brief: { ...s.brief, smallSampleMax: v } } : s
              )
            }
          />
          <SliderRow
            label="Minimum combined penalty"
            hint="Floor for stacked penalties."
            value={settings.minFactor}
            min={0.1}
            max={1}
            step={0.02}
            format={(v) => `×${v.toFixed(2)}`}
            onChange={(v) => setSettings((s) => s && { ...s, minFactor: v })}
          />
        </div>
      </section>

      <section>
        <h2 className={`${brief.kicker} mb-4 pb-2 border-b ${brief.hairline}`}>
          Brief feed
        </h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <SliderRow
            label="Minimum priority (1–10)"
            hint="Articles below this effective priority are excluded from the brief."
            value={settings.brief.minPriority}
            min={1}
            max={10}
            step={1}
            onChange={(v) =>
              setSettings((s) =>
                s ? { ...s, brief: { ...s.brief, minPriority: v } } : s
              )
            }
          />
          <SliderRow
            label="Rolling window (days)"
            value={settings.brief.daysBack}
            min={1}
            max={30}
            step={1}
            onChange={(v) =>
              setSettings((s) =>
                s ? { ...s, brief: { ...s.brief, daysBack: v } } : s
              )
            }
          />
        </div>
        <div className="mt-6">
          <ToggleRow
            label="Sort by newest ingest first"
            hint="When off, highest priority + relevance rise to the top."
            checked={settings.brief.sortByRecency}
            onChange={(v) =>
              setSettings((s) =>
                s ? { ...s, brief: { ...s.brief, sortByRecency: v } } : s
              )
            }
          />
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-[#D8D4C8]">
        <button
          type="button"
          onClick={() => void save()}
          disabled={status === "saving"}
          className={`${brief.sans} rounded-sm bg-[#2A79A7] px-4 py-2 text-sm font-medium text-[#F6F4EF] hover:bg-[#1C0B19] disabled:opacity-50 transition-colors`}
        >
          {status === "saving" ? "Saving…" : "Save settings"}
        </button>
        <Link
          href="/stewardshipbrief"
          className={`${brief.sans} text-sm ${brief.accent} ${brief.accentHover}`}
        >
          ← Back to brief
        </Link>
        {message && (
          <p
            className={`${brief.sans} text-xs ${
              status === "error" ? "text-red-800" : brief.muted
            }`}
          >
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
