"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
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

/**
 * Lead sits between left/right panels. Extra stories fill the center column
 * (single file) until past both panels, then continue full-width 2-column.
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
  const sideHRef = useRef(0);
  /** null = measure pass (all Also in center). */
  const [besideCount, setBesideCount] = useState<number | null>(null);
  const measureKey = `${lead?.item.pmid ?? ""}:${rest.map((r) => r.item.pmid).join(",")}`;

  // Remeasure when the story set changes.
  useLayoutEffect(() => {
    setBesideCount(null);
  }, [measureKey]);

  useLayoutEffect(() => {
    function pack() {
      if (typeof window !== "undefined" && window.innerWidth < 1024) {
        setBesideCount(rest.length);
        return;
      }

      const sideH = Math.max(
        newsRef.current?.offsetHeight ?? 0,
        toolsRef.current?.offsetHeight ?? 0
      );
      sideHRef.current = sideH;
      const leadH = leadRef.current?.offsetHeight ?? 0;
      if (sideH <= 0) {
        setBesideCount(rest.length);
        return;
      }

      let room = sideH - leadH;
      let count = 0;
      if (rest.length > 0 && room > 24) {
        const headingH = headingRef.current?.offsetHeight ?? 36;
        room -= headingH + 12;
        for (let i = 0; i < rest.length; i++) {
          const h = itemRefs.current[i]?.offsetHeight ?? 0;
          if (h <= 0 || h > room + 4) break;
          room -= h;
          count += 1;
        }
      }
      setBesideCount((prev) => (prev === count ? prev : count));
    }

    if (besideCount === null) {
      pack();
    }

    const onResize = () => setBesideCount(null);
    window.addEventListener("resize", onResize);

    const ro = new ResizeObserver(() => {
      const h = Math.max(
        newsRef.current?.offsetHeight ?? 0,
        toolsRef.current?.offsetHeight ?? 0
      );
      if (Math.abs(h - sideHRef.current) < 2) return;
      sideHRef.current = h;
      setBesideCount(null);
    });
    if (newsRef.current) ro.observe(newsRef.current);
    if (toolsRef.current) ro.observe(toolsRef.current);

    return () => {
      window.removeEventListener("resize", onResize);
      ro.disconnect();
    };
  }, [besideCount, rest.length]);

  const measuring = besideCount === null;
  const shownBeside = measuring ? rest.length : besideCount;
  const beside = rest.slice(0, shownBeside);
  const below = measuring ? [] : rest.slice(shownBeside);

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

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(180px,200px)_minmax(0,1fr)_minmax(180px,200px)] lg:items-start lg:gap-x-6">
        <aside
          ref={newsRef}
          className="order-2 rounded-sm bg-[#2A79A7] px-4 py-5 text-[#F6F4EF] lg:order-1"
          aria-label="In the news"
        >
          {left}
        </aside>

        <div className="order-1 min-w-0 lg:order-2">
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

          {beside.length > 0 && (
            <section aria-label="More stories" className="mt-5">
              <h2
                ref={headingRef}
                className={`${brief.kicker} mb-2 pb-3 border-b ${brief.hairline}`}
              >
                Also in today&apos;s brief
              </h2>
              <div className="mt-1">
                {beside.map((s, i) => (
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
          className="order-3 flex flex-col gap-8"
          aria-label="Brief tools"
        >
          {right}
        </aside>
      </div>

      {below.length > 0 && (
        <section
          aria-label={
            beside.length > 0 ? "More stories continued" : "More stories"
          }
          className="mt-6"
        >
          {beside.length === 0 && (
            <h2
              className={`${brief.kicker} mb-2 pb-3 border-b ${brief.hairline}`}
            >
              Also in today&apos;s brief
            </h2>
          )}
          <div className="mt-1 columns-1 gap-x-14 md:columns-2 [column-fill:_balance]">
            {below.map((s) => (
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
