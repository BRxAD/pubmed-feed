"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { BriefItem } from "@/lib/brief/items";
import { isVisualAbstractPaperId } from "@/lib/doi";
import { brief } from "@/components/brief/briefTheme";
import VisualAbstractButton, {
  VISUAL_ABSTRACT_LABEL,
} from "@/components/brief/VisualAbstractButton";
import {
  copyArticleLinks,
  facebookShareHref,
  linkedinShareHref,
  mailtoShareHref,
  twitterShareHref,
} from "@/lib/brief/shareAttribution";

export type TopTenActionItem = {
  pmid: string;
  headline: string;
  title: string;
  pubmedUrl: string;
  citedByCount?: number | null;
};

type SaveFn = (
  pmid: string,
  meta?: { title?: string | null; pubmedUrl?: string | null }
) => void;

/** Enough of a story for share text and the visual-abstract dialog. */
export function topTenAsBrief(item: TopTenActionItem): BriefItem {
  return {
    pmid: item.pmid,
    source: "pubmed",
    headline: item.headline,
    title: item.title,
    journal: null,
    jif: null,
    jifIsHigh: false,
    isQ1: false,
    sjrScimago: null,
    date: null,
    createdAt: "",
    fetchedAt: null,
    isNew: false,
    setting: null,
    settings: [],
    adminSetting: null,
    topics: [],
    autoTopics: null,
    whoRegions: [],
    autoWhoRegions: null,
    studyLabel: null,
    methods: null,
    results: null,
    bottomLine: null,
    relevancePercent: 0,
    predictedPriority: 0,
    adminPriority: null,
    effectivePriority: 0,
    prioritySource: "model",
    pubmedUrl: item.pubmedUrl,
    authors: [],
    keywords: [],
    meshTerms: [],
    abstractSnippet: null,
    citedByCount: item.citedByCount ?? null,
  };
}

export function TopTenList({
  items,
  saved,
  onToggleSave,
  note,
}: {
  items: TopTenActionItem[];
  saved: Set<string>;
  onToggleSave: SaveFn;
  note?: (item: TopTenActionItem) => string | null;
}) {
  const [vaItem, setVaItem] = useState<TopTenActionItem | null>(null);

  return (
    <>
      <ol className="space-y-3.5">
        {items.map((item, i) => (
          <li key={item.pmid} className={`${brief.sans} flex gap-2.5 text-sm`}>
            <span className={`${brief.muted} w-5 shrink-0 pt-0.5 tabular-nums`}>
              {i + 1}.
            </span>
            <div className="min-w-0">
              <a
                href={item.pubmedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`group block ${brief.ink}`}
              >
                <span
                  className={`${brief.serif} text-[0.9375rem] font-semibold leading-snug transition-colors group-hover:text-[#2A79A7]`}
                >
                  {item.headline}
                </span>
              </a>
              {note?.(item) && (
                <span className={`mt-0.5 block text-[0.75rem] ${brief.muted}`}>
                  {note(item)}
                </span>
              )}
              <TopTenMenu
                item={item}
                saved={saved.has(item.pmid)}
                onToggleSave={onToggleSave}
                onVisualAbstract={() => setVaItem(item)}
              />
            </div>
          </li>
        ))}
      </ol>
      {vaItem && (
        <VisualAbstractButton
          item={topTenAsBrief(vaItem)}
          showButton={false}
          open
          onOpenChange={(open) => {
            if (!open) setVaItem(null);
          }}
        />
      )}
    </>
  );
}

type MenuPos = { top: number; left: number; width: number };

