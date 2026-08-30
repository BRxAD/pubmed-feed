"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { BriefItem } from "@/lib/brief/items";
import { brief } from "@/components/brief/briefTheme";
import {
  copyArticleLinks,
  facebookShareHref,
  linkedinShareHref,
  mailtoShareHref,
  twitterShareHref,
} from "@/lib/brief/shareAttribution";

type Props = {
  item: BriefItem;
  onGraphicTakeaway: () => void;
};

type MenuPos = { top: number; left: number; width: number };

export default function ShareMenu({ item, onGraphicTakeaway }: Props) {
  const [open, setOpen] = useState(false);
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
    const width = Math.min(248, window.innerWidth - 32);
    const estimatedHeight = 268;
    const spaceBelow = window.innerHeight - btn.bottom;
    const openUp = spaceBelow < estimatedHeight && btn.top > spaceBelow;
    const top = openUp
      ? Math.max(16, btn.top - 8 - estimatedHeight)
      : btn.bottom + 8;
    const left = Math.min(
      Math.max(16, btn.right - width),
      window.innerWidth - width - 16
    );
    setPos({ top, left, width });
  }

  useEffect(() => {
    if (!open) return;
    placeMenu();
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
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
  }, [open]);

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

  const mailto = mailtoShareHref({
    headline: item.headline,
    bottomLine: item.bottomLine,
    pubmedUrl: item.pubmedUrl,
  });
  const twitter = twitterShareHref({
    headline: item.headline,
    pubmedUrl: item.pubmedUrl,
  });
  const linkedin = linkedinShareHref(item.pubmedUrl);
  const facebook = facebookShareHref(item.pubmedUrl);

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
            <MenuButton
              onClick={() => {
                setOpen(false);
                onGraphicTakeaway();
              }}
            >
              Share graphic takeaway
            </MenuButton>
            <MenuButton onClick={() => void copyPubmedLink()}>
              {copied ? "Link copied" : "Copy PubMed link"}
            </MenuButton>
            <MenuLink href={mailto}>Email</MenuLink>
            <div className="my-1.5 border-t border-[#D8D4C8]" />
            <MenuLink href={linkedin} external>
              LinkedIn
            </MenuLink>
            <MenuLink href={twitter} external>
              X (Twitter)
            </MenuLink>
            <MenuLink href={facebook} external>
              Facebook
            </MenuLink>
            {error && (
              <p className="px-3 py-2 text-[0.7rem] leading-snug text-[#9B3A3A]">
                {error}
              </p>
            )}
          </div>,
          document.body
        )
      : null;

  return (
    <div className="relative inline-flex" ref={wrapRef}>
      <button
        type="button"
        ref={buttonRef}
        className={`${brief.action} inline-flex items-center gap-1.5`}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          setError(null);
          if (open) {
            setOpen(false);
            return;
          }
          placeMenu();
          setOpen(true);
        }}
      >
        Share
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
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="block w-full px-3 py-2 text-left brief-sans text-[0.8125rem] text-[#1C0B19] hover:bg-[#EFECE4] disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function MenuLink({
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
      {...(external
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
      className="block w-full px-3 py-2 text-left brief-sans text-[0.8125rem] text-[#1C0B19] hover:bg-[#EFECE4]"
    >
      {children}
    </a>
  );
}
