"use client";

import { useEffect, useId, useRef } from "react";
import { useRouter } from "next/navigation";
import { brief } from "@/components/brief/briefTheme";

export type BriefSelectOption = {
  value: string;
  label: string;
  href: string;
  /** Optional color swatch (topic capsules). */
  swatch?: string;
};

export default function BriefSelect({
  label,
  value,
  options,
  open,
  onOpenChange,
}: {
  label: string;
  value: string;
  options: BriefSelectOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonId = useId();
  const listId = useId();
  const router = useRouter();
  const selected = options.find((o) => o.value === value) ?? options[0];
  const hasSwatches = options.some((o) => o.swatch);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={rootRef} className="relative min-w-[11.5rem] flex-1 sm:flex-none sm:w-[15.5rem]">
      <p
        id={buttonId}
        className={`${brief.sans} mb-1.5 text-[0.6875rem] font-medium tracking-[0.02em] text-[#72705B]`}
      >
        {label}
      </p>
      <button
        type="button"
        className={`${brief.sans} flex h-10 w-full items-center gap-2 rounded-lg border border-[#D8D4C8] bg-white px-3 text-left text-[0.8125rem] text-[#1C0B19] transition-[border-color,box-shadow] hover:border-[#1C0B19]/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2A79A7]`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${label}: ${selected?.label ?? "All"}`}
        onClick={() => onOpenChange(!open)}
      >
        {hasSwatches && selected?.swatch ? (
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: selected.swatch }}
            aria-hidden
          />
        ) : hasSwatches ? (
          <span className="size-2 shrink-0" aria-hidden />
        ) : null}
        <span className="min-w-0 flex-1 truncate">{selected?.label ?? "All"}</span>
        <svg
          viewBox="0 0 12 8"
          className={`size-2.5 shrink-0 text-[#72705B] transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path
            d="M1 1.5 L6 6.5 L11 1.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-labelledby={buttonId}
          className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-lg border border-[#D8D4C8] bg-white py-1 shadow-[0_10px_28px_-14px_rgba(28,11,25,0.28)]"
        >
          {options.map((opt) => {
            const isActive = opt.value === value;
            return (
              <li key={opt.value || "all"} role="none">
                <a
                  href={opt.href}
                  role="option"
                  aria-selected={isActive}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
                      return;
                    }
                    e.preventDefault();
                    onOpenChange(false);
                    router.push(opt.href);
                  }}
                  className={`${brief.sans} flex items-center gap-2.5 px-3 py-2 text-[0.8125rem] transition-colors hover:bg-[#F6F4EF] ${
                    isActive
                      ? "bg-[#F6F4EF] font-medium text-[#1C0B19]"
                      : "font-normal text-[#1C0B19]/85"
                  }`}
                >
                  {hasSwatches ? (
                    opt.swatch ? (
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: opt.swatch }}
                        aria-hidden
                      />
                    ) : (
                      <span className="size-2 shrink-0" aria-hidden />
                    )
                  ) : null}
                  {opt.label}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
