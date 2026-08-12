import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard — The Stewardship Brief",
  description: "Retired — see the feed for rating totals.",
  robots: { index: false, follow: false },
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
