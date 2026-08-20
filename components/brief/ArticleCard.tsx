"use client";

import { useState } from "react";
import Image from "next/image";
import type { BriefItem } from "@/lib/brief/items";
import { briefSettingsLabel } from "@/lib/brief/settingFilter";
import type { StoryImageMatch } from "@/lib/brief/storyImageTypes";
import { brief } from "@/components/brief/briefTheme";
import ShareMenu from "@/components/brief/ShareMenu";
import GraphicTakeawayButton from "@/components/brief/GraphicTakeawayButton";

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
  const settingLabel = briefSettingsLabel(item.settings, item.setting);
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
        <GraphicTakeawayButton item={item} image={image} />
      </div>
      {expanded && showDetail && (
        <DetailPanel item={item} skipMethodsResults={skipMethodsResults} />
      )}
    </div>
  );
}

/** Compact portrait thumb — sits left of headline so stories fit beside floats. */
function StoryThumb({
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
      className={`relative aspect-[4/5] w-[6.5rem] shrink-0 overflow-hidden bg-[#EFECE4] sm:w-[7.5rem] ${className ?? ""}`}
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
      <p className={`${brief.kicker} mb-3`}>
        <span className="inline-block border-b-2 border-[#FFA69E] pb-0.5">
          Lead story
        </span>
      </p>
      <div className={image ? "flex items-start gap-4" : undefined}>
        {image && (
          <StoryThumb
            image={image}
            priority
            sizes="120px"
            onError={onImageError}
          />
        )}
        <div className="min-w-0 flex-1">
          <MetaLine item={item} />
          <h2
            className={`${brief.serif} mt-1 text-[1.35rem] sm:text-[1.75rem] font-bold leading-[1.15] tracking-[-0.015em]`}
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
              className={`mt-3 ${brief.deck} text-[0.9375rem] sm:text-base leading-relaxed`}
            >
              {item.bottomLine}
            </p>
          )}
        </div>
      </div>
      {(item.methods || item.results) && (
        <div
          className={`mt-5 space-y-4 ${brief.sans} text-[0.9375rem] leading-relaxed`}
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

/** Shared card used for all non-lead stories — side thumb + text so floats can wrap. */
export function FeaturedStory({
  item,
  saved,
  onToggleSave,
  image,
  onImageError,
  bare = false,
  compact = false,
}: StoryProps & {
  bare?: boolean;
  /** Tighter spacing for lower-ranked text-only stories. */
  compact?: boolean;
}) {
  return (
    <article
      className={`py-5 ${bare ? "" : `border-b ${brief.hairline}`}`}
    >
      {image && (
        <StoryThumb
          image={image}
          sizes="120px"
          className="float-left mb-2 mr-3.5 w-[5.5rem] sm:w-[6.5rem]"
          onError={onImageError}
        />
      )}
      <MetaLine item={item} />
      <h2
        className={`${brief.serif} mt-1 ${
          compact ? "text-lg" : "text-xl"
        } font-bold leading-snug tracking-[-0.01em]`}
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
        <p className={`mt-2 ${brief.deck} text-[0.9375rem] leading-relaxed`}>
          {item.bottomLine}
        </p>
      )}
      <div className="clear-both" aria-hidden />
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
