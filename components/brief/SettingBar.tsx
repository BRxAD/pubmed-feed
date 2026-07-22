"use client";

import { brief } from "@/components/brief/briefTheme";
import {
  BRIEF_SETTING_OPTIONS,
  type BriefSettingFilter,
} from "@/lib/brief/settingFilter";

export default function SettingBar({ active }: { active: BriefSettingFilter }) {
  return (
    <nav className="flex flex-wrap gap-2 py-5" aria-label="Filter by setting">
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
            className={`${brief.sans} rounded-full px-3.5 py-1.5 text-xs font-medium uppercase tracking-[0.08em] transition-colors ${
              isActive
                ? "bg-[#1C0B19] text-[#F6F4EF]"
                : "bg-[#EFECE4] text-[#72705B] hover:bg-[#7BC1D4]/35 hover:text-[#1C0B19]"
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
