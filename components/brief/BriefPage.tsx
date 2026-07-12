"use client";

import type { BriefItem } from "@/lib/brief/items";
import type { TopPriorityItem } from "@/lib/brief/topPriority";
import type { BriefSettingFilter } from "@/lib/brief/settingFilter";
import {
  matchStoryImage,
  type StoryImageMatch,
} from "@/lib/brief/storyImages";
import Masthead from "@/components/brief/Masthead";
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

/**
 * Assign unique images with >50% confidence; weak matches stay text-only.
 * Pack as: one featured (with image) + up to two compact (no image) per row.
 * Image-less leftovers fill compact columns; remaining image stories get solo featured rows.
 */
function buildLayoutRows(items: BriefItem[]): {
  lead: RankedStory | null;
  rows: Array<{ featured: RankedStory | null; compacts: RankedStory[] }>;
} {
  const usedIds = new Set<string>();
  const ranked: RankedStory[] = items.map((item) => {
    const image = matchStoryImage(item, usedIds);
    if (image) usedIds.add(image.id);
    return { item, image };
  });

  const [lead, ...rest] = ranked;
  const withImage = rest.filter((s) => s.image);
  const withoutImage = rest.filter((s) => !s.image);

  const rows: Array<{ featured: RankedStory | null; compacts: RankedStory[] }> =
    [];
  let iFeat = 0;
  let iComp = 0;

  while (iFeat < withImage.length || iComp < withoutImage.length) {
    const featured = withImage[iFeat] ?? null;
    if (featured) iFeat += 1;

    const compacts: RankedStory[] = [];
    while (compacts.length < 2 && iComp < withoutImage.length) {
      compacts.push(withoutImage[iComp]!);
      iComp += 1;
    }

    // If no featured left but compact remain, dump remaining as compact-only rows
    if (!featured && compacts.length === 0) break;

    rows.push({ featured, compacts });

    // Flush leftover compact-only if we ran out of featured mid-batch
    if (!featured && iComp < withoutImage.length) {
      while (iComp < withoutImage.length) {
        const batch: RankedStory[] = [];
        while (batch.length < 3 && iComp < withoutImage.length) {
          batch.push(withoutImage[iComp]!);
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
}: {
  items: BriefItem[];
  topPriority: TopPriorityItem[];
  setting: BriefSettingFilter;
}) {
  const { saved, toggleSave } = useBriefSaved();
  const { lead, rows } = buildLayoutRows(items);

  return (
    <div className={`min-h-screen ${brief.bg} ${brief.ink}`}>
      <Masthead dateLabel={formatToday()} />

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-[1fr_280px] lg:gap-12">
          <main>
            <SettingBar active={setting} />

            {items.length === 0 ? (
              <p
                className={`mt-8 ${brief.sans} text-base leading-[1.55] ${brief.muted}`}
              >
                No studies matched this filter in the last week. Try another
                setting or check the{" "}
                <a
                  href="/feed?source=pubmed"
                  className={`${brief.accent} underline`}
                >
                  PubMed feed
                </a>
                .
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
                            className="grid gap-0 lg:grid-cols-[1.35fr_1fr] lg:gap-8 border-b border-[#D8D4C8]"
                          >
                            <FeaturedStory
                              item={row.featured.item}
                              image={row.featured.image}
                              bare
                              saved={saved.has(row.featured.item.pmid)}
                              onToggleSave={toggleSave}
                            />
                            <div className="lg:border-l lg:border-[#D8D4C8] lg:pl-8 divide-y divide-[#D8D4C8]">
                              {row.compacts.map((s) => (
                                <CompactStory
                                  key={s.item.pmid}
                                  item={s.item}
                                  bare
                                  saved={saved.has(s.item.pmid)}
                                  onToggleSave={toggleSave}
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
                          />
                        );
                      }

                      return (
                        <div
                          key={key}
                          className="grid gap-0 sm:grid-cols-2 lg:grid-cols-3 border-b border-[#D8D4C8] divide-y sm:divide-y-0 sm:divide-x divide-[#D8D4C8]"
                        >
                          {row.compacts.map((s) => (
                            <div key={s.item.pmid} className="sm:px-4 first:sm:pl-0 last:sm:pr-0">
                              <CompactStory
                                item={s.item}
                                bare
                                saved={saved.has(s.item.pmid)}
                                onToggleSave={toggleSave}
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
            <TopPriorityPanel items={topPriority} />
            <SaveStreak savedCount={saved.size} />
            <DigestSignup />
          </aside>
        </div>
      </div>
    </div>
  );
}
