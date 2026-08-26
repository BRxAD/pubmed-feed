"use client";

import { useMemo, useState } from "react";
import type { BriefItem } from "@/lib/brief/items";
import type { TopPriorityItem } from "@/lib/brief/topPriority";
import type { BriefSettingFilter } from "@/lib/brief/settingFilter";
import type { StoryImageMatch } from "@/lib/brief/storyImageTypes";
import Masthead from "@/components/brief/Masthead";
import SiteNav from "@/components/brief/SiteNav";
import SiteFooter from "@/components/brief/SiteFooter";
import BriefFilterBar from "@/components/brief/BriefFilterBar";
import TopPriorityPanel from "@/components/brief/TopPriorityPanel";
import InTheNewsPanel from "@/components/brief/InTheNewsPanel";
import SaveStreak, { useBriefSaved } from "@/components/brief/SaveStreak";
import DigestSignup from "@/components/brief/DigestSignup";
import BriefStoryLayout from "@/components/brief/BriefStoryLayout";
import { SidebarCard } from "@/components/brief/SidebarCard";
import FeedbackSurvey from "@/components/brief/FeedbackSurvey";
import { brief } from "@/components/brief/briefTheme";
import type { NewsItem } from "@/lib/news/types";
import type { BriefTopicFilter } from "@/lib/brief/topicFilter";

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
  topic = "",
  images,
  newsItems = [],
}: {
  items: BriefItem[];
  topPriority: TopPriorityItem[];
  setting: BriefSettingFilter;
  topic?: BriefTopicFilter;
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

      <div className={`${brief.shell} py-4 sm:py-5`}>
        <BriefFilterBar setting={setting} topic={topic} />

        {items.length === 0 ? (
          <p
            className={`mt-8 ${brief.sans} text-base leading-[1.55] ${brief.muted}`}
          >
            No studies matched this filter yet. Try another setting or topic, or
            check back after the next ingest.
          </p>
        ) : (
          <BriefStoryLayout
            lead={lead}
            rest={rest}
            saved={saved}
            onToggleSave={toggleSave}
            onImageError={markBroken}
            left={
              <SidebarCard accent="steel">
                <InTheNewsPanel items={newsItems} />
              </SidebarCard>
            }
            right={
              <>
                <SidebarCard accent="salmon">
                  <SaveStreak
                    savedCount={saved.size}
                    savedItems={savedItems}
                    onRemove={(pmid) => toggleSave(pmid)}
                  />
                </SidebarCard>
                <SidebarCard accent="sky">
                  <TopPriorityPanel items={topPriority} />
                </SidebarCard>
                <SidebarCard accent="olive">
                  <DigestSignup />
                </SidebarCard>
              </>
            }
          />
        )}
      </div>

      <SiteFooter />
      <FeedbackSurvey />
    </div>
  );
}
