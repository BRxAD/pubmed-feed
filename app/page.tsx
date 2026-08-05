import { getBriefItems } from "@/lib/brief/items";
import { getTopPriorityYearItems } from "@/lib/brief/topPriority";
import { assignStoryImages } from "@/lib/brief/storyImages";
import { parseBriefSetting } from "@/lib/brief/settingFilter";
import { BRIEF_ARTICLE_WINDOW_DAYS } from "@/lib/brief/priority";
import { applyStickyHomepageLead } from "@/lib/brief/leadStory";
import BriefPage from "@/components/brief/BriefPage";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ setting?: string }>;
}) {
  const { setting: settingRaw } = await searchParams;
  const setting = parseBriefSetting(settingRaw);

  try {
    const [brief, topPriority] = await Promise.all([
      getBriefItems({
        setting,
        // Article-date window is authoritative; created_at is not used as a
        // gate here (backfill would crowd out recent pubs).
        daysBack: 90,
        maxLookbackDays: 90,
        maxItems: 50,
        articleDateWithinDays: BRIEF_ARTICLE_WINDOW_DAYS,
        // Recent window only; daily intake is typically well under 100.
        embedMaxFresh: 100,
      }),
      getTopPriorityYearItems(setting),
    ]);
    const items = await applyStickyHomepageLead(brief.items, setting);
    const images = await assignStoryImages(items);

    return (
      <BriefPage
        items={items}
        topPriority={topPriority}
        setting={setting}
        images={images}
      />
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 font-sans text-[#1C0B19]">
        <h1 className="font-serif text-2xl font-bold">The Stewardship Brief</h1>
        <p className="mt-4 text-red-800">Could not load the brief: {message}</p>
        <a
          href="/feed?source=pubmed"
          className="mt-6 inline-block text-[#2A79A7] underline"
        >
          Open PubMed feed →
        </a>
      </div>
    );
  }
}
