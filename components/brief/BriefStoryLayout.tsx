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

/**
 * Lead between panels. Also fills the center until the shorter panel ends,
 * then fills the freed side (single file) beside the taller panel, then
 * full-width 2-col after both panels.
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
          used += headingH + 12;
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

      // Phase 2: wide band beside the taller panel until it ends.
      let wide = 0;
      const asymmetric = tallH - shortH > 48;
      if (asymmetric) {
        // Continue height from what we already stacked in the center column.
        // The wide band starts at shortH visually; remaining room is tall - used
        // (or tall - short if center ended early below shortH).
        const bandStart = Math.max(used, shortH);
        let bandUsed = bandStart;
        while (i < rest.length) {
          placeHeading();
          const h = heights[i];
          if (h <= 0) break;
          if (bandUsed + h > tallH + 4) break;
          bandUsed += h;
          wide += 1;
          i += 1;
        }
      }

      return { center, wide, leftIsShorter };
    }

    if (pack === null) {
      const next = computePack();
      setPack(next);
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
  const belowStories = measuring
    ? []
    : rest.slice(centerN + wideN);

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
        className={`${brief.kicker} mb-2 pb-3 border-b ${brief.hairline}`}
      >
        Also in today&apos;s brief
      </h2>
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
            <section aria-label="More stories" className="mt-5">
              <AlsoHeading headingRefProp={headingRef} />
              <div className="mt-1">
                {(measuring ? rest : centerStories).map((s, i) => (
                  <div
                    key={s.item.pmid}
                    ref={(el) => {
                      itemRefs.current[i] = el;
                    }}
                    className="border-b border-[#D8D4C8]"
                  >
                    {renderStory(s)}
                  </div>
                ))}
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
            }`}
          >
            {showHeadingInWide && (
              <div className="mb-1">
                <AlsoHeading />
              </div>
            )}
            <div className={showHeadingInWide ? "mt-1" : "mt-5 lg:mt-0"}>
              {wideStories.map((s) => (
                <div
                  key={s.item.pmid}
                  className="border-b border-[#D8D4C8]"
                >
                  {renderStory(s)}
                </div>
              ))}
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
          className="mt-6"
        >
          {showHeadingBelow && <AlsoHeading />}
          <div className="mt-1 columns-1 gap-x-14 md:columns-2 [column-fill:_balance]">
            {belowStories.map((s) => (
              <div
                key={s.item.pmid}
                className="break-inside-avoid border-b border-[#D8D4C8]"
              >
                {renderStory(s)}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
