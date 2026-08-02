"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { BriefItem } from "@/lib/brief/items";
import type { StoryImageMatch } from "@/lib/brief/storyImageTypes";
import { brief } from "@/components/brief/briefTheme";
import {
  composeVisualSummary,
  downloadBlob,
} from "@/components/brief/composeVisualSummary";

type Props = {
  item: BriefItem;
  image?: StoryImageMatch | null;
};

export default function ShareMenu({ item, image }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
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
      await navigator.clipboard.writeText(item.pubmedUrl);
      setCopied(true);
    } catch {
      setError("Could not copy link");
    }
  }

  async function shareVisualSummary() {
    setBusy(true);
    setError(null);
    try {
      const blob = await composeVisualSummary({ item, image });
      const filename = `stewardship-brief-${item.pmid}.png`;
      const file = new File([blob], filename, { type: "image/png" });

      if (
        typeof navigator !== "undefined" &&
        navigator.canShare?.({ files: [file] })
      ) {
        await navigator.share({
          files: [file],
          title: item.headline,
          text: item.bottomLine ?? item.headline,
          url: item.pubmedUrl,
        });
      } else {
        downloadBlob(blob, filename);
      }
      setOpen(false);
    } catch (e) {
      console.error(e);
      setError(
        e instanceof Error ? e.message : "Could not create visual summary"
      );
    } finally {
      setBusy(false);
    }
  }

  const shareText = [item.headline, item.bottomLine, item.pubmedUrl]
    .filter(Boolean)
    .join("\n\n");

  const mailto = `mailto:?subject=${encodeURIComponent(item.headline)}&body=${encodeURIComponent(shareText)}`;
  const twitter = `https://twitter.com/intent/tweet?text=${encodeURIComponent(item.headline)}&url=${encodeURIComponent(item.pubmedUrl)}`;
  const linkedin = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(item.pubmedUrl)}`;
  const facebook = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(item.pubmedUrl)}`;

  return (
    <div className="relative inline-flex" ref={rootRef}>
      <button
        type="button"
        className={`${brief.action} inline-flex items-center gap-1.5`}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          setError(null);
          setOpen((v) => !v);
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

      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute left-0 top-full z-40 mt-2 w-[15.5rem] rounded-sm border border-[#D8D4C8] bg-[#F6F4EF] py-1.5 shadow-[0_8px_24px_rgba(28,11,25,0.12)]"
        >
          <MenuButton
            onClick={() => void shareVisualSummary()}
            disabled={busy}
          >
            {busy ? "Creating image…" : "Visual summary image"}
          </MenuButton>
          <MenuButton onClick={() => void copyPubmedLink()}>
            {copied ? "PubMed link copied" : "Copy PubMed link"}
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
        </div>
      )}
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
      className="block w-full px-3 py-2 text-left brief-sans text-[0.8125rem] text-[#1C0B19] no-underline hover:bg-[#EFECE4]"
    >
      {children}
    </a>
  );
}
