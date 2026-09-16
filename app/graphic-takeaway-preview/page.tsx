import type { Metadata } from "next";
import GraphicTakeawayVariants from "@/components/brief/GraphicTakeawayVariants";

export const metadata: Metadata = {
  title: "Graphic takeaway options — The Stewardship Brief",
  robots: { index: false, follow: false },
};

export default function GraphicTakeawayPreviewPage() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <GraphicTakeawayVariants />
    </main>
  );
}
