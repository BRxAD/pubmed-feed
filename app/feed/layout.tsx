import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Feed — The Stewardship Brief",
  description: "Antimicrobial stewardship research feed.",
  robots: { index: false, follow: false },
};

export default function FeedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
