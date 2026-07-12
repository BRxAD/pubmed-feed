import { getBriefItems } from "@/lib/brief/items";
import { getTopPriorityYearItems } from "@/lib/brief/topPriority";
import { parseBriefSetting } from "@/lib/brief/settingFilter";
import BriefPage from "@/components/brief/BriefPage";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "The Stewardship Brief",
  description:
    "Daily briefing of high-priority antimicrobial stewardship research.",
};

export default async function StewardshipBriefPage({
  searchParams,
}: {
  searchParams: Promise<{ setting?: string }>;
}) {
  const { setting: settingRaw } = await searchParams;
  const setting = parseBriefSetting(settingRaw);

  try {
    const [brief, topPriority] = await Promise.all([
      getBriefItems({ setting }),
      getTopPriorityYearItems(),
    ]);

    return (
      <BriefPage
        items={brief.items}
        topPriority={topPriority}
        setting={setting}
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
