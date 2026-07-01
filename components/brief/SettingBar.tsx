"use client";

import { brief } from "@/components/brief/briefTheme";
import {
  BRIEF_SETTING_OPTIONS,
  type BriefSettingFilter,
} from "@/lib/brief/settingFilter";

export default function SettingBar({ active }: { active: BriefSettingFilter }) {
  return (
    <nav
      className={`flex flex-wrap gap-x-5 gap-y-2 py-4 border-b ${brief.hairline}`}
      aria-label="Filter by setting"
    >
      {BRIEF_SETTING_OPTIONS.map((opt) => {
        const href =
          opt.value === ""
            ? "/stewardshipbrief"
            : `/stewardshipbrief?setting=${encodeURIComponent(opt.value)}`;
        const isActive = active === opt.value;
        return (
          <a
            key={opt.value || "all"}
            href={href}
            className={`${brief.sans} text-xs uppercase tracking-[0.12em] transition-colors ${
              isActive
                ? `${brief.accent} underline underline-offset-4 decoration-[#b0672e]`
                : `${brief.muted} hover:text-[#1c1a16]`
            }`}
            aria-current={isActive ? "true" : undefined}
          >
            {opt.label}
          </a>
        );
      })}
    </nav>
  );
}
