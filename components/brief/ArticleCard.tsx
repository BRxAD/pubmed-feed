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
    <p className={`${brief.meta}`}>
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

function hasDetailContent(item: BriefItem): boolean {
  return Boolean(
    item.methods ||
      item.results ||
      item.title ||
      item.journal
  );
}

function DetailPanel({ item }: { item: BriefItem }) {
  return (
    <div
      className={`w-full mt-4 p-4 sm:p-5 space-y-4 ${brief.detailPanel} ${brief.sans} text-sm leading-[1.6] ${brief.ink}`}
    >
      {item.methods && (
        <div>
          <p className={brief.meta}>Methods</p>
          <p className="mt-1.5">{item.methods}</p>
        </div>
      )}
      {item.results && (
        <div>
          <p className={brief.meta}>Results</p>
          <p className="mt-1.5">{item.results}</p>
        </div>
      )}
      {(item.title || item.journal || item.jif != null) && (
        <div className={`${item.methods || item.results ? `pt-4 border-t ${brief.hairline}` : ""}`}>
          <p className={brief.meta}>Original title</p>
          {item.title && (
            <p className={`mt-1.5 leading-relaxed ${brief.muted}`}>{item.title}</p>
          )}
          {(item.journal || item.jif != null) && (
            <p className={`mt-2 text-[0.8125rem] leading-relaxed ${brief.muted}`}>
              {item.journal && <span>{item.journal}</span>}
              {item.jif != null && (
                <span>
                  {item.journal ? " · " : ""}
                  JIF {item.jif.toFixed(1)}
                  {item.jifIsHigh ? " ★" : ""}
                </span>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function StoryActions({
  item,
  saved,
  onToggleSave,
}: {
  item: BriefItem;
  saved: boolean;
  onToggleSave: (pmid: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const showDetail = hasDetailContent(item);

  return (
    <div className="mt-5">
      <div className={`flex flex-wrap items-center gap-x-5 gap-y-2`}>
        {showDetail && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className={`${brief.action} inline-flex items-center gap-1.5`}
            aria-expanded={expanded}
          >
            {expanded ? "Hide detail" : "Methods & results"}
            <span
              className={`inline-block text-[0.65rem] transition-transform ${expanded ? "rotate-180" : ""}`}
              aria-hidden
            >
              ▾
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={() => onToggleSave(item.pmid)}
          className={brief.action}
        >
          {saved ? "Saved ✓" : "Save"}
        </button>
        <a
          href={item.pubmedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={brief.action}
        >
          PubMed →
        </a>
      </div>
      {expanded && showDetail && <DetailPanel item={item} />}
    </div>
  );
}

function StoryBody({
  item,
  lead,
  saved,
  onToggleSave,
}: StoryProps & { lead: boolean }) {
  return (
    <>
      {lead && <p className={`${brief.kicker} mb-3`}>Lead story</p>}
      <MetaLine item={item} />
      <h2
        className={`${brief.serif} font-bold leading-[1.15] tracking-[-0.01em] ${
          lead ? "mt-3 text-[1.75rem] sm:text-[2.25rem]" : "mt-2 text-xl sm:text-[1.625rem]"
        }`}
      >
        <a
          href={item.pubmedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`${brief.ink} no-underline ${brief.accentHover} transition-colors`}
        >
          {item.headline}
        </a>
      </h2>
      {item.bottomLine && (
        <p
          className={`mt-4 pl-4 border-l-2 border-[#b0672e]/60 ${brief.deck} italic leading-relaxed ${
            lead ? "text-lg sm:text-xl" : "text-base sm:text-lg"
          }`}
        >
          {item.bottomLine}
        </p>
      )}
      <StoryActions item={item} saved={saved} onToggleSave={onToggleSave} />
    </>
  );
}

export function LeadStory({ item, saved, onToggleSave }: StoryProps) {
  return (
    <article
      className={`relative pb-12 mb-12 border-b-2 ${brief.rule} pl-5 sm:pl-6 before:absolute before:left-0 before:top-0 before:bottom-12 before:w-[3px] before:bg-[#b0672e]`}
    >
      <StoryBody item={item} lead saved={saved} onToggleSave={onToggleSave} />
    </article>
  );
}

export default function BriefArticleCard({
  item,
  saved,
  onToggleSave,
}: Omit<StoryProps, "lead">) {
  return (
    <article className={`py-9 border-b ${brief.hairline} last:border-0`}>
      <StoryBody
        item={item}
        lead={false}
        saved={saved}
        onToggleSave={onToggleSave}
      />
    </article>
  );
}
