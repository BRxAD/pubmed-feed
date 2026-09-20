import { Suspense } from "react";
import type { Metadata } from "next";
import AuthorOutreachOptOutClient from "./AuthorOutreachOptOutClient";

export const metadata: Metadata = {
  title: "Opt out of author notices — The Stewardship Brief",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function AuthorOutreachOptOutPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#F6F4EF] text-[#1C0B19] px-5 py-16">
          <p className="text-sm text-[#72705B]">Loading…</p>
        </main>
      }
    >
      <AuthorOutreachOptOutClient />
    </Suspense>
  );
}
