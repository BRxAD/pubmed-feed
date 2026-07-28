import { Suspense } from "react";
import UnsubscribeClient from "./UnsubscribeClient";

export const dynamic = "force-dynamic";

export default function UnsubscribePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#F6F4EF] text-[#1C0B19] px-5 py-16">
          <p className="text-sm text-[#72705B]">Loading…</p>
        </main>
      }
    >
      <UnsubscribeClient />
    </Suspense>
  );
}
