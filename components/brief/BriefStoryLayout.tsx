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

/** Between items inside one tier (~32–40px via card py). */
const ITEM_RULE = "border-b border-[#D8D4C8]";
/** Between editorial tiers (~64–80px). */
const TIER_GAP = "mt-16 sm:mt-20";

/**
 * Desktop: news/tools float beside stories. Single-file while both panels
 * remain; then 2-col continues immediately (may hang beside the taller panel —
 * no empty vertical gap).
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
  /** null = measure pass (all Also temporarily single-file). */
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
      // Single-file only while *both* panels are still beside the column.
      // After the shorter ends, 2-col continues immediately (taller may hang).
      const shortH = Math.min(newsH, toolsH);
      sideSigRef.current = `${newsH}x${toolsH}`;
      const leadH = leadRef.current?.offsetHeight ?? 0;
      if (shortH <= 0) {
        setBesideCount(rest.length);
        return;
      }

      let used = leadH;
      let count = 0;
      // Tier gap (~72px) + section eyebrow before Also items.
      if (rest.length > 0 && shortH - used > 24) {
        const headingH = headingRef.current?.offsetHeight ?? 40;
        used += headingH + 72;
        for (let i = 0; i < rest.length; i++) {
          const h = itemRefs.current[i]?.offsetHeight ?? 0;
          if (h <= 0 || used + h > shortH + 4) break;
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

  function renderStory(
    s: Ranked,
    headlineTier: "secondary" | "list" = "secondary"
  ) {
    return (
      <FeaturedStory
        item={s.item}
        image={s.image}
        bare
        headlineTier={headlineTier}
        saved={saved.has(s.item.pmid)}
        onToggleSave={onToggleSave}
        onImageError={() => onImageError(s.item.pmid)}
      />
    );
  }

  /** Matches the Lead story eyebrow: accent kicker + thin salmon rule. */
  function SectionEyebrow({
    children,
    headingRefProp,
  }: {
    children: ReactNode;
    headingRefProp?: Ref<HTMLHeadingElement>;
  }) {
    return (
      <h2
        ref={headingRefProp}
        className={`flow-root ${brief.kicker} mb-5`}
      >
        <span className="inline-block border-b border-[#FFA69E] pb-0.5">
          {children}
        </span>
      </h2>
    );
  }

  return (
    <div className="mt-6 grid grid-cols-1 gap-8 lg:block">
      <aside
        ref={newsRef}
        className="order-2 lg:float-left lg:mb-4 lg:mr-7 lg:w-[200px]"
        aria-label="In the news"
      >
        {left}
      </aside>

      <aside
        ref={toolsRef}
        className="order-3 flex flex-col gap-6 lg:float-right lg:mb-4 lg:ml-7 lg:w-[266px]"
        aria-label="Brief tools"
      >
        {right}
      </aside>

      <div className="order-1 min-w-0">
        {lead && (
          <div ref={leadRef} className="flow-root">
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
          <section aria-label="Also in today's brief" className={TIER_GAP}>
            <SectionEyebrow headingRefProp={headingRef}>
              Also in today&apos;s brief
            </SectionEyebrow>
            <div className="mt-0">
              {(measuring ? rest : beside).map((s, i) => (
                <div
                  key={s.item.pmid}
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  className={`flow-root ${ITEM_RULE}`}
                >
                  {renderStory(s, "secondary")}
                </div>
              ))}
            </div>
          </section>
        )}

        {below.length > 0 && (
          <section
            aria-label={
              beside.length > 0
                ? "More stories continued"
                : "Also in today's brief"
            }
            className={TIER_GAP}
          >
            <SectionEyebrow>
              {beside.length > 0 ? "More stories" : "Also in today's brief"}
            </SectionEyebrow>
            <div className="flow-root grid grid-cols-1 gap-x-10 gap-y-8 md:grid-cols-2 md:gap-y-10">
              {below.map((s) => (
                <div key={s.item.pmid} className={ITEM_RULE}>
                  {renderStory(s, "list")}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
