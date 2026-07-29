import type { Metadata } from "next";
import BriefSitePage from "@/components/brief/BriefSitePage";
import PageHero from "@/components/brief/PageHero";
import ContactForm from "@/components/brief/ContactForm";
import { brief } from "@/components/brief/briefTheme";

export const metadata: Metadata = {
  title: "Contact — The Stewardship Brief",
  description:
    "Reach The Stewardship Brief for more information, feedback, or collaboration opportunities.",
};

const REASONS = [
  {
    title: "Feedback",
    body: "Tell us when a ranking looks wrong, or what you wish the brief covered.",
  },
  {
    title: "Collaboration",
    body: "Research partnerships, editorial input, or applying the model to another field.",
  },
  {
    title: "More information",
    body: "Questions about methods, scoring, or how studies are selected.",
  },
] as const;

export default function ContactPage() {
  return (
    <BriefSitePage active="/contact">
      <PageHero
        kicker="Contact"
        title="Start a conversation."
        lede="For more information, feedback, or collaboration opportunities."
        imageUrl="https://images.unsplash.com/photo-1631217868264-e5b90bb7e133?auto=format&fit=crop&w=2000&q=80"
        imageAlt="Clinicians in discussion"
        size="short"
      />

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.25fr] lg:gap-16">
          <div>
            <p className={`${brief.kicker} mb-4`}>Get in touch</p>
            <h2
              className={`${brief.serif} text-3xl font-semibold leading-[1.15] tracking-[-0.02em] sm:text-[2.5rem]`}
            >
              We read every message
            </h2>
            <p
              className={`mt-5 max-w-[52ch] ${brief.deck} text-[0.9375rem] leading-[1.75]`}
            >
              Use the form and we&apos;ll reply directly. Please include enough
              detail that we can be useful on the first response.
            </p>

            <dl className="mt-10 divide-y divide-[#D8D4C8] border-y border-[#D8D4C8]">
              {REASONS.map((reason) => (
                <div key={reason.title} className="py-5">
                  <dt
                    className={`${brief.sans} text-sm font-semibold uppercase tracking-[0.1em]`}
                  >
                    {reason.title}
                  </dt>
                  <dd
                    className={`mt-2 max-w-[52ch] ${brief.sans} text-sm leading-[1.65] ${brief.muted}`}
                  >
                    {reason.body}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div>
            <ContactForm />
          </div>
        </div>
      </section>
    </BriefSitePage>
  );
}