function TopTenMenu({
  item,
  saved,
  onToggleSave,
  onVisualAbstract,
}: {
  item: TopTenActionItem;
  saved: boolean;
  onToggleSave: SaveFn;
  onVisualAbstract: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"main" | "share">("main");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  function placeMenu() {
    const btn = buttonRef.current?.getBoundingClientRect();
    if (!btn) return;
    const width = Math.min(232, window.innerWidth - 32);
    const estimatedHeight = view === "share" ? 248 : 196;
    const spaceBelow = window.innerHeight - btn.bottom;
    const openUp = spaceBelow < estimatedHeight && btn.top > spaceBelow;
    const top = openUp
      ? Math.max(16, btn.top - 8 - estimatedHeight)
      : btn.bottom + 8;
    const left = Math.min(
      Math.max(16, btn.left),
      window.innerWidth - width - 16
    );
    setPos({ top, left, width });
  }

  function close() {
    setOpen(false);
    setView("main");
    setError(null);
  }

  useEffect(() => {
    if (!open) return;
    placeMenu();
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onReposition = () => placeMenu();
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, view]);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(t);
  }, [copied]);

  async function copyPubmedLink() {
    setError(null);
    try {
      await copyArticleLinks(item.pubmedUrl);
      setCopied(true);
    } catch {
      setError("Could not copy link");
    }
  }

  const share = {
    headline: item.headline,
    bottomLine: null,
    pubmedUrl: item.pubmedUrl,
  };
  const visualLabel = isVisualAbstractPaperId(item.pmid)
    ? VISUAL_ABSTRACT_LABEL
    : "Graphic takeaway";

  const menu =
    open && mounted && pos
      ? createPortal(
          <div
            id={menuId}
            role="menu"
            ref={menuRef}
            style={{ top: pos.top, left: pos.left, width: pos.width }}
            className="fixed z-[220] rounded-sm border border-[#D8D4C8] bg-[#F6F4EF] py-1.5 shadow-[0_8px_24px_rgba(28,11,25,0.12)]"
          >
            {view === "main" ? (
              <>
                <MenuButton
                  onClick={() =>
                    onToggleSave(item.pmid, {
                      title: item.headline || item.title,
                      pubmedUrl: item.pubmedUrl,
                    })
                  }
                >
                  {saved ? "Saved ✓" : "Save"}
                </MenuButton>
                <MenuButton
                  onClick={() => {
                    setError(null);
                    setView("share");
                  }}
                >
                  Share
                </MenuButton>
                <MenuButton
                  onClick={() => {
                    close();
                    onVisualAbstract();
                  }}
                >
                  {visualLabel}
                </MenuButton>
                <MenuLink href={`/article/${encodeURIComponent(item.pmid)}`}>
                  Read on brief
                </MenuLink>
              </>
            ) : (
              <>
                <MenuButton onClick={() => setView("main")}>Back</MenuButton>
                <div className="my-1.5 border-t border-[#D8D4C8]" />
                <MenuButton onClick={() => void copyPubmedLink()}>
                  {copied ? "Link copied" : "Copy PubMed link"}
                </MenuButton>
                <MenuAnchor href={mailtoShareHref(share)}>Email</MenuAnchor>
                <MenuAnchor href={linkedinShareHref(item.pubmedUrl)} external>
                  LinkedIn
                </MenuAnchor>
                <MenuAnchor href={twitterShareHref(share)} external>
                  X (Twitter)
                </MenuAnchor>
                <MenuAnchor href={facebookShareHref(item.pubmedUrl)} external>
                  Facebook
                </MenuAnchor>
                {error && (
                  <p className="px-3 py-2 text-[0.7rem] leading-snug text-[#9B3A3A]">
                    {error}
                  </p>
                )}
              </>
            )}
          </div>,
          document.body
        )
      : null;

  return (
    <div className="relative mt-1 inline-flex" ref={wrapRef}>
      <button
        type="button"
        ref={buttonRef}
        className={`${brief.sans} inline-flex items-center gap-1 text-[0.7rem] font-medium tracking-wide text-[#72705B] transition-colors hover:text-[#2A79A7]`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        aria-label={`Actions for ${item.headline}`}
        onClick={() => {
          if (open) {
            close();
            return;
          }
          setView("main");
          setError(null);
          setOpen(true);
        }}
      >
        More
        <span
          className={`inline-block text-[0.65rem] transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          ▾
        </span>
      </button>
      {menu}
    </div>
  );
}

function MenuButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="brief-sans block w-full px-3 py-2 text-left text-[0.8125rem] text-[#1C0B19] hover:bg-[#EFECE4]"
    >
      {children}
    </button>
  );
}

function MenuLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      role="menuitem"
      href={href}
      className="brief-sans block w-full px-3 py-2 text-left text-[0.8125rem] text-[#1C0B19] hover:bg-[#EFECE4]"
    >
      {children}
    </Link>
  );
}

function MenuAnchor({
  href,
  children,
  external,
}: {
  href: string;
  children: ReactNode;
  external?: boolean;
}) {
  return (
    <a
      role="menuitem"
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="brief-sans block w-full px-3 py-2 text-left text-[0.8125rem] text-[#1C0B19] hover:bg-[#EFECE4]"
    >
      {children}
    </a>
  );
}
