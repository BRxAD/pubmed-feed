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

/** Shared vertical rhythm between Also stories / sections. */
const STORY_SECTION_GAP = "mt-5";

/**
 * Lead between left/right panels. Also stories stay single-file in the center
 * until both panels end, then full-width 2-col. Even vertical spacing.
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
  const [besideCount, setBesideCount] = useState<number | null>(null);
  const measureKey = `${lead?.item.pmid ?? ""}:${rest.map((r) => r.item.pmid).join(",")}`;

  useLayoutEffect(() => {
    setBesideCount(null);
  }, [measureKey]);

  useLayoutEffect(() => {
    function pack() {
      if (typeof window !== "undefined" && window.innerWidth < 1024) {
        setBesideCount(rest.length);
        return;
      }

      const newsH = newsRef.current?.offsetHeight ?? 0;
      const toolsH = toolsRef.current?.offsetHeight ?? 0;
      // Wait until *both* panels have ended.
      const bothH = Math.max(newsH, toolsH);
      sideSigRef.current = `${newsH}x${toolsH}`;
      const leadH = leadRef.current?.offsetHeight ?? 0;
      if (bothH <= 0) {
        setBesideCount(rest.length);
        return;
      }

      let used = leadH;
      let count = 0;
      if (rest.length > 0 && bothH - used > 24) {
        const headingH = headingRef.current?.offsetHeight ?? 36;
        used += headingH + 20;
        for (let i = 0; i < rest.length; i++) {
          const h = itemRefs.current[i]?.offsetHeight ?? 0;
          if (h <= 0 || used + h > bothH + 4) break;
          used += h;
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
      const newsH = newsRef.current?.offsetHeight ?? 0;
      const toolsH = toolsRef.current?.offsetHeight ?? 0;
      const sig = `${newsH}x${toolsH}`;
      if (sig === sideSigRef.current) return;
      sideSigRef.current = sig;
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

          {(beside.length > 0 || measuring) && rest.length > 0 && (
            <section aria-label="More stories" className={STORY_SECTION_GAP}>
              <AlsoHeading headingRefProp={headingRef} />
              <div className="mt-0">
                {(measuring ? rest : beside).map((s, i) => (
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
          className={STORY_SECTION_GAP}
        >
          {beside.length === 0 && <AlsoHeading />}
          <div className="columns-1 gap-x-10 md:columns-2 [column-fill:_balance]">
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
