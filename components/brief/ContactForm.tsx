"use client";

import { useState } from "react";
import { brief } from "@/components/brief/briefTheme";

const FIELD =
  "box-border w-full max-w-full min-w-0 rounded-sm border border-[#D8D4C8] bg-white px-3.5 py-3 text-sm text-[#1C0B19] outline-none transition-colors placeholder:text-[#72705B]/60 focus:border-[#2A79A7] focus:ring-2 focus:ring-[#7BC1D4]/40";

export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState("General inquiry");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">(
    "idle"
  );
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/brief/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          topic,
          message: message.trim(),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Could not send message");
      }
      setStatus("ok");
      setName("");
      setEmail("");
      setMessage("");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (status === "ok") {
    return (
      <div
        className="rounded-sm border border-[#D8D4C8] bg-white p-8 text-center shadow-[0_1px_2px_rgba(28,11,25,0.04)]"
        role="status"
      >
        <div
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#7BC1D4]/25"
          aria-hidden
        >
          <span className={`${brief.serif} text-xl text-[#2A79A7]`}>✓</span>
        </div>
        <h3
          className={`mt-5 ${brief.serif} text-xl font-semibold tracking-tight`}
        >
          Message sent
        </h3>
        <p
          className={`mx-auto mt-2 max-w-sm ${brief.sans} text-sm leading-relaxed ${brief.muted}`}
        >
          Thanks for reaching out — we&apos;ll get back to you at the address you
          provided.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className={`mt-6 ${brief.action}`}
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="min-w-0 max-w-full overflow-hidden rounded-sm border border-[#D8D4C8] bg-white p-5 shadow-[0_1px_2px_rgba(28,11,25,0.04)] sm:p-8"
    >
      <div className="grid min-w-0 gap-5 sm:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor="contact-name" className={`${brief.meta} mb-2 block`}>
            Name
          </label>
          <input
            id="contact-name"
            type="text"
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            placeholder="Your name"
            className={FIELD}
          />
        </div>
        <div className="min-w-0">
          <label htmlFor="contact-email" className={`${brief.meta} mb-2 block`}>
            Email
          </label>
          <input
            id="contact-email"
            type="email"
            required
            maxLength={200}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            className={FIELD}
          />
        </div>
      </div>

      <div className="mt-5 min-w-0">
        <label htmlFor="contact-topic" className={`${brief.meta} mb-2 block`}>
          Reason
        </label>
        <select
          id="contact-topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className={`${FIELD} cursor-pointer`}
        >
          <option>General inquiry</option>
          <option>Feedback on the brief</option>
          <option>Collaboration opportunity</option>
          <option>Media or speaking</option>
          <option>Technical issue</option>
        </select>
      </div>

      <div className="mt-5 min-w-0">
        <label htmlFor="contact-message" className={`${brief.meta} mb-2 block`}>
          Message
        </label>
        <textarea
          id="contact-message"
          required
          minLength={10}
          maxLength={5000}
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="How can we help?"
          className={`${FIELD} min-h-[9rem] resize-y leading-relaxed`}
        />
      </div>

      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="submit"
          disabled={status === "loading"}
          className={`${brief.sans} inline-flex items-center justify-center rounded-sm bg-[#1C0B19] px-6 py-3 text-sm font-semibold tracking-wide text-[#F6F4EF] transition-colors hover:bg-[#2A79A7] disabled:opacity-50`}
        >
          {status === "loading" ? "Sending…" : "Send message →"}
        </button>
        <p className={`${brief.sans} text-xs ${brief.muted}`}>
          Your email is used only to reply.
        </p>
      </div>

      {status === "error" && error && (
        <p
          className={`mt-4 ${brief.sans} text-sm text-red-800`}
          role="alert"
        >
          {error}
        </p>
      )}
    </form>
  );
}
