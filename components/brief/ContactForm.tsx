"use client";

import { useState } from "react";
import { brief } from "@/components/brief/briefTheme";

export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">(
    "idle"
  );
  const [feedback, setFeedback] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setFeedback("");
    try {
      const res = await fetch("/api/brief/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          message: message.trim(),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Could not send message");
      }
      setStatus("ok");
      setFeedback("Thanks — your message is on its way.");
      setName("");
      setEmail("");
      setMessage("");
    } catch (err) {
      setStatus("error");
      setFeedback(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  const fieldClass = `w-full ${brief.sans} text-sm bg-transparent border-0 border-b ${brief.rule} py-2.5 focus:outline-none focus:border-[#2A79A7] ${brief.ink} placeholder:text-[#72705B]/70`;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div>
        <label htmlFor="contact-name" className={`${brief.meta} block mb-1`}>
          Name
        </label>
        <input
          id="contact-name"
          type="text"
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={fieldClass}
          autoComplete="name"
        />
      </div>
      <div>
        <label htmlFor="contact-email" className={`${brief.meta} block mb-1`}>
          Email
        </label>
        <input
          id="contact-email"
          type="email"
          required
          maxLength={200}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={fieldClass}
          autoComplete="email"
        />
      </div>
      <div>
        <label htmlFor="contact-message" className={`${brief.meta} block mb-1`}>
          Message
        </label>
        <textarea
          id="contact-message"
          required
          maxLength={5000}
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={`${fieldClass} resize-y min-h-[8rem]`}
          placeholder="Questions, feedback, or collaboration ideas…"
        />
      </div>

      <button
        type="submit"
        disabled={status === "loading"}
        className={`${brief.sans} text-sm font-medium tracking-wide text-[#F6F4EF] bg-[#2A79A7] px-5 py-2.5 rounded-sm hover:bg-[#1C0B19] disabled:opacity-50 transition-colors`}
      >
        {status === "loading" ? "Sending…" : "Send message →"}
      </button>

      {feedback && (
        <p
          className={`${brief.sans} text-sm ${
            status === "error" ? "text-red-800" : brief.muted
          }`}
          role="status"
        >
          {feedback}
        </p>
      )}
    </form>
  );
}
