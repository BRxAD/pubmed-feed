"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { brief } from "@/components/brief/briefTheme";
import type { BriefItem } from "@/lib/brief/items";
import type { NewsItem } from "@/lib/news/types";
import type { BriefAnnouncement } from "@/lib/digest/announcements";
import {
  saveAnnouncementAction,
  sendTestBriefEmailAction,
} from "@/app/email_preview/actions";
import { buildBriefDigestEmail } from "@/lib/digest/briefEmailFormat";

export default function EmailPreviewDashboard({
  secret,
  upcomingItems,
  unsentNews,
  initialAnnouncement,
  userEmail,
  briefBaseUrl,
}: {
  secret: string;
  upcomingItems: BriefItem[];
  unsentNews: NewsItem[];
  initialAnnouncement: BriefAnnouncement;
  userEmail?: string | null;
  briefBaseUrl: string;
}) {
  // Announcement state
  const [announcementTitle, setAnnouncementTitle] = useState(
    initialAnnouncement.title ?? ""
  );
  const [announcementBody, setAnnouncementBody] = useState(
    initialAnnouncement.body ?? ""
  );
  const [announcementActive, setAnnouncementActive] = useState(
    Boolean(initialAnnouncement.active)
  );
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [saveMessage, setSaveMessage] = useState("");

  // Test email state
  const [testEmail, setTestEmail] = useState(userEmail ?? "");
  const [testWithNews, setTestWithNews] = useState(true);
  const [testStatus, setTestStatus] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [testMessage, setTestMessage] = useState("");

  // Preview display controls
  const [previewWidth, setPreviewWidth] = useState<"desktop" | "mobile">(
    "desktop"
  );
  const [previewIncludeNews, setPreviewIncludeNews] = useState(true);

  // Live built email preview
  const liveAnnouncement = useMemo<BriefAnnouncement>(() => {
    return {
      title: announcementTitle,
      body: announcementBody,
      active: announcementActive,
    };
  }, [announcementTitle, announcementBody, announcementActive]);

  const dateLabel = useMemo(() => {
    return new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, []);

  const previewHtml = useMemo(() => {
    const newsToInclude = previewIncludeNews ? unsentNews : [];
    const annToInclude =
      liveAnnouncement.active &&
      (liveAnnouncement.title.trim() || liveAnnouncement.body.trim())
        ? liveAnnouncement
        : null;

    const built = buildBriefDigestEmail({
      items: upcomingItems,
      briefUrl: briefBaseUrl,
      dateLabel,
      logoUrl: `${briefBaseUrl}/stewardship-brief-logo.png`,
      logoLightUrl: `${briefBaseUrl}/stewardship-brief-logo-light.png`,
      newsItems: newsToInclude,
      announcement: annToInclude,
      saveUrlForPmid: (pmid) => `${briefBaseUrl}/article/${pmid}?save=1`,
    });

    return built.html;
  }, [
    upcomingItems,
    unsentNews,
    liveAnnouncement,
    previewIncludeNews,
    briefBaseUrl,
    dateLabel,
  ]);

  async function handleSaveAnnouncement(e: React.FormEvent) {
    e.preventDefault();
    setSaveStatus("saving");
    setSaveMessage("");

    const res = await saveAnnouncementAction({
      secret,
      title: announcementTitle,
      body: announcementBody,
      active: announcementActive,
    });

    if (!res.ok) {
      setSaveStatus("error");
      setSaveMessage(res.error ?? "Failed to save announcement.");
      return;
    }

    setSaveStatus("saved");
    setSaveMessage(
      announcementActive
        ? "Announcement saved and marked ACTIVE. It will appear in upcoming email briefs."
        : "Announcement saved (marked inactive)."
    );
  }

  async function handleSendTest(e: React.FormEvent) {
    e.preventDefault();
    if (!testEmail.trim()) {
      setTestStatus("error");
      setTestMessage("Enter a valid email address.");
      return;
    }

    setTestStatus("sending");
    setTestMessage("");

    const annToInclude =
      liveAnnouncement.active &&
      (liveAnnouncement.title.trim() || liveAnnouncement.body.trim())
        ? liveAnnouncement
        : null;

    const res = await sendTestBriefEmailAction({
      secret,
      toEmail: testEmail,
      includeNews: testWithNews,
      announcement: annToInclude,
    });

    if (!res.ok) {
      setTestStatus("error");
      setTestMessage(res.error ?? "Failed to send test email.");
      return;
    }

    setTestStatus("sent");
    setTestMessage(
      `Test email sent successfully to ${testEmail}! Message ID: ${res.messageId ?? "sent"}`
    );
  }

  return (
    <div className="space-y-10">
      {/* Overview Stat Badges */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="rounded-sm bg-[#1C0B19]/10 px-2.5 py-1 font-semibold text-[#1C0B19]">
          {upcomingItems.length}{" "}
          {upcomingItems.length === 1 ? "upcoming study" : "upcoming studies"}
        </span>
        <span className="rounded-sm bg-[#2A79A7]/15 px-2.5 py-1 font-semibold text-[#2A79A7]">
          {unsentNews.length}{" "}
          {unsentNews.length === 1 ? "unsent news item" : "unsent news items"}
        </span>
        <span
          className={`rounded-sm px-2.5 py-1 font-semibold ${
            announcementActive &&
            (announcementTitle.trim() || announcementBody.trim())
              ? "bg-[#34A853]/15 text-[#1b6d31]"
              : "bg-[#72705B]/15 text-[#72705B]"
          }`}
        >
          {announcementActive &&
          (announcementTitle.trim() || announcementBody.trim())
            ? "Announcement: Active"
            : "Announcement: Inactive"}
        </span>
      </div>

      {/* Control Panels Grid: Announcement Editor + Test Email Sender */}
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Panel 1: Announcement Editor */}
        <section
          aria-labelledby="announcement-panel-heading"
          className="rounded-sm border border-[#D8D4C8] bg-white p-5 shadow-xs"
        >
          <div className="mb-4 border-b border-[#D8D4C8] pb-3">
            <h2
              id="announcement-panel-heading"
              className={`${brief.serif} text-lg font-bold text-[#1C0B19]`}
            >
              Bottom Announcement Section
            </h2>
            <p className="mt-1 font-sans text-xs text-[#72705B] leading-relaxed">
              Add a custom headline and message displayed at the bottom of the
              email brief (e.g. webinars, policy alerts, service updates).
            </p>
          </div>

          <form onSubmit={handleSaveAnnouncement} className="space-y-4">
            <div>
              <label
                htmlFor="ann-title"
                className="block font-sans text-xs font-semibold text-[#1C0B19] uppercase tracking-wider"
              >
                Announcement Headline (Optional)
              </label>
              <input
                id="ann-title"
                type="text"
                value={announcementTitle}
                onChange={(e) => setAnnouncementTitle(e.target.value)}
                placeholder="e.g. Upcoming Stewardship Webinar: Register by Friday"
                className="mt-1.5 w-full rounded-sm border border-[#D8D4C8] bg-white px-3 py-2 text-xs text-[#1C0B19] outline-none transition-colors focus:border-[#2A79A7] focus:ring-1 focus:ring-[#2A79A7]"
              />
            </div>

            <div>
              <label
                htmlFor="ann-body"
                className="block font-sans text-xs font-semibold text-[#1C0B19] uppercase tracking-wider"
              >
                Announcement Text
              </label>
              <textarea
                id="ann-body"
                rows={4}
                value={announcementBody}
                onChange={(e) => setAnnouncementBody(e.target.value)}
                placeholder="Enter announcement details, links, instructions, or deadlines..."
                className="mt-1.5 w-full rounded-sm border border-[#D8D4C8] bg-white px-3 py-2 text-xs text-[#1C0B19] outline-none transition-colors focus:border-[#2A79A7] focus:ring-1 focus:ring-[#2A79A7]"
              />
            </div>

            <label className="flex cursor-pointer items-start gap-2.5 pt-1">
              <input
                type="checkbox"
                checked={announcementActive}
                onChange={(e) => setAnnouncementActive(e.target.checked)}
                className="mt-0.5 accent-[#2A79A7]"
              />
              <span className="text-xs text-[#1C0B19]">
                <strong className="font-semibold">
                  Include in morning email brief
                </strong>
                <span className="block text-[11px] text-[#72705B]">
                  When active, this banner is automatically attached to the next
                  automated morning brief.
                </span>
              </span>
            </label>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={saveStatus === "saving"}
                className="rounded-sm bg-[#1C0B19] px-4 py-2 text-xs font-semibold text-[#FAF9F5] transition-colors hover:bg-[#2A79A7] disabled:opacity-50"
              >
                {saveStatus === "saving" ? "Saving…" : "Save Announcement"}
              </button>

              {saveMessage && (
                <p
                  className={`text-xs ${
                    saveStatus === "error" ? "text-red-700" : "text-[#2A79A7]"
                  }`}
                  role="status"
                >
                  {saveMessage}
                </p>
              )}
            </div>
          </form>
        </section>

        {/* Panel 2: Test Email Sender */}
        <section
          aria-labelledby="test-email-heading"
          className="rounded-sm border border-[#D8D4C8] bg-white p-5 shadow-xs"
        >
          <div className="mb-4 border-b border-[#D8D4C8] pb-3">
            <h2
              id="test-email-heading"
              className={`${brief.serif} text-lg font-bold text-[#1C0B19]`}
            >
              Send Test Email
            </h2>
            <p className="mt-1 font-sans text-xs text-[#72705B] leading-relaxed">
              Send this exact preview to your personal inbox right now to verify
              rendering in Gmail, Outlook, or Apple Mail.
            </p>
          </div>

          <form onSubmit={handleSendTest} className="space-y-4">
            <div>
              <label
                htmlFor="test-email-input"
                className="block font-sans text-xs font-semibold text-[#1C0B19] uppercase tracking-wider"
              >
                Recipient Email
              </label>
              <input
                id="test-email-input"
                type="email"
                required
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="your.email@example.com"
                className="mt-1.5 w-full rounded-sm border border-[#D8D4C8] bg-white px-3 py-2 text-xs text-[#1C0B19] outline-none transition-colors focus:border-[#2A79A7] focus:ring-1 focus:ring-[#2A79A7]"
              />
            </div>

            <label className="flex cursor-pointer items-start gap-2.5 pt-1">
              <input
                type="checkbox"
                checked={testWithNews}
                onChange={(e) => setTestWithNews(e.target.checked)}
                className="mt-0.5 accent-[#2A79A7]"
              />
              <span className="text-xs text-[#1C0B19]">
                <strong className="font-semibold">
                  Include &ldquo;In the News&rdquo; section
                </strong>{" "}
                ({unsentNews.length} unsent {unsentNews.length === 1 ? "story" : "stories"} available)
              </span>
            </label>

            <div className="flex flex-wrap items-center gap-3 pt-4">
              <button
                type="submit"
                disabled={testStatus === "sending"}
                className="rounded-sm bg-[#2A79A7] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#236389] disabled:opacity-50"
              >
                {testStatus === "sending" ? "Sending test…" : "Send Test Email →"}
              </button>

              {testMessage && (
                <p
                  className={`text-xs ${
                    testStatus === "error" ? "text-red-700" : "text-[#1b6d31]"
                  }`}
                  role="status"
                >
                  {testMessage}
                </p>
              )}
            </div>
          </form>
        </section>
      </div>

      {/* Live Email Preview Frame */}
      <section aria-labelledby="preview-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D8D4C8] pb-3">
          <div>
            <h2
              id="preview-heading"
              className={`${brief.serif} text-xl font-bold text-[#1C0B19]`}
            >
              Live Email Preview
            </h2>
            <p className="mt-0.5 text-xs text-[#72705B]">
              Reflects the exact HTML delivered to subscriber inboxes. Updates live as you edit.
            </p>
          </div>

          {/* Preview Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPreviewIncludeNews((v) => !v)}
              className={`rounded-sm border px-2.5 py-1 text-xs font-medium transition-colors ${
                previewIncludeNews
                  ? "border-[#2A79A7] bg-[#2A79A7]/10 text-[#2A79A7]"
                  : "border-[#D8D4C8] bg-white text-[#72705B]"
              }`}
            >
              {previewIncludeNews ? "✓ In the News on" : "In the News off"}
            </button>

            <div className="inline-flex rounded-sm border border-[#D8D4C8] bg-white p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setPreviewWidth("desktop")}
                className={`rounded-xs px-2.5 py-1 font-medium transition-colors ${
                  previewWidth === "desktop"
                    ? "bg-[#1C0B19] text-white"
                    : "text-[#72705B] hover:text-[#1C0B19]"
                }`}
              >
                Desktop
              </button>
              <button
                type="button"
                onClick={() => setPreviewWidth("mobile")}
                className={`rounded-xs px-2.5 py-1 font-medium transition-colors ${
                  previewWidth === "mobile"
                    ? "bg-[#1C0B19] text-white"
                    : "text-[#72705B] hover:text-[#1C0B19]"
                }`}
              >
                Mobile
              </button>
            </div>
          </div>
        </div>

        {/* Iframe Preview Container */}
        <div className="flex justify-center rounded-sm border border-[#D8D4C8] bg-[#EFECE4] p-4 sm:p-8">
          <div
            className={`w-full transition-all duration-200 shadow-md ${
              previewWidth === "mobile" ? "max-w-[400px]" : "max-w-[640px]"
            }`}
          >
            <iframe
              srcDoc={previewHtml}
              title="Email Brief Preview"
              className="h-[800px] w-full rounded-sm border border-[#D8D4C8] bg-[#F8F6F0]"
              sandbox="allow-same-origin allow-popups"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
