import { getBriefItems } from "@/lib/brief/items";
import BriefArticleList from "@/components/brief/BriefArticleList";

export const metadata = {
  title: "The Stewardship Brief",
  description:
    "Daily briefing of high-priority antimicrobial stewardship research from PubMed.",
};

export default async function StewardshipBriefPage() {
  const brief = await getBriefItems();

  return (
    <BriefArticleList
      items={brief.items}
      newSinceYesterday={brief.newSinceYesterday}
      daysBack={brief.daysBack}
    />
  );
}
