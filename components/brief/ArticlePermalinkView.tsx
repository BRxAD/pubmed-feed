"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { BriefItem } from "@/lib/brief/items";
import type { StoryImageMatch } from "@/lib/brief/storyImageTypes";
import { brief } from "@/components/brief/briefTheme";
import { briefSettingLabel } from "@/lib/brief/settingFilter";
import { briefTopicLabel } from "@/lib/brief/topicFilter";
import { whoRegionLabel } from "@/lib/brief/whoRegionFilter";
import {
  ARTICLE_TOPIC_CHIP_CLASSES,
  type ArticleTopic,
} from "@/lib/classifyTopic";
import { useBriefSaved } from "@/components/brief/SaveStreak";
import ShareMenu from "@/components/brief/ShareMenu";
import GraphicTakeawayButton from "@/components/brief/GraphicTakeawayButton";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.includes("T") ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function ArticlePermalinkView({
  item,
  image,
  autoSaved = false,
}: {
  item: BriefItem;
  image?: StoryImageMatch | null;
  autoSaved?: boolean;
}) {
  const { saved, toggleSave, signedIn } = useBriefSaved();
  const [takeawayOpen, setTakeawayOpen] = useState(false);
  const [imageBroken, setImageBroken] = useState(false);
  const [showSavedBanner, setShowSavedBanner] = useState(autoSaved);

  const isSaved = saved.has(item.pmid) || autoSaved;

  useEffect(() => {
    if (autoSaved) {
      setShowSavedBanner(true);
    }
  }, [autoSaved]);

  const settings =
    item.settings && item.settings.length > 0
      ? item.settings
      : item.setting
        ? [item.setting]
        : [];
  const settingLabels = settings
    .map((s) => briefSettingLabel(s))
    .filter((s): s is string => Boolean(s));
  const primarySetting = settingLabels[0] ?? null;

  const topics = (item.topics ?? []).slice(0, 4);

  const whoLabels = (item.whoRegions ?? [])
    .map((r) => whoRegionLabel(r))
    .filter((s): s is string => Boolean(s));

  const authorsText =
    item.authors && item.authors.length > 0
      ? item.authors.length > 4
        ? `${item.authors.slice(0, 3).join(", ")}, et al.`
        : item.authors.join(", ")
      : null;

  return (
    <article className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      {/* Top Breadcrumb Navigation */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link
          href="/"
          className={`inline-flex items-center gap-1.5 ${brief.action} text-xs font-medium uppercase tracking-[0.08em]`}
        >
          ← Back to today&apos;s brief
        </Link>
        <Link
          href="/settings?tab=saved"
          className={`${brief.action} text-xs ${brief.muted} hover:text-[#1C0B19]`}
        >
          View saved reading list →
        </Link>
      </div>

      {/* Auto-save confirmation notification */}
      {showSavedBanner && (
        <div
          role="status"
          className="mb-8 flex items-center justify-between gap-3 rounded-sm border border-[#2A79A7]/40 bg-[#2A79A7]/10 px-4 py-3 text-sm text-[#1C0B19]"
        >
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#2A79A7]">✓</span>
            <span>
              Article saved to your reading list on{" "}
              <strong>The Stewardship Brief</strong>.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowSavedBanner(false)}
            className="text-xs uppercase tracking-wider text-[#72705B] hover:text-[#1C0B19]"
            aria-label="Dismiss message"
          >
            ✕
          </button>
        </div>
      )}

      {/* Meta Pills (Setting, Topics, Date, Regions) */}
      <div className="mb-4 space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {primarySetting && (
            <span className="font-bold uppercase tracking-[0.12em] text-[#2A79A7]">
              {primarySetting}
            </span>
          )}
          {item.date && (
            <span className={brief.muted}>
              {primarySetting ? " · " : ""}
              {formatDate(item.date)}
            </span>
          )}
          {item.journal && (
            <span className={brief.muted}>
              {" · "}
              {item.journal}
              {item.jif != null && ` (JIF ${item.jif.toFixed(1)}${item.jifIsHigh ? " ★" : ""})`}
            </span>
          )}
        </div>

        {(topics.length > 0 || whoLabels.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {topics.map((t) => (
              <span
                key={t}
                className={`rounded-sm px-2 py-0.5 text-[0.6875rem] font-medium tracking-[0.02em] ${ARTICLE_TOPIC_CHIP_CLASSES[t as ArticleTopic].idle}`}
              >
                {briefTopicLabel(t)}
              </span>
            ))}
            {whoLabels.map((reg) => (
              <span
                key={reg}
                className="rounded-sm border border-[#D8D4C8] bg-white px-2 py-0.5 text-[0.6875rem] font-medium tracking-[0.02em] text-[#72705B]"
              >
                {reg}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Main Editorial Headline */}
      <h1
        className={`mb-6 ${brief.serif} text-2xl font-bold leading-[1.25] text-[#1C0B19] sm:text-3xl md:text-4xl`}
      >
        {item.headline || item.title}
      </h1>

      {/* Lead/Story Image */}
      {image && !imageBroken && (
        <div className="mb-8 overflow-hidden rounded-sm border border-[#E8E4D9] bg-[#EFECE4]">
          <div className="relative aspect-[16/9] w-full">
            <Image
              src={image.url}
              alt={image.label || item.headline || "Article image"}
              fill
              priority
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-cover object-center"
              onError={() => setImageBroken(true)}
            />
          </div>
          {image.label && (
            <p className="px-3 py-1.5 text-right font-sans text-[0.6875rem] text-[#72705B]">
              {image.label}
            </p>
          )}
        </div>
      )}

      {/* Core Summary / Bottom Line */}
      {item.bottomLine && (
        <div className="mb-8 border-l-2 border-[#2A79A7] pl-4 sm:pl-5">
          <p
            className={`${brief.sans} text-base sm:text-lg font-medium leading-relaxed text-[#1C0B19]`}
          >
            {item.bottomLine}
          </p>
        </div>
      )}

      {/* Action Buttons Toolbar */}
      <div className="mb-10 flex flex-wrap items-center gap-3 border-y border-[#D8D4C8] py-3.5">
        <button
          type="button"
          onClick={() =>
            toggleSave(item.pmid, {
              title: item.headline || item.title,
              pubmedUrl: item.pubmedUrl,
            })
          }
          className={`inline-flex items-center gap-1.5 rounded-sm px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
            isSaved
              ? "bg-[#2A79A7] text-white hover:bg-[#236389]"
              : "border border-[#2A79A7] text-[#2A79A7] hover:bg-[#2A79A7]/10"
          }`}
        >
          {isSaved ? "✓ Saved" : "Save article"}
        </button>

        <a
          href={item.pubmedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-sm border border-[#D8D4C8] bg-white px-3 py-1.5 text-xs font-medium text-[#1C0B19] transition-colors hover:border-[#72705B]"
        >
          Read on PubMed ↗
        </a>

        <ShareMenu
          item={item}
          onGraphicTakeaway={() => setTakeawayOpen(true)}
        />

        <GraphicTakeawayButton
          item={item}
          image={image}
          open={takeawayOpen}
          onOpenChange={setTakeawayOpen}
        />
      </div>

      {/* Detail Panel: Methods, Results, Original Research */}
      <div className={`space-y-6 rounded-sm p-5 sm:p-7 ${brief.detailPanel}`}>
        <h2 className={`${brief.kicker} text-xs`}>Study Deep Dive</h2>

        {item.methods && (
          <div>
            <p className={brief.meta}>Methods</p>
            <p className="mt-1.5 font-sans text-sm leading-relaxed text-[#1C0B19]">
              {item.methods}
            </p>
          </div>
        )}

        {item.results && (
          <div>
            <p className={brief.meta}>Results</p>
            <p className="mt-1.5 font-sans text-sm leading-relaxed text-[#1C0B19]">
              {item.results}
            </p>
          </div>
        )}

        {whoLabels.length > 0 && (
          <div className="border-t border-[#D8D4C8]/60 pt-4">
            <p className={brief.meta}>WHO Global Region</p>
            <p className="mt-1 font-sans text-sm text-[#1C0B19]">
              {whoLabels.join(" · ")}
            </p>
          </div>
        )}

        <div className="border-t border-[#D8D4C8]/60 pt-4">
          <p className={brief.meta}>Original Publication</p>
          <p className="mt-1 font-sans text-sm font-medium leading-snug text-[#1C0B19]">
            {item.title}
          </p>

          <p className="mt-2 text-xs leading-relaxed text-[#72705B]">
            {item.journal && <span className="font-medium">{item.journal}</span>}
            {item.jif != null && (
              <span>
                {item.journal ? " · " : ""}
                2024 JIF {item.jif.toFixed(1)}
                {item.jifIsHigh ? " ★ High Impact" : ""}
              </span>
            )}
            {item.date && (
              <span>
                {" · "}
                Published {formatDate(item.date)}
              </span>
            )}
          </p>

          {authorsText && (
            <p className="mt-1.5 text-xs text-[#72705B]/80">
              Authors: {authorsText}
            </p>
          )}

          <p className="mt-3">
            <a
              href={item.pubmedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${brief.action} text-xs`}
            >
              View record on PubMed (PMID {item.pmid}) ↗
            </a>
          </p>
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-[#D8D4C8] pt-6 text-sm">
        <Link href="/" className={`${brief.action} font-medium`}>
          ← Back to today&apos;s brief
        </Link>
        <Link href="/settings" className={`${brief.muted} hover:text-[#1C0B19]`}>
          {signedIn ? "Account & Email Settings" : "Sign in to sync saved articles"}
        </Link>
      </div>
    </article>
  );
}
