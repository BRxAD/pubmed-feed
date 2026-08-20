"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import type { BriefItem } from "@/lib/brief/items";
import type { StoryImageMatch } from "@/lib/brief/storyImageTypes";
import {
  LeadStory,
  FeaturedStory,
} from "@/components/brief/ArticleCard";
import { brief } from "@/components/brief/briefTheme";

type Ranked = {
  item: BriefItem;
  image: StoryImageMatch | null;
};

type Pack = {
  /** Also stories in the center column under the lead (beside both panels). */
  center: number;
  /** Also stories in the wide band beside the taller panel only. */
  wide: number;
  /** True when the left (news) panel is the shorter one. */
  leftIsShorter: boolean;
};

/** Shared vertical rhythm between Also stories / sections. */
const STORY_SECTION_GAP = "mt-5";
const SIDE_STRIP = "w-3 shrink-0"; // small gap on the freed panel side

/**
 * Lead between panels. Also fills the center until the shorter panel ends,
 * then a small side strip + 2-col band beside the taller panel, then
 * full-width 2-col after both panels. Article vertical spacing stays even.
 */
export default function BriefStoryLayout({
  lead,
  rest,
  left,
  right,
  saved,
  onToggleSave,
  onImageError,
}: {
  lead: Ranked | null;
  rest: Ranked[];
  left: ReactNode;
  right: ReactNode;
  saved: Set<string>;
  onToggleSave: (
    pmid: string,
    meta?: { title?: string | null; pubmedUrl?: string | null }
  ) => void;
  onImageError: (pmid: string) => void;
}) {
  const newsRef = useRef<HTMLElement | null>(null);
  const toolsRef = useRef<HTMLElement | null>(null);
  const leadRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const sideSigRef = useRef("");
  /** null = measure pass (all Also temporarily in center). */
  const [pack, setPack] = useState<Pack | null>(null);
  const measureKey = `${lead?.item.pmid ?? ""}:${rest.map((r) => r.item.pmid).join(",")}`;

  useLayoutEffect(() => {
    setPack(null);
  }, [measureKey]);

  useLayoutEffect(() => {
    function computePack(): Pack {
      if (typeof window !== "undefined" && window.innerWidth < 1024) {
        return {
          center: rest.length,
          wide: 0,
          leftIsShorter: true,
        };
      }

      const newsH = newsRef.current?.offsetHeight ?? 0;
      const toolsH = toolsRef.current?.offsetHeight ?? 0;
      const leadH = leadRef.current?.offsetHeight ?? 0;
      const shortH = Math.min(newsH, toolsH);
      const tallH = Math.max(newsH, toolsH);
      const leftIsShorter = newsH <= toolsH;
      sideSigRef.current = `${newsH}x${toolsH}`;

      const heights = rest.map((_, i) => itemRefs.current[i]?.offsetHeight ?? 0);
      const headingH = headingRef.current?.offsetHeight ?? 36;

      let used = leadH;
      let i = 0;
      let center = 0;
      let headingPlaced = false;

      const placeHeading = () => {
        if (!headingPlaced && rest.length > 0) {
          used += headingH + 20; // heading + STORY_SECTION_GAP
          headingPlaced = true;
        }
      };

      // Phase 1: center column until the shorter panel ends.
      while (i < rest.length && shortH > 0) {
        placeHeading();
        const h = heights[i];
        if (h <= 0) break;
        if (used + h > shortH + 4) break;
        used += h;
        center += 1;
        i += 1;
      }

      // Phase 2: wide band beside the taller panel (rendered as 2-col, so
      // vertical room fits roughly two stories per row).
      let wide = 0;
      const asymmetric = tallH - shortH > 48;
      if (asymmetric) {
        const bandStart = Math.max(used, shortH);
        let bandUsed = bandStart;
        while (i < rest.length) {
          placeHeading();
          const h = heights[i];
          if (h <= 0) break;
          // 2-col: pair stories share vertical space ≈ one story height.
          const step =
            i + 1 < rest.length
              ? Math.max(h, heights[i + 1] ?? h)
              : h;
          if (bandUsed + step > tallH + 4) break;
          bandUsed += step;
          const take = i + 1 < rest.length ? 2 : 1;
          wide += take;
          i += take;
        }
      }

      return { center, wide, leftIsShorter };
    }

    if (pack === null) {
      setPack(computePack());
    }

    const onResize = () => setPack(null);
    window.addEventListener("resize", onResize);

    const ro = new ResizeObserver(() => {
      const newsH = newsRef.current?.offsetHeight ?? 0;
      const toolsH = toolsRef.current?.offsetHeight ?? 0;
      const sig = `${newsH}x${toolsH}`;
      if (sig === sideSigRef.current) return;
      sideSigRef.current = sig;
      setPack(null);
    });
    if (newsRef.current) ro.observe(newsRef.current);
    if (toolsRef.current) ro.observe(toolsRef.current);

    return () => {
      window.removeEventListener("resize", onResize);
      ro.disconnect();
    };
  }, [pack, rest.length]);

  const measuring = pack === null;
  const centerN = measuring ? rest.length : pack.center;
  const wideN = measuring ? 0 : pack.wide;
  const leftIsShorter = pack?.leftIsShorter ?? true;

  const centerStories = rest.slice(0, centerN);
  const wideStories = rest.slice(centerN, centerN + wideN);
  const belowStories = measuring ? [] : rest.slice(centerN + wideN);

  const showHeadingInCenter = centerStories.length > 0;
  const showHeadingInWide =
    !showHeadingInCenter && wideStories.length > 0;
  const showHeadingBelow =
    !showHeadingInCenter &&
    !showHeadingInWide &&
    belowStories.length > 0;

  const newsSpansTall =
    !measuring && !leftIsShorter && wideStories.length > 0;
  const toolsSpansTall =
    !measuring && leftIsShorter && wideStories.length > 0;

  function renderStory(s: Ranked) {
    const hasImage = Boolean(s.image);
    return (
      <FeaturedStory
        item={s.item}
        image={s.image}
        bare
        compact={!hasImage}
        saved={saved.has(s.item.pmid)}
        onToggleSave={onToggleSave}
        onImageError={() => onImageError(s.item.pmid)}
      />
    );
  }

  function AlsoHeading({
    headingRefProp,
  }: {
    headingRefProp?: Ref<HTMLHeadingElement>;
  }) {
    return (
      <h2
        ref={headingRefProp}
        className={`${brief.kicker} mb-0 pb-3 border-b ${brief.hairline}`}
      >
        Also in today&apos;s brief
      </h2>
    );
  }

  function StoryList({
    stories,
    twoCol,
    measure = false,
  }: {
    stories: Ranked[];
    twoCol?: boolean;
    measure?: boolean;
  }) {
    return (
      <div
        className={
          twoCol
            ? "columns-1 gap-x-10 md:columns-2 [column-fill:_balance]"
            : undefined
        }
      >
        {stories.map((s, i) => (
          <div
            key={s.item.pmid}
            ref={
              measure
                ? (el) => {
                    itemRefs.current[i] = el;
                  }
                : undefined
            }
            className={`border-b border-[#D8D4C8] ${
              twoCol ? "break-inside-avoid" : ""
            }`}
          >
            {renderStory(s)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(180px,200px)_minmax(0,1fr)_minmax(180px,200px)] lg:items-start lg:gap-x-6">
        <aside
          ref={newsRef}
          className={`order-2 rounded-sm bg-[#2A79A7] px-4 py-5 text-[#F6F4EF] lg:order-1 lg:col-start-1 lg:row-start-1 ${
            newsSpansTall ? "lg:row-span-2" : ""
          }`}
          aria-label="In the news"
        >
          {left}
        </aside>

        <div className="order-1 min-w-0 lg:order-2 lg:col-start-2 lg:row-start-1">
          {lead && (
            <div ref={leadRef}>
              <LeadStory
                item={lead.item}
                image={lead.image}
                saved={saved.has(lead.item.pmid)}
                onToggleSave={onToggleSave}
                onImageError={() => onImageError(lead.item.pmid)}
              />
            </div>
          )}

          {(showHeadingInCenter || measuring) && rest.length > 0 && (
            <section aria-label="More stories" className={STORY_SECTION_GAP}>
              <AlsoHeading headingRefProp={headingRef} />
              <div className="mt-0">
                <StoryList
                  stories={measuring ? rest : centerStories}
                  measure={measuring || showHeadingInCenter}
                />
              </div>
            </section>
          )}
        </div>

        <aside
          ref={toolsRef}
          className={`order-3 flex flex-col gap-8 lg:col-start-3 lg:row-start-1 ${
            toolsSpansTall ? "lg:row-span-2" : ""
          }`}
          aria-label="Brief tools"
        >
          {right}
        </aside>

        {!measuring && wideStories.length > 0 && (
          <section
            aria-label="More stories"
            className={`order-4 min-w-0 lg:row-start-2 ${
              leftIsShorter
                ? "lg:col-start-1 lg:col-span-2"
                : "lg:col-start-2 lg:col-span-2"
            } ${showHeadingInWide ? STORY_SECTION_GAP : "lg:mt-0"}`}
          >
            {showHeadingInWide && <AlsoHeading />}
            {/* Small strip on the freed side, then 2-col in the remaining width. */}
            <div className="flex items-start gap-0">
              {leftIsShorter && (
                <div className={SIDE_STRIP} aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <StoryList stories={wideStories} twoCol />
              </div>
              {!leftIsShorter && (
                <div className={SIDE_STRIP} aria-hidden />
              )}
            </div>
          </section>
        )}
      </div>

      {belowStories.length > 0 && (
        <section
          aria-label={
            centerStories.length + wideStories.length > 0
              ? "More stories continued"
              : "More stories"
          }
          className={STORY_SECTION_GAP}
        >
          {showHeadingBelow && <AlsoHeading />}
          <StoryList stories={belowStories} twoCol />
        </section>
      )}
    </div>
  );
}
