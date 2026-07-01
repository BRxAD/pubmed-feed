/** Atlantic-inspired brief design tokens (Tailwind arbitrary values). */
export const brief = {
  bg: "bg-[#f4f1ea]",
  ink: "text-[#1c1a16]",
  muted: "text-[#8a7f6d]",
  accent: "text-[#b0672e]",
  accentHover: "hover:text-[#8a4f22]",
  rule: "border-[#1c1a16]",
  hairline: "border-[#d4cfc4]",
  kicker:
    "brief-sans text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-[#b0672e]",
  meta:
    "brief-sans text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-[#8a7f6d]",
  serif: "brief-serif",
  sans: "brief-sans",
  deck: "brief-serif text-[#3d3830]",
  action:
    "brief-sans text-[0.8125rem] font-medium tracking-wide text-[#b0672e] hover:text-[#8a4f22] transition-colors",
  detailPanel: "rounded-sm bg-[#ebe6dc]/80 border border-[#d4cfc4]/80",
} as const;
