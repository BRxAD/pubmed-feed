import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Second rater — The Stewardship Brief",
  description: "Independent priority ratings.",
  robots: { index: false, follow: false },
};

export default function Feed2Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dark min-h-screen bg-zinc-950 text-zinc-100">{children}</div>
  );
}
