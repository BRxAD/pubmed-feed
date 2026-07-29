"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { BriefFeedSettings } from "@/lib/brief/feedSettings";
import { brief } from "@/components/brief/briefTheme";

type Props = {
  initialSecret: string;
};

type Q1Journal = {
  name: string;
  sjr: number;
  issn: string;
  hIndex: number | null;
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
  disabled,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  disabled?: boolean;
}) {
  const display = format ? format(value) : String(value);
  return (
    <label className={`block ${disabled ? "opacity-45" : ""}`}>
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
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-[#2A79A7] disabled:cursor-not-allowed"
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

/** Toggle that preserves the last non-off value when re-enabled. */
function ToggleableSlider({
  label,
  hint,
  value,
  offValue,
  defaultOnValue,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  offValue: number;
  defaultOnValue: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const lastOn = useRef(value === offValue ? defaultOnValue : value);
  if (value !== offValue) lastOn.current = value;
  const enabled = value !== offValue;

  return (
    <div className="space-y-2">
      <ToggleRow
        label={label}
        hint={hint}
        checked={enabled}
        onChange={(on) =>
          onChange(on ? lastOn.current || defaultOnValue : offValue)
        }
      />
      <SliderRow
        label="Weight"
        value={enabled ? value : lastOn.current || defaultOnValue}
        min={min}
        max={max}
        step={step}
        format={format}
        disabled={!enabled}
        onChange={onChange}
      />
    </div>
  );
}

function ClinicalPointRow({
  label,
  hint,
  defaultPoints,
  value,
  allowNegative,
  onChange,
}: {
  label: string;
  hint?: string;
  defaultPoints: number;
  value: number;
  allowNegative?: boolean;
  onChange: (v: number) => void;
}) {
  const offValue = 0;
  const lastOn = useRef(value === offValue ? defaultPoints : value);
  if (value !== offValue) lastOn.current = value;
  const enabled = value !== offValue;
  const sign = defaultPoints < 0 ? "" : "+";

  return (
    <div className="rounded-sm border border-[#D8D4C8] bg-[#EFECE4]/40 p-3 space-y-2">
      <ToggleRow
        label={`${label} (default ${sign}${defaultPoints})`}
        hint={hint}
        checked={enabled}
        onChange={(on) =>
          onChange(on ? lastOn.current || defaultPoints : offValue)
        }
      />
      <label className={`block ${enabled ? "" : "opacity-45"}`}>
        <div className="flex items-baseline justify-between gap-2">
          <span className={`${brief.sans} text-xs ${brief.muted}`}>Points</span>
          <span className={`${brief.sans} text-sm tabular-nums ${brief.accent}`}>
            {enabled
              ? `${value > 0 ? "+" : ""}${value}`
              : `${defaultPoints > 0 ? "+" : ""}${lastOn.current || defaultPoints} (off)`}
          </span>
        </div>
        <input
          type="range"
          min={allowNegative ? -5 : 1}
          max={allowNegative ? 0 : 5}
          step={1}
          value={enabled ? value : lastOn.current || defaultPoints}
          disabled={!enabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="mt-2 w-full accent-[#2A79A7] disabled:cursor-not-allowed"
        />
      </label>
    </div>
  );
}

function Q1JournalList({ secret }: { secret: string }) {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [items, setItems] = useState<Q1Journal[]>([]);
  const [total, setTotal] = useState(0);
  const [count, setCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const limit = 40;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setOffset(0);
  }, [debouncedQ]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          q: debouncedQ,
          limit: String(limit),
          offset: String(offset),
        });
        const res = await fetch(`/api/brief/settings/q1-journals?${params}`, {
          headers: { "x-brief-admin-secret": secret },
        });
        const data = (await res.json()) as {
          ok?: boolean;
          items?: Q1Journal[];
          total?: number;
          count?: number;
          error?: string;
        };
        if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to load");
        if (!cancelled) {
          setItems(data.items ?? []);
          setTotal(data.total ?? 0);
          setCount(data.count ?? 0);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Load failed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [secret, debouncedQ, offset]);

  return (
    <div className="space-y-3">
      <p className={`${brief.sans} text-xs ${brief.muted}`}>
        SCImago Journal Rank 2025 Q1 list ({count.toLocaleString()} journals).
        Used when the “Q1 journal” rubric is on.
      </p>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search journal name or ISSN…"
        className={`w-full ${brief.sans} text-sm bg-transparent border-0 border-b ${brief.rule} py-2 focus:outline-none focus:border-[#2A79A7] ${brief.ink}`}
      />
      {error && (
        <p className={`${brief.sans} text-xs text-red-800`}>{error}</p>
      )}
      <div className={`max-h-80 overflow-y-auto border ${brief.hairline} rounded-sm`}>
        {loading && items.length === 0 ? (
          <p className={`${brief.sans} text-xs ${brief.muted} p-3`}>Loading…</p>
        ) : items.length === 0 ? (
          <p className={`${brief.sans} text-xs ${brief.muted} p-3`}>
            No matching journals.
          </p>
        ) : (
          <ul className="divide-y divide-[#D8D4C8]">
            {items.map((j) => (
              <li key={`${j.name}-${j.issn}`} className="px-3 py-2">
                <p className={`${brief.sans} text-sm ${brief.ink}`}>{j.name}</p>
                <p className={`${brief.sans} text-[0.6875rem] ${brief.muted}`}>
                  SJR {j.sjr.toFixed(3)}
                  {j.issn ? ` · ISSN ${j.issn}` : ""}
                  {j.hIndex != null ? ` · h-index ${j.hIndex}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className={`${brief.sans} text-xs ${brief.muted}`}>
          {total.toLocaleString()} match{total === 1 ? "" : "es"}
          {loading ? " · updating…" : ""}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={offset <= 0 || loading}
            onClick={() => setOffset((o) => Math.max(0, o - limit))}
            className={`${brief.sans} text-xs ${brief.accent} disabled:opacity-40`}
          >
            ← Prev
          </button>
          <button
            type="button"
            disabled={offset + limit >= total || loading}
            onClick={() => setOffset((o) => o + limit)}
            className={`${brief.sans} text-xs ${brief.accent} disabled:opacity-40`}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

const CLINICAL_RULES: {
  key:
    | "q1Journal"
    | "rctOrSr"
    | "multicenter"
    | "clinicalStewardship"
    | "novelty"
    | "cohort"
    | "intervention"
    | "guideline"
    | "nonHumanPenalty";
  label: string;
  hint: string;
  defaultPoints: number;
  allowNegative?: boolean;
}[] = [
  {
    key: "q1Journal",
    label: "Q1 journals",
    hint: "SCImago 2025 Q1 list (browse below).",
    defaultPoints: 2,
  },
  {
    key: "rctOrSr",
    label: "RCT or systematic review",
    hint: "Randomized trial or systematic review / meta-analysis.",
    defaultPoints: 2,
  },
  {
    key: "multicenter",
    label: "Multicenter",
    hint: "Multi-center / multi-site study.",
    defaultPoints: 2,
  },
  {
    key: "clinicalStewardship",
    label: "Human clinical antibiotic use / stewardship",
    hint: "Relevant to human clinical antibiotic use or stewardship.",
    defaultPoints: 2,
  },
  {
    key: "novelty",
    label: "Novelty",
    hint: "Novel concept likely not previously addressed.",
    defaultPoints: 1,
  },
  {
    key: "cohort",
    label: "Cohort study",
    defaultPoints: 1,
    hint: "Cohort / observational cohort design.",
  },
  {
    key: "intervention",
    label: "Interventional study",
    hint: "An intervention occurs (not purely descriptive).",
    defaultPoints: 1,
  },
  {
    key: "guideline",
    label: "Guideline",
    hint: "Guideline, consensus statement, or practice recommendation.",
    defaultPoints: 2,
  },
  {
    key: "nonHumanPenalty",
    label: "Solely animal or environmental (non-human)",
    hint: "Penalty when the work is solely non-human.",
    defaultPoints: -2,
    allowNegative: true,
  },
];

export default function SettingsDashboard({ initialSecret }: Props) {
  const [settings, setSettings] = useState<BriefFeedSettings | null>(null);
  const [defaults, setDefaults] = useState<BriefFeedSettings | null>(null);
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
        defaults?: BriefFeedSettings;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.settings) {
        throw new Error(data.error ?? "Failed to load settings");
      }
      setSettings(data.settings);
      if (data.defaults) setDefaults(data.defaults);
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

  if (!settings || !defaults) {
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
        <p className={`mb-4 ${brief.sans} text-xs ${brief.muted}`}>
          Turn each rule on or off. When off, it contributes nothing to the score.
        </p>
        <div className="grid gap-6 sm:grid-cols-2">
          <ToggleableSlider
            label="Stewardship in title"
            hint="Points when stewardship appears in the article title."
            value={settings.stewardshipTitle}
            offValue={0}
            defaultOnValue={defaults.stewardshipTitle}
            min={5}
            max={120}
            step={5}
            onChange={(v) =>
              setSettings((s) => s && { ...s, stewardshipTitle: v })
            }
          />
          <ToggleableSlider
            label="Stewardship in abstract"
            value={settings.stewardshipAbstract}
            offValue={0}
            defaultOnValue={defaults.stewardshipAbstract}
            min={5}
            max={50}
            step={5}
            onChange={(v) =>
              setSettings((s) => s && { ...s, stewardshipAbstract: v })
            }
          />
          <ToggleableSlider
            label="Large study bonus"
            hint={`Award when sample size exceeds ${settings.brief.largeStudyThreshold}.`}
            value={settings.largeStudy}
            offValue={0}
            defaultOnValue={defaults.largeStudy}
            min={5}
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
            hint="Legacy quality multiplier for RCTs and SRs."
            checked={settings.studyTypeBoost}
            onChange={(v) =>
              setSettings((s) => s && { ...s, studyTypeBoost: v })
            }
          />
          <ToggleRow
            label="JIF ×1.2 for top-50% journals"
            hint="Legacy journal-impact multiplier (separate from Q1 rubric points)."
            checked={settings.jifMultiplier}
            onChange={(v) =>
              setSettings((s) => s && { ...s, jifMultiplier: v })
            }
          />
        </div>
      </section>

      <section>
        <h2 className={`${brief.kicker} mb-4 pb-2 border-b ${brief.hairline}`}>
          Relevance down-rates
        </h2>
        <p className={`${brief.sans} text-sm ${brief.muted} mb-4`}>
          Multipliers on final relevance (lower = stronger down-rate). Turn off
          to leave that factor at ×1.00.
        </p>
        <div className="grid gap-6 sm:grid-cols-2">
          <ToggleableSlider
            label="Veterinary (non–One Health)"
            value={settings.veterinary}
            offValue={1}
            defaultOnValue={defaults.veterinary}
            min={0.1}
            max={0.95}
            step={0.05}
            format={(v) => `×${v.toFixed(2)}`}
            onChange={(v) => setSettings((s) => s && { ...s, veterinary: v })}
          />
          <ToggleableSlider
            label="Single-center, small sample"
            value={settings.singleCenterSmall}
            offValue={1}
            defaultOnValue={defaults.singleCenterSmall}
            min={0.1}
            max={0.95}
            step={0.05}
            format={(v) => `×${v.toFixed(2)}`}
            onChange={(v) =>
              setSettings((s) => s && { ...s, singleCenterSmall: v })
            }
          />
          <ToggleableSlider
            label="Small-scope descriptive AMR/use"
            value={settings.descriptiveAmr}
            offValue={1}
            defaultOnValue={defaults.descriptiveAmr}
            min={0.1}
            max={0.95}
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
          <ToggleableSlider
            label="Minimum combined penalty floor"
            hint="Floor for stacked penalties."
            value={settings.minFactor}
            offValue={1}
            defaultOnValue={defaults.minFactor}
            min={0.1}
            max={0.95}
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
            hint="Lookback used by brief settings (main column still uses its article-date window)."
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
            label="Lead by recency, then priority"
            hint="On (default): newest article date first; highest priority wins ties. Off: highest priority first, then newest date."
            checked={settings.brief.leadByRecency}
            onChange={(v) =>
              setSettings((s) =>
                s ? { ...s, brief: { ...s.brief, leadByRecency: v } } : s
              )
            }
          />
        </div>
      </section>

      <section>
        <h2 className={`${brief.kicker} mb-4 pb-2 border-b ${brief.hairline}`}>
          Clinical relevance rubric
        </h2>
        <p className={`mb-4 ${brief.sans} text-xs ${brief.muted}`}>
          Editorial point scale. Each rule can be turned off. Active points are
          scaled ×10 in the relevance score (so +2 → +20).
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {CLINICAL_RULES.map((rule) => (
            <ClinicalPointRow
              key={rule.key}
              label={rule.label}
              hint={rule.hint}
              defaultPoints={rule.defaultPoints}
              value={settings[rule.key]}
              allowNegative={rule.allowNegative}
              onChange={(v) =>
                setSettings((s) => (s ? { ...s, [rule.key]: v } : s))
              }
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className={`${brief.kicker} mb-4 pb-2 border-b ${brief.hairline}`}>
          Q1 journals list
        </h2>
        <Q1JournalList secret={initialSecret} />
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
        <button
          type="button"
          onClick={() => {
            setSettings({
              ...defaults,
              brief: { ...defaults.brief },
            });
            setMessage("Reset to defaults — click Save to persist.");
          }}
          className={`${brief.sans} text-sm ${brief.accent} ${brief.accentHover}`}
        >
          Reset to defaults
        </button>
        <Link
          href="/"
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
