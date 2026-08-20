"use client";

import { useMemo, useState } from "react";
import type { BriefItem } from "@/lib/brief/items";
import type { TopPriorityItem } from "@/lib/brief/topPriority";
import type { BriefSettingFilter } from "@/lib/brief/settingFilter";
import type { StoryImageMatch } from "@/lib/brief/storyImageTypes";
import Masthead from "@/components/brief/Masthead";
import SiteNav from "@/components/brief/SiteNav";
import SiteFooter from "@/components/brief/SiteFooter";
import SettingBar from "@/components/brief/SettingBar";
import {
  LeadStory,
  FeaturedStory,
} from "@/components/brief/ArticleCard";
import TopPriorityPanel from "@/components/brief/TopPriorityPanel";
import InTheNewsPanel from "@/components/brief/InTheNewsPanel";
import SaveStreak, { useBriefSaved } from "@/components/brief/SaveStreak";
import DigestSignup from "@/components/brief/DigestSignup";
import { brief } from "@/components/brief/briefTheme";
import type { NewsItem } from "@/lib/news/types";

function formatToday(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function BriefPage({
  items,
  topPriority,
  setting,
  images,
  newsItems = [],
}: {
  items: BriefItem[];
  topPriority: TopPriorityItem[];
  setting: BriefSettingFilter;
  images: Record<string, StoryImageMatch | null>;
  newsItems?: NewsItem[];
}) {
  const { saved, savedItems, toggleSave } = useBriefSaved();
  const [brokenPmids, setBrokenPmids] = useState<Set<string>>(() => new Set());

  const ranked = useMemo(() => {
    return items.map((item) => ({
      item,
      image: brokenPmids.has(item.pmid) ? null : (images[item.pmid] ?? null),
    }));
  }, [items, images, brokenPmids]);

  const lead = ranked[0] ?? null;
  const rest = ranked.slice(1);

  function markBroken(pmid: string) {
    setBrokenPmids((prev) => {
      if (prev.has(pmid)) return prev;
      const next = new Set(prev);
      next.add(pmid);
      return next;
    });
  }

  return (
    <div className={`min-h-screen ${brief.bg} ${brief.ink}`}>
      <SiteNav active="/" showLogo={false} />
      <Masthead dateLabel={formatToday()} />

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <SettingBar active={setting} />

        {items.length === 0 ? (
          <p
            className={`mt-8 ${brief.sans} text-base leading-[1.55] ${brief.muted}`}
          >
            No studies matched this filter yet. Try another setting, or check
            back after the next ingest.
          </p>
        ) : (
          <>
            {/*
              Desktop: float news left + tools right. Lead uses a compact side
              thumb so it fits in the middle. Also is normal flow (not multicol
              BFC) so stories wrap under the news to the left edge.
            */}
            <div className="mt-6 flex flex-col gap-8 lg:block">
              <aside
                className="order-2 rounded-sm bg-[#2A79A7] px-4 py-5 text-[#F6F4EF] lg:float-left lg:mb-3 lg:mr-6 lg:w-[200px]"
                aria-label="In the news"
              >
                <InTheNewsPanel items={newsItems} variant="onSteel" />
              </aside>

              <aside
                className="order-3 flex flex-col gap-8 lg:float-right lg:mb-3 lg:ml-6 lg:w-[200px]"
                aria-label="Brief tools"
              >
                <div className="rounded-sm bg-[#FFA69E]/12 border border-[#FFA69E]/25 px-4 py-5">
                  <SaveStreak
                    savedCount={saved.size}
                    savedItems={savedItems}
                    onRemove={(pmid) => toggleSave(pmid)}
                  />
                </div>
                <div className="rounded-sm border-l-4 border-[#7BC1D4] pl-4">
                  <TopPriorityPanel items={topPriority} />
                </div>
                <div className="rounded-sm bg-[#EFECE4] border border-[#D8D4C8] px-4 py-5">
                  <DigestSignup />
                </div>
              </aside>

              <div className="order-1 min-w-0">
                {lead && (
                  <LeadStory
                    item={lead.item}
                    image={lead.image}
                    saved={saved.has(lead.item.pmid)}
                    onToggleSave={toggleSave}
                    onImageError={() => markBroken(lead.item.pmid)}
                  />
                )}

                {rest.length > 0 && (
                  <section aria-label="More stories" className="mt-5">
                    <h2
                      className={`${brief.kicker} mb-2 pb-3 border-b ${brief.hairline}`}
                    >
                      Also in today&apos;s brief
                    </h2>

                    <div className="mt-1">
                      {rest.map((s) => {
                        const hasImage = Boolean(s.image);
                        return (
                          <div
                            key={s.item.pmid}
                            className="border-b border-[#D8D4C8]"
                          >
                            <FeaturedStory
                              item={s.item}
                              image={s.image}
                              bare
                              compact={!hasImage}
                              saved={saved.has(s.item.pmid)}
                              onToggleSave={toggleSave}
                              onImageError={() => markBroken(s.item.pmid)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}
              </div>

              <div className="hidden lg:block lg:clear-both" aria-hidden />
            </div>
          </>
        )}
      </div>

      <SiteFooter />
    </div>
  );
}
