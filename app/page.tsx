import { getCachedHomepageBriefItems } from "@/lib/brief/homepageCache";
import { getTopPriorityYearItems } from "@/lib/brief/topPriority";
import { assignStoryImages } from "@/lib/brief/storyImages";
import {
  matchesBriefSettingFilter,
  parseBriefSetting,
} from "@/lib/brief/settingFilter";
import { applyStickyHomepageLead } from "@/lib/brief/leadStory";
import BriefPage from "@/components/brief/BriefPage";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ setting?: string }>;
}) {
  const { setting: settingRaw } = await searchParams;
  const setting = parseBriefSetting(settingRaw);

  try {
    // Always load the full All pool so sticky lead + story images are assigned
    // once, then filter — same PMID keeps the same photo across setting tabs.
    const [brief, topPriority] = await Promise.all([
      getCachedHomepageBriefItems(""),
      getTopPriorityYearItems(setting),
    ]);
    const allItems = await applyStickyHomepageLead(brief.items, "");
    const images = await assignStoryImages(allItems);
    const items = setting
      ? allItems.filter((item) => matchesBriefSettingFilter(item, setting))
      : allItems;

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
