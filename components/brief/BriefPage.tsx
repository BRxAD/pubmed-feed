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
import SaveStreak, { useBriefSaved } from "@/components/brief/SaveStreak";
import DigestSignup from "@/components/brief/DigestSignup";
import { brief } from "@/components/brief/briefTheme";

function formatToday(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

type RankedStory = {
  item: BriefItem;
  image: StoryImageMatch | null;
};

export default function BriefPage({
  items,
  topPriority,
  setting,
  images,
}: {
  items: BriefItem[];
  topPriority: TopPriorityItem[];
  setting: BriefSettingFilter;
  /** Server-assigned images (null = text-only). */
  images: Record<string, StoryImageMatch | null>;
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
        <div className="lg:grid lg:grid-cols-[1fr_280px] lg:gap-12">
          <main>
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
                {lead && (
                  <div className="mt-6">
                    <LeadStory
                      item={lead.item}
                      image={lead.image}
                      saved={saved.has(lead.item.pmid)}
                      onToggleSave={toggleSave}
                      onImageError={() => markBroken(lead.item.pmid)}
                    />
                  </div>
                )}
              </>
            )}
          </main>

          <aside
            className={`mt-12 lg:mt-0 space-y-10 pt-2 border-t lg:border-t-0 ${brief.hairline}`}
          >
            <div className="rounded-sm border-l-4 border-[#7BC1D4] pl-4">
              <TopPriorityPanel items={topPriority} />
            </div>
            <div className="rounded-sm bg-[#FFA69E]/12 border border-[#FFA69E]/25 px-4 py-5">
              <SaveStreak
                savedCount={saved.size}
                savedItems={savedItems}
                onRemove={(pmid) => toggleSave(pmid)}
              />
            </div>
            <div className="rounded-sm bg-[#EFECE4] border border-[#D8D4C8] px-4 py-5">
              <DigestSignup />
            </div>
          </aside>
        </div>

        {rest.length > 0 && (
          <section aria-label="More stories" className="mt-2">
            <h2
              className={`${brief.kicker} mb-2 pb-3 border-b ${brief.hairline}`}
            >
              Also in today&apos;s brief
            </h2>

            {/*
              CSS columns pack stories top-to-bottom so a short card
              never leaves a tall empty hole beside a taller neighbor
              (the old paired-row grid did that on desktop).
            */}
            <div className="mt-1 columns-1 gap-x-14 md:columns-2 [column-fill:_balance]">
              {rest.map((s) => (
                <div
                  key={s.item.pmid}
                  className="break-inside-avoid border-b border-[#D8D4C8]"
                >
                  <FeaturedStory
                    item={s.item}
                    image={s.image}
                    bare
                    saved={saved.has(s.item.pmid)}
                    onToggleSave={toggleSave}
                    onImageError={() => markBroken(s.item.pmid)}
                  />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <SiteFooter />
    </div>
  );
}
