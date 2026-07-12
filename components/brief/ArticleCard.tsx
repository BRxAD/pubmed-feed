"use client";

import { useState } from "react";
import Image from "next/image";
import type { BriefItem } from "@/lib/brief/items";
import { briefSettingLabel } from "@/lib/brief/settingFilter";
import { briefStoryImageUrl } from "@/lib/brief/storyImages";
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
          <span className="text-[#FFA69E]">New</span>
        </span>
      )}
    </p>
  );
}

function hasDetailContent(item: BriefItem): boolean {
  return Boolean(item.methods || item.results || item.title || item.journal);
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
        <div
          className={`${item.methods || item.results ? `pt-4 border-t ${brief.hairline}` : ""}`}
        >
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
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
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

function StoryImage({
  item,
  sizes,
  className,
  priority,
}: {
  item: BriefItem;
  sizes: string;
  className?: string;
  priority?: boolean;
}) {
  const src = briefStoryImageUrl(item.pmid, item.setting);
  return (
    <div className={`relative overflow-hidden bg-[#EFECE4] ${className ?? ""}`}>
      <Image
        src={src}
        alt=""
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover"
      />
    </div>
  );
}

/** Full-width lead: large image left, story right (stacks on mobile). */
export function LeadStory({ item, saved, onToggleSave }: StoryProps) {
  return (
    <article className={`pb-10 mb-10 border-b-2 ${brief.rule}`}>
      <p className={`${brief.kicker} mb-4`}>Lead story</p>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-8 lg:items-start">
        <StoryImage
          item={item}
          priority
          sizes="(max-width: 1024px) 100vw, 520px"
          className="aspect-[16/10] w-full lg:aspect-[5/4]"
        />
        <div>
          <MetaLine item={item} />
          <h2
            className={`${brief.serif} mt-3 text-[1.75rem] sm:text-[2.35rem] font-bold leading-[1.12] tracking-[-0.015em]`}
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
              className={`mt-4 ${brief.deck} italic leading-relaxed text-lg sm:text-xl`}
            >
              {item.bottomLine}
            </p>
          )}
          <StoryActions item={item} saved={saved} onToggleSave={onToggleSave} />
        </div>
      </div>
    </article>
  );
}

/** Featured story with side image (Toronto Star style). */
export function FeaturedStory({
  item,
  saved,
  onToggleSave,
  bare = false,
}: StoryProps & { bare?: boolean }) {
  return (
    <article className={`py-6 ${bare ? "" : `border-b ${brief.hairline}`}`}>
      <div className="grid gap-4 sm:grid-cols-[140px_1fr] sm:gap-5 items-start">
        <StoryImage
          item={item}
          sizes="140px"
          className="aspect-[4/3] w-full sm:aspect-square"
        />
        <div className="min-w-0">
          <MetaLine item={item} />
          <h2
            className={`${brief.serif} mt-2 text-xl sm:text-[1.375rem] font-bold leading-snug tracking-[-0.01em]`}
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
              className={`mt-2.5 ${brief.deck} italic text-[0.9375rem] leading-relaxed line-clamp-3`}
            >
              {item.bottomLine}
            </p>
          )}
          <StoryActions item={item} saved={saved} onToggleSave={onToggleSave} />
        </div>
      </div>
    </article>
  );
}

/** Compact text-only card for denser columns. */
export function CompactStory({
  item,
  saved,
  onToggleSave,
  bare = false,
}: StoryProps & { bare?: boolean }) {
  return (
    <article
      className={`py-5 ${bare ? "" : `border-b ${brief.hairline} last:border-0`}`}
    >
      <MetaLine item={item} />
      <h2
        className={`${brief.serif} mt-2 text-base sm:text-lg font-bold leading-snug`}
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
          className={`mt-2 ${brief.sans} text-sm leading-relaxed ${brief.muted} line-clamp-2`}
        >
          {item.bottomLine}
        </p>
      )}
      <StoryActions item={item} saved={saved} onToggleSave={onToggleSave} />
    </article>
  );
}

/** @deprecated Prefer FeaturedStory / CompactStory for the magazine layout. */
export default function BriefArticleCard(props: StoryProps) {
  return <FeaturedStory {...props} />;
}
