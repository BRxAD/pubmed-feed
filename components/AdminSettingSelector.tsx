"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ARTICLE_SETTING_LABELS,
  ARTICLE_SETTING_ORDER,
  type ArticleSetting,
} from "@/lib/classifySetting";

type Props = {
  topicId: string;
  pmid: string;
  /** Auto-classified settings (shown as hint). */
  autoSettings?: ArticleSetting[];
  /** @deprecated Prefer autoSettings — primary auto label. */
  autoSetting?: ArticleSetting | null;
  /** Saved override, if any. */
  initialSetting: ArticleSetting | null;
};

const OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Auto (classifier)" },
  ...ARTICLE_SETTING_ORDER.map((value) => ({
    value,
    label: ARTICLE_SETTING_LABELS[value],
  })),
];

export default function AdminSettingSelector({
  topicId,
  pmid,
  autoSettings,
  autoSetting,
  initialSetting,
}: Props) {
  const router = useRouter();
  const [setting, setSetting] = useState(initialSetting ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );

  useEffect(() => {
    setSetting(initialSetting ?? "");
  }, [initialSetting]);

  const onChange = useCallback(
    async (next: string) => {
      setSetting(next);
      setStatus("saving");

      try {
        const res = await fetch("/api/admin/summary-setting", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topicId,
            pmid,
            setting: next === "" ? null : next,
          }),
        });

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }

        setStatus("saved");
        router.refresh();
        setTimeout(() => setStatus("idle"), 2000);
      } catch {
        setStatus("error");
      }
    },
    [topicId, pmid, router]
  );

  const autoList =
    autoSettings && autoSettings.length > 0
      ? autoSettings
      : autoSetting
        ? [autoSetting]
        : [];
  const autoLabel =
    autoList.length > 0
      ? autoList.map((s) => ARTICLE_SETTING_LABELS[s] ?? s).join(" · ")
      : "unclassified";

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <label
        htmlFor={`setting-${pmid}`}
        className="font-medium text-amber-800 dark:text-amber-300"
      >
        Setting
      </label>
      <select
        id={`setting-${pmid}`}
        value={setting}
        onChange={(e) => onChange(e.target.value)}
        disabled={status === "saving"}
        className="rounded-md border border-amber-300 bg-white px-2 py-1 text-zinc-800 dark:border-amber-700 dark:bg-zinc-900 dark:text-zinc-100"
      >
        {OPTIONS.map((opt) => (
          <option key={opt.value || "auto"} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {!setting && (
        <span className="text-zinc-500">Auto: {autoLabel}</span>
      )}
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
