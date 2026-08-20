"use client";

import { useState } from "react";
import Image from "next/image";
import type { BriefItem } from "@/lib/brief/items";
import { briefSettingLabel } from "@/lib/brief/settingFilter";
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
  const settings =
    item.settings && item.settings.length > 0
      ? item.settings
      : item.setting
        ? [item.setting]
        : [];
  const labels = settings
    .map((s) => briefSettingLabel(s))
    .filter((s): s is string => Boolean(s));
  const primary = labels[0] ?? null;
  const rest = labels.slice(1);
  const dateLabel = formatDate(item.date);
  const mutedParts = [...rest, dateLabel].filter(Boolean);

  if (!primary && mutedParts.length === 0 && !item.isNew) return null;

  return (
    <p
      className={`${brief.sans} text-[0.75rem] font-medium uppercase tracking-[0.12em] sm:text-[0.8125rem]`}
    >
      {primary && (
        <span className="font-bold text-[#2A79A7]">{primary}</span>
      )}
      {mutedParts.length > 0 && (
        <span className={brief.muted}>
          {primary ? " · " : ""}
          {mutedParts.join(" · ")}
        </span>
      )}
      {item.isNew && (
        <span className={brief.muted}>
          {primary || mutedParts.length > 0 ? " · " : ""}
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
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
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

/** Side thumb — full photo visible (no crop); only rendered when a match exists. */
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
      className={`relative w-[8.5rem] shrink-0 bg-[#EFECE4] sm:w-[10.5rem] ${className ?? ""}`}
    >
      <Image
        src={image.url}
        alt={image.label}
        width={420}
        height={420}
        sizes={sizes}
        priority={priority}
        className="h-auto w-full object-contain object-center"
        onError={() => onError?.()}
      />
    </div>
  );
}

/** Lead photo — fixed 3:2 cover; omitted entirely when no match (no placeholder). */
function LeadImage({
  image,
  onError,
}: {
  image: StoryImageMatch;
  onError?: () => void;
}) {
  return (
    <div className="relative aspect-[3/2] w-full overflow-hidden bg-[#EFECE4]">
      <Image
        src={image.url}
        alt={image.label}
        fill
        sizes="(max-width: 1024px) 100vw, 42vw"
        priority
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
  const hasImage = Boolean(image);

  return (
    <article className="brief-lead-fade pb-2">
      <p className={`${brief.kicker} mb-5`}>
        <span className="inline-block border-b border-[#FFA69E] pb-0.5">
          Lead story
        </span>
      </p>

      <div
        className={
          hasImage
            ? "grid items-start gap-5 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-8"
            : undefined
        }
      >
        <div className="min-w-0">
          <MetaLine item={item} />
          <h2
            className={`${brief.serif} mt-1.5 text-[1.75rem] font-bold leading-[1.08] tracking-[-0.02em] sm:text-[2.125rem] sm:leading-[1.06] lg:text-[2.375rem] lg:leading-[1.05]`}
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
              className={`mt-3 ${brief.deck} text-[0.9375rem] leading-[1.55] sm:text-[1.0125rem] sm:leading-[1.55]`}
            >
              {item.bottomLine}
            </p>
          )}
          {(item.methods || item.results) && (
            <div
              className={`mt-4 space-y-3 ${brief.sans} text-[0.875rem] leading-[1.55] sm:text-[0.9375rem]`}
            >
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
          <StoryActions
            item={item}
            saved={saved}
            onToggleSave={onToggleSave}
            image={image}
            skipMethodsResults
          />
        </div>

        {image && (
          <div className="min-w-0 lg:pt-1">
            <LeadImage image={image} onError={onImageError} />
          </div>
        )}
      </div>
    </article>
  );
}

/**
 * Also / list cards — side thumb only when a topic-matched photo exists.
 * No empty image slot or logo placeholder.
 */
export function FeaturedStory({
  item,
  saved,
  onToggleSave,
  image,
  onImageError,
  bare = false,
  headlineTier = "secondary",
}: StoryProps & {
  bare?: boolean;
  /** @deprecated Uniform text cards; kept for call-site compatibility. */
  compact?: boolean;
  /** secondary = Also band (~20–22px); list = chronological band (~17–18px). */
  headlineTier?: "secondary" | "list";
}) {
  const headlineSize =
    headlineTier === "list"
      ? "text-[1.0625rem] leading-snug sm:text-[1.125rem]"
      : "text-[1.25rem] leading-snug sm:text-[1.375rem]";

  return (
    <article
      className={`py-5 ${bare ? "" : `border-b ${brief.hairline}`}`}
    >
      {image && (
        <StoryThumb
          image={image}
          sizes="(max-width: 640px) 136px, 168px"
          className="float-left mb-2 mr-3.5 w-[8.5rem] sm:w-[10.5rem]"
          onError={onImageError}
        />
      )}
      <MetaLine item={item} />
      <h2
        className={`${brief.serif} mt-1 font-bold tracking-[-0.015em] ${headlineSize}`}
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
        <p className={`mt-1.5 ${brief.deck} text-[0.875rem] leading-[1.5] sm:text-[0.9375rem]`}>
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
