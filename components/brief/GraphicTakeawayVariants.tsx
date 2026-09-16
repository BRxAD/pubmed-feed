"use client";

import { useEffect, useState } from "react";
import type { BriefItem } from "@/lib/brief/items";
import {
  composeVisualSummary,
  downloadBlob,
} from "@/components/brief/composeVisualSummary";

const DEMO_IMAGE = {
  id: "demo",
  url: "https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=1600&q=80",
  confidence: 1,
  label: "hospital",
  tier: "strict" as const,
};

const demoItem = {
  pmid: "99999999",
  source: "pubmed" as const,
  headline:
    "Paediatric bloodstream infection trials lack standardised outcomes and patient-reported measures.",
  title:
    "Outcome measures in paediatric bloodstream infection trials: a scoping review",
  journal: "Clinical Microbiology and Infection",
  jif: null,
  jifIsHigh: false,
  isQ1: true,
  sjrScimago: null,
  date: "2026-09-15",
  createdAt: "2026-09-15T12:00:00.000Z",
  fetchedAt: null,
  isNew: false,
  setting: "hospital" as const,
  settings: ["hospital" as const],
  adminSetting: null,
  topics: [],
  autoTopics: [],
  whoRegions: [],
  autoWhoRegions: [],
  studyLabel: "Scoping review",
  methods:
    "This scoping review analyzed outcome measures in pediatric antibiotic trials for bloodstream infections (BSIs) by screening 22,622 records, ultimately including 58 studies involving 14,424 pediatric and neonatal patients.",
  results:
    "The review found that clinical and microbiological outcomes were reported in 86% and 83% of studies, respectively, while no studies included patient-reported outcome measures (PROMs). A total of 514 distinct outcome subcategories were identified, highlighting significant variability in outcome reporting.",
  bottomLine:
    "Pediatric BSI trials need a core outcome set: none of the 58 studies included patient-reported outcome measures.",
  relevancePercent: 80,
  predictedPriority: 7,
  adminPriority: 7,
  effectivePriority: 7,
  prioritySource: "admin" as const,
  pubmedUrl: "https://pubmed.ncbi.nlm.nih.gov/99999999/",
  authors: ["Langford BJ", "Morris AM", "Daneman N"],
  keywords: [],
  meshTerms: [],
  abstractSnippet: null,
} satisfies BriefItem;

export default function GraphicTakeawayVariants() {
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const next = await composeVisualSummary({
          item: demoItem,
          image: DEMO_IMAGE,
        });
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(next);
        revoked = objectUrl;
        setBlob(next);
        setUrl(objectUrl);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not build preview");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <p className="brief-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-[#2A79A7]">
          Graphic takeaway 2.0
        </p>
        <h1 className="brief-serif mt-1 text-3xl font-bold tracking-tight text-[#1C0B19]">
          Live Brief download card
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#72705B]">
          This is the PNG the Brief salmon chip downloads. Dummy paper for
          preview. Version 1.0 (4:5 navy card) is in git if we want it later.
        </p>
      </header>

      <div className="overflow-hidden rounded-sm border border-[#D8D4C8] bg-[#1C0B19]">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob preview
          <img
            src={url}
            alt="Graphic takeaway preview"
            className="h-auto w-full"
          />
        ) : (
          <div className="flex aspect-video items-center justify-center text-sm text-[#F6F4EF]/80">
            {busy ? "Preparing graphic…" : error ?? "Preview unavailable"}
          </div>
        )}
      </div>

      {error && url && (
        <p className="mt-3 text-sm text-[#9B3A3A]">{error}</p>
      )}

      <div className="mt-5">
        <button
          type="button"
          disabled={!blob}
          onClick={() => {
            if (blob) downloadBlob(blob, "stewardship-brief-takeaway-demo.png");
          }}
          className="rounded-sm border border-[#FFA69E]/25 bg-[#FFA69E]/12 px-3 py-1.5 text-sm font-medium text-[#1C0B19] hover:bg-[#FFA69E]/20 disabled:opacity-50"
        >
          Download PNG
        </button>
      </div>
    </div>
  );
}
