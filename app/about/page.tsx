import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import BriefSitePage from "@/components/brief/BriefSitePage";
import PageHero from "@/components/brief/PageHero";
import { brief } from "@/components/brief/briefTheme";

export const metadata: Metadata = {
  title: "About — The Stewardship Brief",
  description:
    "How The Stewardship Brief uses AI to intake, summarize, classify, and rank new antimicrobial stewardship research.",
};

const STEPS = [
  {
    n: "01",
    title: "Intake",
    body: "New literature is pulled from PubMed as it publishes, across hospital, community, long-term care, and One Health settings.",
  },
  {
    n: "02",
    title: "Summarize",
    body: "Each study is distilled to what was done, what was found, and the practical bottom line for stewardship practice.",
  },
  {
    n: "03",
    title: "Classify",
    body: "Design, setting, and population are tagged so the same paper can be found by the readers it actually applies to.",
  },
  {
    n: "04",
    title: "Rank",
    body: "A clinical rubric scores journal quality, study design, scale, and relevance — refined by human editorial review.",
  },
] as const;

export default function AboutPage() {
  return (
    <BriefSitePage active="/about">
      <PageHero
        kicker="About"
        title="The signal in a fast-moving field."
        lede="Antimicrobial stewardship research grows every week. The Brief exists to surface the work most likely to change practice."
        imageUrl="https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&w=2000&q=80"
        imageAlt="Modern hospital atrium"
      />

      {/* Lede */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.35fr_1fr] lg:gap-16">
          <div>
            <p className={`${brief.kicker} mb-5`}>Why it exists</p>
            <p
              className={`${brief.serif} text-[1.45rem] leading-[1.5] tracking-[-0.01em] sm:text-[1.6rem]`}
            >
              Antimicrobial stewardship is a rapidly developing field. Lots of
              new research informs our practice, but some is more influential
              than others.
            </p>
            <p
              className={`mt-6 max-w-[62ch] ${brief.deck} text-[0.9375rem] leading-[1.75]`}
            >
              To keep up with this growing body of literature and identify the
              most impactful articles,{" "}
              <span className="font-medium">The Stewardship Brief</span> aims to
              leverage AI to intake, summarize, classify, and rank new research
              in the field.
            </p>
            <p
              className={`mt-4 max-w-[62ch] ${brief.sans} text-[0.9375rem] leading-[1.75] ${brief.muted}`}
            >
              The result is a short daily read: a lead story, the studies worth
              knowing about, and a running list of the highest-priority work
              from the past twelve months.
            </p>
          </div>

          <figure className="relative">
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-sm">
              <Image
                src="https://images.unsplash.com/photo-1576086213369-97a306d36557?auto=format&fit=crop&w=1200&q=80"
                alt="Laboratory microscope"
                fill
                sizes="(max-width: 1024px) 100vw, 420px"
                className="object-cover"
              />
            </div>
            <figcaption
              className={`mt-3 ${brief.sans} text-xs leading-relaxed ${brief.muted}`}
            >
              Evidence moves from bench and bedside to practice — the Brief
              tracks the part that changes what clinicians do.
            </figcaption>
          </figure>
        </div>
      </section>

      {/* Pull quote band */}
      <section className="border-y border-[#D8D4C8] bg-[#EFECE4]/70">
        <div className="mx-auto max-w-4xl px-4 py-14 text-center sm:px-6 sm:py-16 lg:px-8">
          <p
            className={`${brief.serif} text-[1.6rem] font-medium leading-[1.4] tracking-[-0.015em] sm:text-[2rem]`}
          >
            “Not every study should change your practice. The hard part is
            knowing which ones might.”
          </p>
        </div>
      </section>

      {/* Process */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="max-w-2xl">
          <p className={`${brief.kicker} mb-4`}>How it works</p>
          <h2
            className={`${brief.serif} text-3xl font-semibold leading-[1.15] tracking-[-0.02em] sm:text-4xl`}
          >
            Four steps, every day
          </h2>
        </div>

        <ol className="mt-12 grid gap-px overflow-hidden border border-[#D8D4C8] bg-[#D8D4C8] sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <li key={step.n} className="bg-[#F6F4EF] p-6 sm:p-7">
              <p
                className={`${brief.serif} text-2xl font-semibold text-[#2A79A7]`}
              >
                {step.n}
              </p>
              <h3
                className={`mt-3 ${brief.sans} text-sm font-semibold uppercase tracking-[0.1em]`}
              >
                {step.title}
              </h3>
              <p
                className={`mt-3 ${brief.sans} text-[0.875rem] leading-[1.65] ${brief.muted}`}
              >
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* Author */}
      <section className="border-t border-[#D8D4C8]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="grid gap-10 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-12">
            <div
              className="flex h-24 w-24 items-center justify-center rounded-full border border-[#D8D4C8] bg-[#EFECE4]"
              aria-hidden
            >
              <span
                className={`${brief.serif} text-2xl font-semibold tracking-tight text-[#2A79A7]`}
              >
                BL
              </span>
            </div>
            <div>
              <p className={`${brief.meta} mb-2`}>Developed by</p>
              <p
                className={`${brief.serif} text-2xl font-semibold tracking-[-0.015em] sm:text-3xl`}
              >
                Bradley Langford, PharmD, MPH
              </p>
              <p
                className={`mt-3 max-w-[58ch] ${brief.sans} text-[0.9375rem] leading-[1.7] ${brief.muted}`}
              >
                Built for clinicians, pharmacists, and researchers who need to
                stay current without reading everything.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#1C0B19]">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-14 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div>
            <h2
              className={`${brief.serif} text-2xl font-semibold tracking-[-0.015em] text-[#F6F4EF] sm:text-3xl`}
            >
              Questions, feedback, or collaboration?
            </h2>
            <p
              className={`mt-2 ${brief.sans} text-sm leading-relaxed text-[#F6F4EF]/70`}
            >
              We read every message.
            </p>
          </div>
          <Link
            href="/contact"
            className={`${brief.sans} inline-flex shrink-0 items-center justify-center rounded-sm bg-[#7BC1D4] px-6 py-3 text-sm font-semibold tracking-wide text-[#1C0B19] transition-colors hover:bg-[#F6F4EF]`}
          >
            Contact us →
          </Link>
        </div>
      </section>
    </BriefSitePage>
  );
}
