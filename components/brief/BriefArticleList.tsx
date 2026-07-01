"use client";

import { useState } from "react";
import type { BriefItem } from "@/lib/brief/items";

const SETTING_LABELS: Record<string, string> = {
  hospital: "Hospital",
  community: "Community / Outpatient",
  "long-term care": "Long-term care",
  animal: "Animal / Veterinary",
  environment: "Environment",
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.includes("T") ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatToday(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function MetaRow({ item }: { item: BriefItem }) {
  const settingLabel = item.setting ? SETTING_LABELS[item.setting] ?? item.setting : null;
  return (
    <p className="mt-1 text-sm text-zinc-600">
      {item.journal && <span>{item.journal}</span>}
      {item.jif != null && (
        <span>
          {item.journal ? " · " : ""}
          JIF {item.jif.toFixed(1)}
          {item.jifIsHigh ? " ★" : ""}
        </span>
      )}
      {item.date && <span> · {formatDate(item.date)}</span>}
      {settingLabel && <span> · {settingLabel}</span>}
    </p>
  );
}

function BriefStory({ item, lead = false }: { item: BriefItem; lead?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <article className={lead ? "pb-8 mb-8 border-b border-zinc-300" : "py-6 border-b border-zinc-200 last:border-0"}>
      <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-zinc-500">
        {item.isNew && (
          <span className="font-semibold text-amber-700">New</span>
        )}
        <span>
          Priority {item.effectivePriority}
          {item.prioritySource === "predicted" ? " (predicted)" : ""}
        </span>
        {item.studyLabel && <span> · {item.studyLabel}</span>}
      </div>

      <h2 className={lead ? "mt-2 text-2xl font-semibold leading-snug text-zinc-900" : "mt-2 text-lg font-semibold leading-snug text-zinc-900"}>
        <a
          href={item.pubmedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-amber-800"
        >
          {item.title}
        </a>
      </h2>

      <MetaRow item={item} />

      {item.bottomLine && (
        <p className="mt-3 text-zinc-800 leading-relaxed">{item.bottomLine}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        {(item.methods || item.results) && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-amber-800 underline underline-offset-2 hover:text-amber-950"
          >
            {expanded ? "Hide methods & results" : "Methods & results"}
          </button>
        )}
        <a
          href={item.pubmedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-amber-800 underline underline-offset-2 hover:text-amber-950"
        >
          PubMed →
        </a>
      </div>

      {expanded && (item.methods || item.results) && (
        <div className="mt-4 space-y-3 text-sm text-zinc-700 leading-relaxed">
          {item.methods && (
            <div>
              <p className="font-medium text-zinc-900">Methods</p>
              <p>{item.methods}</p>
            </div>
          )}
          {item.results && (
            <div>
              <p className="font-medium text-zinc-900">Results</p>
              <p>{item.results}</p>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export default function BriefArticleList({
  items,
  newSinceYesterday,
  daysBack,
}: {
  items: BriefItem[];
  newSinceYesterday: number;
  daysBack: number;
}) {
  const [lead, ...rest] = items;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-300 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
            Antimicrobial stewardship · PubMed
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            The Stewardship Brief
          </h1>
          <p className="mt-2 text-zinc-600">{formatToday()}</p>
          <p className="mt-3 text-sm text-zinc-600">
            {newSinceYesterday > 0 ? (
              <>
                <span className="font-medium text-zinc-900">{newSinceYesterday} new</span>{" "}
                since yesterday ·{" "}
              </>
            ) : null}
            {items.length} stud{items.length === 1 ? "y" : "ies"} at priority 5+
            (last {daysBack} days)
          </p>
          <nav className="mt-4 flex gap-4 text-sm">
            <a href="/feed" className="text-amber-800 hover:underline">
              Full feed →
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {items.length === 0 ? (
          <p className="text-zinc-600">
            No PubMed studies met priority 5+ in the last {daysBack} days. Check back
            after the next ingest, or rate articles on the{" "}
            <a href="/feed" className="text-amber-800 underline">
              main feed
            </a>
            .
          </p>
        ) : (
          <>
            {lead && (
              <section aria-label="Lead story">
                <p className="text-xs uppercase tracking-wide text-amber-800 font-semibold mb-2">
                  Lead story
                </p>
                <BriefStory item={lead} lead />
              </section>
            )}
            {rest.length > 0 && (
              <section aria-label="More stories" className="mt-2">
                <h2 className="sr-only">More stories</h2>
                {rest.map((item) => (
                  <BriefStory key={item.pmid} item={item} />
                ))}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
