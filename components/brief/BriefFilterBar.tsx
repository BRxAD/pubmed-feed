"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  BRIEF_WHO_REGION_OPTIONS,
  type BriefWhoRegionFilter,
} from "@/lib/brief/whoRegionFilter";
import {
  ARTICLE_TOPIC_SWATCH,
  type ArticleTopic,
} from "@/lib/classifyTopic";
import { brief } from "@/components/brief/briefTheme";

export default function BriefFilterBar({
  setting,
  topic = "",
  region = "",
  q = "",
}: {
  setting: BriefSettingFilter;
  topic?: BriefTopicFilter;
  region?: BriefWhoRegionFilter;
  q?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<"setting" | "topic" | "region" | null>(null);
  const [searchValue, setSearchValue] = useState(q);

  useEffect(() => {
    setOpen(null);
  }, [setting, topic, region, q]);

  useEffect(() => {
    setSearchValue(q);
  }, [q]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clean = searchValue.trim();
    router.push(
      briefHomeHref({
        setting: setting || undefined,
        topic: topic || undefined,
        region: region || undefined,
        q: clean || undefined,
      })
    );
  }

  function handleClearSearch() {
    setSearchValue("");
    router.push(
      briefHomeHref({
        setting: setting || undefined,
        topic: topic || undefined,
        region: region || undefined,
      })
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-[#D8D4C8] pb-3.5">
      {/* Dropdown Filters */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
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
              region: region || undefined,
              q: q || undefined,
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
              region: region || undefined,
              q: q || undefined,
            }),
            swatch: opt.value
              ? ARTICLE_TOPIC_SWATCH[opt.value as ArticleTopic]
              : undefined,
          }))}
        />

        <BriefSelect
          label="Region"
          value={region}
          open={open === "region"}
          onOpenChange={(next) => setOpen(next ? "region" : null)}
          options={BRIEF_WHO_REGION_OPTIONS.map((opt) => ({
            value: opt.value,
            label: opt.label,
            href: briefHomeHref({
              setting: setting || undefined,
              topic: topic || undefined,
              region: opt.value || undefined,
              q: q || undefined,
            }),
          }))}
        />
      </div>

      {/* Title & Abstract Search Input */}
      <form
        onSubmit={handleSearchSubmit}
        className="flex w-full items-center gap-1.5 sm:w-auto"
        role="search"
      >
        <div className="relative flex-1 sm:w-60 md:w-72">
          <input
            type="search"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Search title & abstract…"
            className="w-full rounded-sm border border-[#D8D4C8] bg-white px-2.5 py-1 text-xs text-[#1C0B19] outline-none transition-colors placeholder:text-[#72705B]/60 focus:border-[#2A79A7] focus:ring-1 focus:ring-[#2A79A7]"
            aria-label="Search articles by title and abstract"
          />
          {searchValue && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#72705B] hover:text-[#1C0B19]"
              aria-label="Clear search query"
            >
              ✕
            </button>
          )}
        </div>
        <button
          type="submit"
          className={`${brief.sans} rounded-sm border border-[#D8D4C8] bg-[#F8F6F0] px-2.5 py-1 text-xs font-medium text-[#1C0B19] transition-colors hover:border-[#2A79A7] hover:text-[#2A79A7]`}
        >
          Search
        </button>
      </form>
    </div>
  );
}
