import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Feed — The Stewardship Brief",
  description: "Antimicrobial stewardship research feed.",
  robots: { index: false, follow: false },
};

/** Admin feed is always dark zinc — independent of the cream Brief theme. */
export default function FeedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dark min-h-screen bg-zinc-950 text-zinc-100">
      {children}
    </div>
  );
}
