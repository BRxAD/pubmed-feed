"use client";

import { useEffect, useId, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { brief } from "@/components/brief/briefTheme";

/**
 * The Brief's popup: a portal to document.body (so a story photo's stacking or a CSS transform cannot cover it on
 * mobile), Escape and the backdrop close it, and the page behind does not scroll.
 */
export default function BriefDialog({
  open,
  onClose,
  title,
  intro,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  intro?: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();
  // false while rendering on the server, true in the browser: the portal needs document.body.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-[#1C0B19]/45"
        onClick={onClose}
      />
      <div className="relative z-[201] max-h-[min(94vh,960px)] w-full max-w-5xl overflow-y-auto rounded-sm border border-[#D8D4C8] bg-[#F6F4EF] p-3 shadow-[0_16px_40px_rgba(28,11,25,0.2)] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <h2
            id={titleId}
            className={`${brief.serif} text-xl font-semibold tracking-tight ${brief.ink}`}
          >
            {title}
          </h2>
          <button type="button" onClick={onClose} className={`${brief.action} shrink-0`}>
            Close
          </button>
        </div>
        {intro && (
          <p className={`mt-2 ${brief.sans} text-sm leading-relaxed ${brief.muted}`}>
            {intro}
          </p>
        )}
        {children}
      </div>
    </div>,
    document.body
  );
}
