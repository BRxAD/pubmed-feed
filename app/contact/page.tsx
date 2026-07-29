import type { Metadata } from "next";
import BriefSitePage from "@/components/brief/BriefSitePage";
import ContactForm from "@/components/brief/ContactForm";
import { brief } from "@/components/brief/briefTheme";

export const metadata: Metadata = {
  title: "Contact — The Stewardship Brief",
  description:
    "Get in touch about The Stewardship Brief — feedback, questions, or collaboration.",
};

export default function ContactPage() {
  return (
    <BriefSitePage title="Contact" kicker="Get in touch">
      <p className={`${brief.sans} text-sm leading-relaxed ${brief.muted} mb-8`}>
        For more information, feedback, or collaboration opportunities, send a
        note below. We read every message.
      </p>
      <ContactForm />
    </BriefSitePage>
  );
}
