"use client";

import { useState } from "react";
import Image from "next/image";
import type { BriefItem } from "@/lib/brief/items";
import { briefSettingLabel } from "@/lib/brief/settingFilter";
import type { StoryImageMatch } from "@/lib/brief/storyImageTypes";
import { brief } from "@/components/brief/briefTheme";
import ShareMenu from "@/components/brief/ShareMenu";

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

function hasDetailContent(
  item: BriefItem,
  opts?: { skipMethodsResults?: boolean }
): boolean {
  if (opts?.skipMethodsResults) return Boolean(item.title || item.journal);
  return Boolean(item.methods || item.results || item.title || item.journal);
}

function DetailPanel({
  item,
  skipMethodsResults,
}: {
  item: BriefItem;
  skipMethodsResults?: boolean;
}) {
  const showMethods = !skipMethodsResults && item.methods;
  const showResults = !skipMethodsResults && item.results;
  return (
    <div
      className={`w-full mt-4 p-4 sm:p-5 space-y-4 ${brief.detailPanel} ${brief.sans} text-sm leading-[1.6] ${brief.ink}`}
    >
      {showMethods && (
        <div>
          <p className={brief.meta}>Methods</p>
          <p className="mt-1.5">{item.methods}</p>
        </div>
      )}
      {showResults && (
        <div>
          <p className={brief.meta}>Results</p>
          <p className="mt-1.5">{item.results}</p>
        </div>
      )}
      {(item.title || item.journal || item.jif != null) && (
        <div
          className={`${showMethods || showResults ? `pt-4 border-t ${brief.hairline}` : ""}`}
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
  image,
  skipMethodsResults,
}: {
  item: BriefItem;
  saved: boolean;
  onToggleSave: (
    pmid: string,
    meta?: { title?: string | null; pubmedUrl?: string | null }
  ) => void;
  image?: StoryImageMatch | null;
  skipMethodsResults?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const showDetail = hasDetailContent(item, { skipMethodsResults });

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
        <ShareMenu item={item} image={image} />
      </div>
      {expanded && showDetail && (
        <DetailPanel item={item} skipMethodsResults={skipMethodsResults} />
      )}
    </div>
  );
}

/** 16:9 cover crop — keeps card rhythm consistent across the brief. */
function StoryImage({
  image,
  sizes,
  priority,
  onError,
  className,
}: {
  image: StoryImageMatch;
  sizes: string;
  priority?: boolean;
  onError?: () => void;
  className?: string;
}) {
  return (
    <div
      className={`relative aspect-[16/9] w-full overflow-hidden bg-[#EFECE4] ${className ?? ""}`}
    >
      <Image
        src={image.url}
        alt={image.label}
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover object-center"
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
  return (
    <article className="brief-lead-fade pb-2">
      <p className={`${brief.kicker} mb-4`}>
        <span className="inline-block border-b-2 border-[#FFA69E] pb-0.5">
          Lead story
        </span>
      </p>
      {image && (
        <StoryImage
          image={image}
          priority
          sizes="(max-width: 1024px) 100vw, 720px"
          className="mb-5"
          onError={onImageError}
        />
      )}
      <MetaLine item={item} />
      <h2
        className={`${brief.serif} mt-3 text-[1.75rem] sm:text-[2.35rem] font-bold leading-[1.12] tracking-[-0.015em]`}
      >
        <a
          href={item.pubmedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`brief-story-link ${brief.ink} no-underline ${brief.accentHover}`}
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
      {(item.methods || item.results) && (
        <div
          className={`mt-6 space-y-4 ${brief.sans} text-[0.9375rem] leading-relaxed`}
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
        </div>
      )}
      <StoryActions
        item={item}
        saved={saved}
        onToggleSave={onToggleSave}
        image={image}
        skipMethodsResults
      />
    </article>
  );
}

/** Shared card used for all non-lead stories — stacked 16:9 + text. */
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
      {image && (
        <StoryImage
          image={image}
          sizes="(max-width: 768px) 100vw, 420px"
          className="mb-4"
          onError={onImageError}
        />
      )}
      <MetaLine item={item} />
      <h2
        className={`${brief.serif} mt-2 text-xl font-bold leading-snug tracking-[-0.01em]`}
      >
        <a
          href={item.pubmedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`brief-story-link ${brief.ink} no-underline ${brief.accentHover}`}
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
      <StoryActions
        item={item}
        saved={saved}
        onToggleSave={onToggleSave}
        image={image}
      />
    </article>
  );
}

export function CompactStory(props: StoryProps & { bare?: boolean }) {
  return <FeaturedStory {...props} />;
}

export default function BriefArticleCard(props: StoryProps) {
  return <FeaturedStory {...props} />;
}
