"use client";

import { brief } from "@/components/brief/briefTheme";
import {
  BRIEF_SETTING_OPTIONS,
  type BriefSettingFilter,
} from "@/lib/brief/settingFilter";

export default function SettingBar({ active }: { active: BriefSettingFilter }) {
  return (
    <nav
      className={`flex flex-wrap gap-x-1 border-b ${brief.hairline}`}
      aria-label="Filter by setting"
    >
      {BRIEF_SETTING_OPTIONS.map((opt) => {
        const href =
          opt.value === ""
            ? "/"
            : `/?setting=${encodeURIComponent(opt.value)}`;
        const isActive = active === opt.value;
        return (
          <a
            key={opt.value || "all"}
            href={href}
            className={`${brief.sans} -mb-px border-b px-2.5 py-2.5 text-[0.6875rem] font-medium tracking-[0.04em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2A79A7] sm:px-3 sm:text-[0.75rem] ${
              isActive
                ? "border-[#1C0B19] text-[#1C0B19]"
                : "border-transparent text-[#72705B] hover:border-[#1C0B19]/35 hover:text-[#1C0B19]"
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
