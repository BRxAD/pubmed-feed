import { getBriefItems } from "@/lib/brief/items";
import BriefArticleList from "@/components/brief/BriefArticleList";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "The Stewardship Brief · PubMed",
  description:
    "Daily PubMed briefing of high-priority antimicrobial stewardship research.",
};

export default async function StewardshipBriefPage() {
  try {
    const brief = await getBriefItems();

    return (
      <BriefArticleList
        items={brief.items}
        newSinceYesterday={brief.newSinceYesterday}
        daysBack={brief.daysBack}
        priorityModelSamples={brief.priorityModelSamples}
      />
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-zinc-800">
        <h1 className="text-2xl font-bold">The Stewardship Brief</h1>
        <p className="mt-4 text-red-700">Could not load the brief: {message}</p>
        <p className="mt-4 text-sm text-zinc-600">
          If you recently deployed, ensure Supabase env vars are set on Vercel and
          the database is reachable. Optional ML column: run{" "}
          <code className="text-xs">scripts/add_priority_model.sql</code> in Supabase.
        </p>
        <a href="/feed?source=pubmed" className="mt-6 inline-block text-amber-800 underline">
          Open PubMed feed →
        </a>
      </div>
    );
  }
}
