"use client";

import { useState } from "react";
import type { BriefItem } from "@/lib/brief/items";
import { briefSettingLabel } from "@/lib/brief/settingFilter";
import { brief } from "@/components/brief/briefTheme";

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

type StoryProps = {
  item: BriefItem;
  lead?: boolean;
  saved: boolean;
  onToggleSave: (pmid: string) => void;
};

function MetaLine({ item }: { item: BriefItem }) {
  const settingLabel = briefSettingLabel(item.setting);
  const dateLabel = formatDate(item.date);
  const parts: string[] = [];
  if (settingLabel) parts.push(settingLabel);
  if (dateLabel) parts.push(dateLabel);

  return (
    <p className={`mt-2 ${brief.meta}`}>
      {parts.length > 0 && <span>{parts.join(" · ")}</span>}
      {item.isNew && (
        <span>
          {parts.length > 0 ? " · " : ""}
          <span className={brief.accent}>New</span>
        </span>
      )}
    </p>
  );
}

function OriginalTitleBlock({ item }: { item: BriefItem }) {
  return (
    <div className={`mt-3 pt-3 border-t ${brief.hairline}`}>
      <p className={`${brief.meta} mb-1`}>Original title</p>
      <p className={`${brief.sans} text-sm leading-relaxed ${brief.muted}`}>
        {item.title}
      </p>
      <p className={`mt-1 ${brief.sans} text-sm ${brief.muted}`}>
        {item.journal && <span>{item.journal}</span>}
        {item.jif != null && (
          <span>
            {item.journal ? " · " : ""}
            JIF {item.jif.toFixed(1)}
            {item.jifIsHigh ? " ★" : ""}
          </span>
        )}
      </p>
    </div>
  );
}

export function LeadStory({ item, saved, onToggleSave }: StoryProps) {
  return (
    <article className={`pb-10 mb-10 border-b-2 ${brief.rule}`}>
      <p className={brief.kicker}>Lead story</p>
      <MetaLine item={item} />
      <h2 className={`mt-3 ${brief.serif} text-3xl sm:text-4xl font-bold leading-tight`}>
        <a
          href={item.pubmedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`${brief.ink} ${brief.accentHover} transition-colors`}
        >
          {item.headline}
        </a>
      </h2>
      {item.bottomLine && (
        <p className={`mt-4 ${brief.serif} text-xl italic leading-relaxed ${brief.ink}`}>
          {item.bottomLine}
        </p>
      )}
      <StoryActions
        item={item}
        saved={saved}
        onToggleSave={onToggleSave}
        expandedDefault={false}
      />
      <OriginalTitleBlock item={item} />
    </article>
  );
}

function StoryActions({
  item,
  saved,
  onToggleSave,
  expandedDefault = false,
}: {
  item: BriefItem;
  saved: boolean;
  onToggleSave: (pmid: string) => void;
  expandedDefault?: boolean;
}) {
  const [expanded, setExpanded] = useState(expandedDefault);

  return (
    <div className={`mt-4 flex flex-wrap gap-x-5 gap-y-2 ${brief.sans} text-sm`}>
      {(item.methods || item.results) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={`${brief.accent} underline underline-offset-2 ${brief.accentHover}`}
        >
          {expanded ? "Hide methods & results" : "Methods & results"}
        </button>
      )}
      <button
        type="button"
        onClick={() => onToggleSave(item.pmid)}
        className={`${brief.accent} underline underline-offset-2 ${brief.accentHover}`}
      >
        {saved ? "Saved" : "Save"}
      </button>
      <a
        href={item.pubmedUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`${brief.accent} underline underline-offset-2 ${brief.accentHover}`}
      >
        PubMed →
      </a>
      {expanded && (item.methods || item.results) && (
        <div className={`w-full mt-4 space-y-3 ${brief.sans} text-sm leading-[1.55] ${brief.ink}`}>
          {item.methods && (
            <div>
              <p className={brief.meta}>Methods</p>
              <p className="mt-1">{item.methods}</p>
            </div>
          )}
          {item.results && (
            <div>
              <p className={brief.meta}>Results</p>
              <p className="mt-1">{item.results}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function BriefArticleCard({
  item,
  saved,
  onToggleSave,
}: Omit<StoryProps, "lead">) {
  return (
    <article className={`py-8 border-b ${brief.hairline} last:border-0`}>
      <MetaLine item={item} />
      <h2 className={`mt-2 ${brief.serif} text-xl sm:text-2xl font-bold leading-snug`}>
        <a
          href={item.pubmedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`${brief.ink} ${brief.accentHover} transition-colors`}
        >
          {item.headline}
        </a>
      </h2>
      {item.bottomLine && (
        <p className={`mt-3 ${brief.sans} text-base leading-[1.55] ${brief.ink}`}>
          {item.bottomLine}
        </p>
      )}
      <StoryActions item={item} saved={saved} onToggleSave={onToggleSave} />
      <OriginalTitleBlock item={item} />
    </article>
  );
}
