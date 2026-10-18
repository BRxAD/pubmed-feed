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
const WASH: Record<"cited" | "relevance", string> = {
  cited: "bg-[#FFF1EC]",
  relevance: "bg-[#F0F6F9]",
};

export function SidebarCard({
  accent,
  children,
  className = "",
  compact = false,
  wash,
}: {
  accent: SidebarAccent;
  children: ReactNode;
  className?: string;
  compact?: boolean;
  /** Soft tint so the two Top 10 lists read as different kinds of ranking. */
  wash?: "cited" | "relevance";
}) {
  return (
    <div
      className={`rounded-sm border border-[#D8D4C8] border-t-2 ${wash ? WASH[wash] : "bg-[#F6F4EF]"} ${
        compact ? "px-3 py-3" : "px-4 py-5"
      } ${ACCENT_TOP[accent]} ${className}`}
    >
      {children}
    </div>
  );
}

/** Uppercase accent eyebrow + salmon underline — matches Lead story / Methods. */
export function SidebarHeading({
  id,
  children,
  className = "mb-4",
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2 id={id} className={`${brief.kicker} ${className}`}>
      <span className="inline-block border-b border-[#FFA69E] pb-0.5">
        {children}
      </span>
    </h2>
  );
}
