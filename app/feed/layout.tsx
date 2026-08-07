import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Feed — The Stewardship Brief",
  description: "Antimicrobial stewardship research feed.",
};

export default function FeedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
