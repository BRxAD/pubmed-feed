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

type PreparedShare = {
  blob: Blob;
  file: File;
};

export default function ShareMenu({ item, image }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<PreparedShare | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const prepareGen = useRef(0);

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

  // Prefetch the PNG while the menu is open so Share runs inside a user gesture.
  useEffect(() => {
    if (!open) return;
    const gen = ++prepareGen.current;
    let cancelled = false;
    setPrepared(null);
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        const blob = await composeVisualSummary({ item, image });
        if (cancelled || gen !== prepareGen.current) return;
        const filename = `stewardship-brief-${item.pmid}.png`;
        setPrepared({
          blob,
          file: new File([blob], filename, { type: "image/png" }),
        });
      } catch (e) {
        if (cancelled || gen !== prepareGen.current) return;
        setError(
          e instanceof Error ? e.message : "Could not create graphic takeaway"
        );
      } finally {
        if (!cancelled && gen === prepareGen.current) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, item, image]);

  async function copyPubmedLink() {
    setError(null);
    try {
      await navigator.clipboard.writeText(item.pubmedUrl);
      setCopied(true);
    } catch {
      setError("Could not copy link");
    }
  }

  async function shareGraphicTakeaway() {
    setError(null);
    // Must call navigator.share in this click turn — no await before it.
    if (!prepared) {
      setError(
        busy
          ? "Still preparing image — tap Share graphic takeaway again in a moment"
          : "Image not ready — open Share again"
      );
      return;
    }

    const { file, blob } = prepared;
    try {
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
        downloadBlob(blob, file.name);
      }
      setOpen(false);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      const msg = e instanceof Error ? e.message : "Could not share";
      // Gesture lost mid-flight — fall back to download so the tap still works.
      if (/user gesture|NotAllowedError/i.test(msg) || (e instanceof DOMException && e.name === "NotAllowedError")) {
        downloadBlob(blob, file.name);
        setOpen(false);
        return;
      }
      console.error(e);
      setError(msg);
    }
  }

  const shareText = [
    item.headline,
    item.bottomLine,
    item.pubmedUrl,
    "via The Stewardship Brief - www.stewardshipbrief.com",
  ]
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
        <>
          <button
            type="button"
            aria-label="Close share menu"
            className="fixed inset-0 z-40 bg-[#1C0B19]/35 sm:hidden"
            onClick={() => setOpen(false)}
          />
          <div
            id={menuId}
            role="menu"
            className={[
              "z-50 w-[min(15.5rem,calc(100vw-2rem))] rounded-sm border border-[#D8D4C8] bg-[#F6F4EF] py-1.5 shadow-[0_8px_24px_rgba(28,11,25,0.12)]",
              "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
              "sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:translate-x-0 sm:translate-y-0",
            ].join(" ")}
          >
            <MenuButton
              onClick={() => void shareGraphicTakeaway()}
              disabled={busy && !prepared}
            >
              {busy && !prepared
                ? "Preparing image…"
                : "Share graphic takeaway"}
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
        </>
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
      className="block w-full px-3 py-2 text-left brief-sans text-[0.8125rem] text-[#1C0B19] hover:bg-[#EFECE4]"
    >
      {children}
    </a>
  );
}
