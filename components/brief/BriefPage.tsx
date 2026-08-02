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
  CompactStory,
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

function buildLayoutRows(ranked: RankedStory[]): {
  lead: RankedStory | null;
  rows: Array<{ featured: RankedStory | null; compacts: RankedStory[] }>;
} {
  const [lead, ...rest] = ranked;
  // Strict (tier A) images drive featured columns; thematic (tier B) stay compact.
  const withStrictImage = rest.filter((s) => s.image?.tier === "strict");
  const compactPool = rest.filter((s) => s.image?.tier !== "strict");

  const rows: Array<{ featured: RankedStory | null; compacts: RankedStory[] }> =
    [];
  let iFeat = 0;
  let iComp = 0;

  while (iFeat < withStrictImage.length || iComp < compactPool.length) {
    const featured = withStrictImage[iFeat] ?? null;
    if (featured) iFeat += 1;

    const compacts: RankedStory[] = [];
    while (compacts.length < 2 && iComp < compactPool.length) {
      compacts.push(compactPool[iComp]!);
      iComp += 1;
    }

    if (!featured && compacts.length === 0) break;
    rows.push({ featured, compacts });

    if (!featured && iComp < compactPool.length) {
      while (iComp < compactPool.length) {
        const batch: RankedStory[] = [];
        while (batch.length < 3 && iComp < compactPool.length) {
          batch.push(compactPool[iComp]!);
          iComp += 1;
        }
        rows.push({ featured: null, compacts: batch });
      }
    }
  }

  return { lead: lead ?? null, rows };
}

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

  const { lead, rows } = useMemo(() => buildLayoutRows(ranked), [ranked]);

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

                {rows.length > 0 && (
                  <section aria-label="More stories">
                    <h2
                      className={`${brief.kicker} mb-2 pb-3 border-b ${brief.hairline}`}
                    >
                      Also in today&apos;s brief
                    </h2>

                    {rows.map((row, idx) => {
                      const key =
                        row.featured?.item.pmid ??
                        row.compacts[0]?.item.pmid ??
                        `row-${idx}`;

                      if (row.featured && row.compacts.length > 0) {
                        return (
                          <div
                            key={key}
                            className="grid items-start gap-0 lg:grid-cols-[1.35fr_1fr] lg:gap-8 border-b border-[#D8D4C8]"
                          >
                            <FeaturedStory
                              item={row.featured.item}
                              image={row.featured.image}
                              bare
                              saved={saved.has(row.featured.item.pmid)}
                              onToggleSave={toggleSave}
                              onImageError={() =>
                                markBroken(row.featured!.item.pmid)
                              }
                            />
                            <div className="lg:border-l lg:border-[#D8D4C8] lg:pl-8 divide-y divide-[#D8D4C8]">
                              {row.compacts.map((s) => (
                                <CompactStory
                                  key={s.item.pmid}
                                  item={s.item}
                                  bare
                                  image={s.image}
                                  saved={saved.has(s.item.pmid)}
                                  onToggleSave={toggleSave}
                                  onImageError={() => markBroken(s.item.pmid)}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      }

                      if (row.featured) {
                        return (
                          <FeaturedStory
                            key={key}
                            item={row.featured.item}
                            image={row.featured.image}
                            saved={saved.has(row.featured.item.pmid)}
                            onToggleSave={toggleSave}
                            onImageError={() =>
                              markBroken(row.featured!.item.pmid)
                            }
                          />
                        );
                      }

                      return (
                        <div
                          key={key}
                          className="grid items-start gap-0 sm:grid-cols-2 lg:grid-cols-3 border-b border-[#D8D4C8] divide-y sm:divide-y-0 sm:divide-x divide-[#D8D4C8]"
                        >
                          {row.compacts.map((s) => (
                            <div
                              key={s.item.pmid}
                              className="sm:px-4 first:sm:pl-0 last:sm:pr-0"
                            >
                              <CompactStory
                                item={s.item}
                                bare
                                image={s.image}
                                saved={saved.has(s.item.pmid)}
                                onToggleSave={toggleSave}
                                onImageError={() => markBroken(s.item.pmid)}
                              />
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </section>
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
      </div>

      <SiteFooter />
    </div>
  );
}
