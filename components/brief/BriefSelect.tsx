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
  menuAlign = "left",
}: {
  label: string;
  value: string;
  options: BriefSelectOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  menuAlign?: "left" | "right";
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonId = useId();
  const listId = useId();
  const router = useRouter();
  const selected = options.find((o) => o.value === value) ?? options[0];
  const isAll = !value;
  const triggerLabel = isAll ? "" : (selected?.label ?? "");
  const triggerSwatch = !isAll && selected?.swatch ? selected.swatch : undefined;

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
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        id={buttonId}
        className={`${brief.sans} inline-flex max-w-[14rem] items-center gap-1 py-0.5 text-left text-[0.8125rem] font-medium tracking-[0.02em] text-[#1C0B19] transition-colors hover:text-[#2A79A7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2A79A7] sm:max-w-none`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${label}: ${isAll ? "All" : (selected?.label ?? "All")}`}
        onClick={() => onOpenChange(!open)}
      >
        <span>{label}</span>
        {triggerSwatch ? (
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: triggerSwatch }}
            aria-hidden
          />
        ) : null}
        {triggerLabel ? (
          <span className="min-w-0 truncate font-normal">{triggerLabel}</span>
        ) : null}
        <svg
          viewBox="0 0 12 8"
          className={`size-2 shrink-0 text-[#72705B] transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
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
        <div
          className={`absolute top-full z-30 pt-2 ${
            menuAlign === "right" ? "right-0 sm:right-auto sm:left-0" : "left-0"
          }`}
        >
          <span
            aria-hidden
            className={`pointer-events-none absolute top-0.5 z-10 ${
              menuAlign === "right" ? "right-5 sm:right-auto sm:left-5" : "left-5"
            }`}
          >
            <span className="block h-0 w-0 border-x-[7px] border-b-[7px] border-x-transparent border-b-[#C8C4B8]" />
            <span className="absolute left-1/2 top-[1px] block h-0 w-0 -translate-x-1/2 border-x-[6px] border-b-[6px] border-x-transparent border-b-white" />
          </span>
          <ul
            id={listId}
            role="listbox"
            aria-labelledby={buttonId}
            className="relative w-max min-w-[9.5rem] rounded-[3px] border border-[#C8C4B8] bg-white py-1 shadow-[0_2px_10px_rgba(28,11,25,0.12)]"
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
                    className={`${brief.sans} flex items-center gap-2 whitespace-nowrap px-3 py-1.5 text-[0.8125rem] transition-colors hover:bg-[#F6F4EF] ${
                      isActive
                        ? "font-medium text-[#1C0B19]"
                        : "font-normal text-[#1C0B19]/85"
                    }`}
                  >
                    {opt.swatch ? (
                      <span
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: opt.swatch }}
                        aria-hidden
                      />
                    ) : null}
                    {opt.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
