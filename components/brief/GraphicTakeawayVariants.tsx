"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Lightbulb,
  Globe,
  BookOpen,
  ScanLine,
  CheckCircle2,
  Users,
  Share2,
  BarChart3,
  MapPin,
  Sparkles,
} from "lucide-react";

const studyData = {
  category: "Hospital",
  date: "Sep 15, 2026",
  status: "New",
  headline:
    "Paediatric bloodstream infection trials lack standardised outcomes and patient-reported measures.",
  summary:
    "The lack of standardized outcome measures in pediatric BSI trials, particularly the absence of PROMs, underscores the need for developing a core outcome set to enhance comparability and support evidence-based decision-making in antimicrobial stewardship.",
  methods:
    "This scoping review analyzed outcome measures in pediatric antibiotic trials for bloodstream infections (BSIs) by screening 22,622 records, ultimately including 58 studies involving 14,424 pediatric and neonatal patients.",
  results:
    "The review found that clinical and microbiological outcomes were reported in 86% and 83% of studies, respectively, while no studies included patient-reported outcome measures (PROMs). A total of 514 distinct outcome subcategories were identified, highlighting significant variability in outcome reporting.",
  whoRegion: "Europe · Western Pacific",
  journal: "Clinical Microbiology and Infection",
  publisher:
    "The Official Publication of the European Society of Clinical Microbiology and Infectious Diseases",
  websiteUrl: "www.stewardshipbrief.com",
  qrCodePlaceholderUrl:
    "https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=https://www.stewardshipbrief.com",
};

type StudyData = typeof studyData;
type ViewMode = "all" | "slide" | "social" | "dashboard";

function QrBadge({
  src,
  label,
  light = false,
}: {
  src: string;
  label: string;
  light?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl p-2 ${
        light ? "bg-white shadow-sm ring-1 ring-slate-200" : "bg-white/10"
      }`}
    >
      <Image
        src={src}
        alt={`QR code for ${studyData.websiteUrl}`}
        width={72}
        height={72}
        className="size-[72px] rounded-lg bg-white p-1"
        unoptimized
      />
      <div>
        <p
          className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
            light ? "text-indigo-600" : "text-indigo-200"
          }`}
        >
          <ScanLine className="size-3" aria-hidden />
          {label}
        </p>
        <p className={`mt-0.5 text-xs ${light ? "text-slate-500" : "text-slate-300"}`}>
          {studyData.websiteUrl}
        </p>
      </div>
    </div>
  );
}

function LogoMark({ inverted = false }: { inverted?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`grid size-8 place-items-center rounded-md text-[10px] font-bold tracking-wider ${
          inverted
            ? "bg-white text-slate-900"
            : "bg-slate-900 text-white"
        }`}
      >
        TSB
      </span>
      <span
        className={`text-sm font-semibold tracking-tight ${
          inverted ? "text-white" : "text-slate-900"
        }`}
      >
        The Stewardship Brief
      </span>
    </div>
  );
}

function SlideCard({ data }: { data: StudyData }) {
  return (
    <article className="relative flex aspect-video w-full flex-col overflow-hidden rounded-2xl bg-slate-950 text-slate-50 shadow-2xl shadow-slate-900/30">
      <header className="flex items-center justify-between gap-4 bg-slate-900 px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-indigo-500 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">
            {data.category}
          </span>
          <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-slate-200">
            {data.date}
          </span>
          <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
            {data.status}
          </span>
        </div>
        <LogoMark inverted />
      </header>

      <div className="flex flex-1 flex-col gap-4 px-6 py-4">
        <h2 className="rounded-xl bg-white px-5 py-3 text-[24px] leading-snug font-extrabold tracking-tight text-slate-900">
          {data.headline}
        </h2>

        <div className="grid min-h-0 flex-1 grid-cols-3 gap-4">
          <section className="col-span-2 flex min-h-0 flex-col rounded-xl border-l-4 border-amber-400 bg-slate-900/80 p-4">
            <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-300">
              <Lightbulb className="size-4" aria-hidden />
              Takeaway
            </p>
            <p className="text-[15px] leading-relaxed text-slate-100">
              {data.summary}
            </p>
          </section>

          <aside className="flex min-h-0 flex-col gap-3 rounded-xl border border-white/15 bg-white/10 p-4 backdrop-blur-md">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-200">
              Study scope
            </p>
            <div className="flex items-start gap-2">
              <Globe className="mt-0.5 size-4 shrink-0 text-sky-300" aria-hidden />
              <p className="text-sm font-medium text-white">{data.whoRegion}</p>
            </div>
            <div className="rounded-lg bg-slate-950/50 p-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Methods
              </p>
              <p className="text-[12px] leading-snug text-slate-200">
                {data.methods}
              </p>
            </div>
            <div className="mt-auto flex items-start gap-2">
              <BookOpen className="mt-0.5 size-4 shrink-0 text-indigo-300" aria-hidden />
              <p className="text-[11px] leading-snug text-slate-300">
                {data.journal}
              </p>
            </div>
          </aside>
        </div>
      </div>

      <footer className="flex items-center justify-between gap-4 border-t border-white/10 bg-slate-900 px-6 py-3">
        <div>
          <p className="text-sm font-semibold text-white">{data.journal}</p>
          <p className="text-[11px] text-slate-400">{data.publisher}</p>
        </div>
        <QrBadge src={data.qrCodePlaceholderUrl} label="Scan for full brief" />
      </footer>
    </article>
  );
}

