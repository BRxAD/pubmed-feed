"use client";

import { SessionProvider } from "next-auth/react";
import { BriefSavedProvider } from "@/components/brief/SaveStreak";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <BriefSavedProvider>{children}</BriefSavedProvider>
    </SessionProvider>
  );
}
