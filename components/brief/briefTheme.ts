/** Stewardship Brief design tokens — brand palette. */
export const briefPalette = {
  olive: "#72705B",
  plum: "#1C0B19",
  salmon: "#FFA69E",
  steel: "#2A79A7",
  sky: "#7BC1D4",
  paper: "#F6F4EF",
  paperWarm: "#EFECE4",
  hairline: "#D8D4C8",
} as const;

/** Tailwind class tokens for the brief. */
export const brief = {
  bg: "bg-[#F6F4EF]",
  ink: "text-[#1C0B19]",
  muted: "text-[#72705B]",
  accent: "text-[#2A79A7]",
  accentHover: "hover:text-[#1C0B19]",
  rule: "border-[#1C0B19]",
  hairline: "border-[#D8D4C8]",
  /**
   * Broadsheet shell — ~5vw side gutters (NYT-like), capped so ultra-wide
   * screens grow empty margin instead of stretching the grid forever.
   */
  shell: "mx-auto w-full max-w-[1570px] px-[max(1rem,5vw)]",
  kicker:
    "brief-sans text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-[#2A79A7]",
  meta:
    "brief-sans text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-[#72705B]",
  serif: "brief-serif",
  sans: "brief-sans",
  deck: "brief-sans text-[#1C0B19]/90",
  action:
    "brief-sans text-[0.8125rem] font-medium tracking-wide text-[#2A79A7] hover:text-[#1C0B19] transition-colors",
  detailPanel: "rounded-sm bg-[#EFECE4]/90 border border-[#D8D4C8]",
  salmon: "text-[#FFA69E]",
  sky: "text-[#7BC1D4]",
} as const;
