"use client";

import { useState } from "react";
import Image from "next/image";
import type { BriefItem } from "@/lib/brief/items";
import { briefSettingLabel } from "@/lib/brief/settingFilter";
import type { StoryImageMatch } from "@/lib/brief/storyImageTypes";
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
  onToggleSave: (
    pmid: string,
    meta?: { title?: string | null; pubmedUrl?: string | null }
  ) => void;
  image?: StoryImageMatch | null;
  /** Called when a photo fails to load — parent can demote to text-only. */
  onImageError?: () => void;
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
  onToggleSave: (
    pmid: string,
    meta?: { title?: string | null; pubmedUrl?: string | null }
  ) => void;
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
            {expanded ? "Hide detail" : "More detail"}
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
          onClick={() =>
            onToggleSave(item.pmid, {
              title: item.headline || item.title,
              pubmedUrl: item.pubmedUrl,
            })
          }
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
          Read article
        </a>
      </div>
      {expanded && showDetail && <DetailPanel item={item} />}
    </div>
  );
}

function StoryImage({
  image,
  sizes,
  className,
  priority,
  onError,
}: {
  image: StoryImageMatch;
  sizes: string;
  className?: string;
  priority?: boolean;
  onError?: () => void;
}) {
  return (
    <div className={`relative overflow-hidden bg-[#EFECE4] ${className ?? ""}`}>
      <Image
        src={image.url}
        alt={image.label}
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover"
        onError={() => onError?.()}
      />
    </div>
  );
}

export function LeadStory({
  item,
  saved,
  onToggleSave,
  image,
  onImageError,
}: StoryProps) {
  const showImage = Boolean(image);

  return (
    <article className="pb-10 mb-10 border-b-2 border-[#2A79A7]/30">
      <p className={`${brief.kicker} mb-4`}>
        <span className="inline-block border-b-2 border-[#FFA69E] pb-0.5">
          Lead story
        </span>
      </p>
      <div
        className={
          showImage
            ? "grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-8 lg:items-start"
            : ""
        }
      >
        {showImage && image && (
          <StoryImage
            image={image}
            priority
            sizes="(max-width: 1024px) 100vw, 520px"
            className="aspect-[16/10] w-full lg:aspect-[5/4]"
            onError={onImageError}
          />
        )}
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
              className={`mt-4 ${brief.deck} text-base sm:text-[1.0625rem] leading-relaxed`}
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

export function FeaturedStory({
  item,
  saved,
  onToggleSave,
  image,
  onImageError,
  bare = false,
}: StoryProps & { bare?: boolean }) {
  return (
    <article className={`py-6 ${bare ? "" : `border-b ${brief.hairline}`}`}>
      <div
        className={
          image
            ? "grid gap-4 sm:grid-cols-[140px_1fr] sm:gap-5 items-start"
            : ""
        }
      >
        {image && (
          <StoryImage
            image={image}
            sizes="140px"
            className="aspect-[4/3] w-full sm:aspect-square"
            onError={onImageError}
          />
        )}
        <div className="min-w-0">
          <MetaLine item={item} />
          <h2
            className={`${brief.serif} mt-2 text-xl font-bold leading-snug tracking-[-0.01em]`}
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
              className={`mt-2.5 ${brief.deck} text-[0.9375rem] leading-relaxed`}
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

export function CompactStory({
  item,
  saved,
  onToggleSave,
  bare = false,
  image,
  onImageError,
}: StoryProps & { bare?: boolean }) {
  const showThumb = Boolean(image);

  return (
    <article
      className={`py-5 ${bare ? "" : `border-b ${brief.hairline} last:border-0`}`}
    >
      {showThumb && image && (
        <div className="relative mb-3 aspect-[16/9] w-full overflow-hidden bg-[#E8E4D9]">
          <StoryImage
            image={image}
            sizes="(max-width: 1024px) 100vw, 280px"
            className="absolute inset-0 h-full w-full"
            onError={onImageError}
          />
        </div>
      )}
      <MetaLine item={item} />
      <h2
        className={`${brief.serif} mt-2 text-xl font-bold leading-snug tracking-[-0.01em]`}
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
        <p className={`mt-2.5 ${brief.deck} text-[0.9375rem] leading-relaxed`}>
          {item.bottomLine}
        </p>
      )}
      <StoryActions item={item} saved={saved} onToggleSave={onToggleSave} />
    </article>
  );
}

export default function BriefArticleCard(props: StoryProps) {
  return props.image ? (
    <FeaturedStory {...props} />
  ) : (
    <CompactStory {...props} />
  );
}
