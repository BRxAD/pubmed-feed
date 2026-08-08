import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard — The Stewardship Brief",
  description: "Corpus stats and ingest status for the stewardship feed.",
  robots: { index: false, follow: false },
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