function SocialCard({ data }: { data: StudyData }) {
  return (
    <article className="relative flex aspect-square w-full flex-col overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 p-6 text-white shadow-2xl shadow-indigo-900/40">
      <div className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-indigo-500/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 size-56 rounded-full bg-sky-500/20 blur-3xl" />

      <div className="relative flex h-full flex-col">
        <p className="inline-flex w-fit items-center rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold tracking-wide text-indigo-100 backdrop-blur">
          {data.category} • {data.date}
        </p>

        <h2 className="mt-4 text-[28px] leading-[1.15] font-black tracking-tight">
          {data.headline}
        </h2>

        <div className="mt-5 grid min-h-0 flex-1 grid-cols-5 gap-3">
          <section className="col-span-3 flex h-fit flex-col rounded-2xl bg-white p-4 text-slate-900 shadow-lg">
            <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-indigo-600">
              <CheckCircle2 className="size-4" aria-hidden />
              Results
            </p>
            <p className="text-[13px] leading-relaxed text-slate-700">
              {data.results}
            </p>
          </section>

          <section className="col-span-2 flex flex-col gap-3 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-md">
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-indigo-200">
                <Users className="size-3.5" aria-hidden />
                Methods
              </p>
              <p className="text-[11px] leading-snug text-slate-100">
                {data.methods}
              </p>
            </div>
            <div className="mt-auto rounded-xl bg-slate-950/40 p-3">
              <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-300">
                <Globe className="size-3.5" aria-hidden />
                Region
              </p>
              <p className="text-sm font-semibold">{data.whoRegion}</p>
            </div>
          </section>
        </div>

        <footer className="relative mt-4 flex items-end justify-between gap-3">
          <LogoMark inverted />
          <QrBadge src={data.qrCodePlaceholderUrl} label="Open the brief" />
        </footer>
      </div>
    </article>
  );
}

function DashboardCard({ data }: { data: StudyData }) {
  return (
    <article className="flex w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-xl shadow-slate-200/80">
      <header className="border-b border-slate-200 bg-white px-6 py-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-indigo-600 px-3 py-1 text-[11px] font-semibold text-white">
            {data.category}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-600">
            {data.date}
          </span>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
            {data.status}
          </span>
          <span className="ml-auto hidden sm:block">
            <LogoMark />
          </span>
        </div>
        <h2 className="text-2xl leading-snug font-extrabold tracking-tight text-slate-900">
          {data.headline}
        </h2>
      </header>

      <div className="grid gap-4 p-5 md:grid-cols-3">
        <section className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
          <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-blue-700">
            <Sparkles className="size-4" aria-hidden />
            Core finding
          </p>
          <p className="text-sm leading-relaxed text-slate-800">{data.summary}</p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-slate-100/80 p-4">
          <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600">
            <BarChart3 className="size-4" aria-hidden />
            Study evidence
          </p>
          <p className="text-sm leading-relaxed text-slate-700">{data.results}</p>
        </section>

        <div className="flex flex-col gap-3">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
              <Users className="size-3.5" aria-hidden />
              Methods
            </p>
            <p className="text-[13px] leading-snug text-slate-700">{data.methods}</p>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
              <MapPin className="size-3.5" aria-hidden />
              Region
            </p>
            <p className="text-sm font-semibold text-slate-900">{data.whoRegion}</p>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
              <BookOpen className="size-3.5" aria-hidden />
              Journal
            </p>
            <p className="text-sm font-medium text-slate-900">{data.journal}</p>
          </section>
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 bg-white px-5 py-3">
        <QrBadge src={data.qrCodePlaceholderUrl} label="Scan for full brief" light />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{data.journal}</p>
          <p className="truncate text-xs text-slate-500">{data.publisher}</p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm"
        >
          <Share2 className="size-4" aria-hidden />
          Share Brief
        </button>
      </footer>
    </article>
  );
}

const TABS: { id: ViewMode; label: string }[] = [
  { id: "all", label: "All three" },
  { id: "slide", label: "16:9 slide" },
  { id: "social", label: "1:1 social" },
  { id: "dashboard", label: "Dashboard" },
];

export default function GraphicTakeawayVariants() {
  const [view, setView] = useState<ViewMode>("all");

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-600">
          Graphic takeaway options
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
          Compare three visual treatments
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Dummy study fields only. No live feed data. Pick a layout to potentially
          replace the current graphic takeaway.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Takeaway layout"
        className="mb-8 flex flex-wrap gap-2 rounded-full bg-slate-100 p-1"
      >
        {TABS.map((tab) => {
          const selected = view === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setView(tab.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                selected
                  ? "bg-slate-900 text-white shadow"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {(view === "all" || view === "slide") && (
        <section className="mb-12">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
            Variation 1 · 16:9 presentation slide
          </h2>
          <SlideCard data={studyData} />
        </section>
      )}

      {(view === "all" || view === "social") && (
        <section className="mb-12">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
            Variation 2 · 1:1 social asset
          </h2>
          <div className={view === "social" ? "mx-auto max-w-[640px]" : "max-w-[640px]"}>
            <SocialCard data={studyData} />
          </div>
        </section>
      )}

      {(view === "all" || view === "dashboard") && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
            Variation 3 · executive dashboard
          </h2>
          <DashboardCard data={studyData} />
        </section>
      )}
    </div>
  );
}
