import type { ReactNode } from "react";
import { brief } from "@/components/brief/briefTheme";

export type SidebarAccent = "steel" | "salmon" | "sky" | "olive";

const ACCENT_TOP: Record<SidebarAccent, string> = {
  steel: "border-t-[#2A79A7]",
  salmon: "border-t-[#FFA69E]",
  sky: "border-t-[#7BC1D4]",
  olive: "border-t-[#72705B]",
};

/**
 * Shared sidebar module shell — cream card, hairline border, accent as a
 * thin top rule (not a full solid fill).
 */
export function SidebarCard({
  accent,
  children,
  className = "",
}: {
  accent: SidebarAccent;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-sm border border-[#D8D4C8] border-t-2 bg-[#F6F4EF] px-4 py-5 ${ACCENT_TOP[accent]} ${className}`}
    >
      {children}
    </div>
  );
}

/** Uppercase accent eyebrow + salmon underline — matches Lead story / Methods. */
export function SidebarHeading({
  id,
  children,
}: {
  id?: string;
  children: ReactNode;
}) {
  return (
    <h2 id={id} className={`${brief.kicker} mb-4`}>
      <span className="inline-block border-b border-[#FFA69E] pb-0.5">
        {children}
      </span>
    </h2>
  );
}
