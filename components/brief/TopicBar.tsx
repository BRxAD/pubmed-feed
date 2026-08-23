"use client";

import { brief } from "@/components/brief/briefTheme";
import {
  ARTICLE_TOPIC_CHIP_CLASSES,
  type ArticleTopic,
} from "@/lib/classifyTopic";
import {
  BRIEF_TOPIC_OPTIONS,
  briefHomeHref,
  type BriefTopicFilter,
} from "@/lib/brief/topicFilter";
import type { BriefSettingFilter } from "@/lib/brief/settingFilter";

export default function TopicBar({
  active,
  setting,
}: {
  active: BriefTopicFilter;
  setting: BriefSettingFilter;
}) {
  return (
    <nav
      className="mt-3 flex flex-wrap items-center gap-2"
      aria-label="Filter by topic"
    >
      <span
        className={`${brief.sans} mr-1 text-[0.625rem] font-medium uppercase tracking-[0.12em] text-[#72705B]`}
      >
        Topics
      </span>
      {BRIEF_TOPIC_OPTIONS.map((opt) => {
        const href = briefHomeHref({
          setting: setting || undefined,
          topic: opt.value || undefined,
        });
        const isActive = active === opt.value;
        const chip =
          opt.value === ""
            ? isActive
              ? "bg-[#1C0B19] text-[#F6F4EF] ring-1 ring-[#1C0B19]"
              : "bg-transparent text-[#72705B] ring-1 ring-[#D8D4C8] hover:text-[#1C0B19] hover:ring-[#1C0B19]/40"
            : isActive
              ? ARTICLE_TOPIC_CHIP_CLASSES[opt.value as ArticleTopic].active
              : ARTICLE_TOPIC_CHIP_CLASSES[opt.value as ArticleTopic].idle;

        return (
          <a
            key={opt.value || "all-topics"}
            href={href}
            className={`${brief.sans} rounded-sm px-2.5 py-1 text-[0.6875rem] font-medium tracking-[0.02em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2A79A7] ${chip}`}
            aria-current={isActive ? "true" : undefined}
          >
            {opt.label}
          </a>
        );
      })}
    </nav>
  );
}
