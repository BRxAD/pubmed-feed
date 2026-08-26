"use client";

import { useEffect, useState } from "react";
import BriefSelect from "@/components/brief/BriefSelect";
import {
  BRIEF_SETTING_OPTIONS,
  type BriefSettingFilter,
} from "@/lib/brief/settingFilter";
import {
  BRIEF_TOPIC_OPTIONS,
  briefHomeHref,
  type BriefTopicFilter,
} from "@/lib/brief/topicFilter";
import {
  ARTICLE_TOPIC_SWATCH,
  type ArticleTopic,
} from "@/lib/classifyTopic";

export default function BriefFilterBar({
  setting,
  topic = "",
}: {
  setting: BriefSettingFilter;
  topic?: BriefTopicFilter;
}) {
  const [open, setOpen] = useState<"setting" | "topic" | null>(null);

  useEffect(() => {
    setOpen(null);
  }, [setting, topic]);

  return (
    <div className="flex flex-wrap items-end gap-x-5 gap-y-3 border-b border-[#D8D4C8] pb-4">
      <BriefSelect
        label="Setting"
        value={setting}
        open={open === "setting"}
        onOpenChange={(next) => setOpen(next ? "setting" : null)}
        options={BRIEF_SETTING_OPTIONS.map((opt) => ({
          value: opt.value,
          label: opt.label,
          href: briefHomeHref({
            setting: opt.value || undefined,
            topic: topic || undefined,
          }),
        }))}
      />
      <BriefSelect
        label="Topic"
        value={topic}
        open={open === "topic"}
        onOpenChange={(next) => setOpen(next ? "topic" : null)}
        options={BRIEF_TOPIC_OPTIONS.map((opt) => ({
          value: opt.value,
          label: opt.label,
          href: briefHomeHref({
            setting: setting || undefined,
            topic: opt.value || undefined,
          }),
          swatch: opt.value
            ? ARTICLE_TOPIC_SWATCH[opt.value as ArticleTopic]
            : undefined,
        }))}
      />
    </div>
  );
}
