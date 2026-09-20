"use client";

import { useMemo, useState, type FormEvent } from "react";
import { brief } from "@/components/brief/briefTheme";
import type { AuthorOutreachRow } from "@/lib/digest/authorOutreachTypes";
import {
  saveAuthorOutreachEditsAction,
  setAuthorOutreachStatusAction,
} from "@/app/email_preview/actions";

type Lists = {
  pending: AuthorOutreachRow[];
  noEmail: AuthorOutreachRow[];
  held: AuthorOutreachRow[];
  never: AuthorOutreachRow[];
  sent: AuthorOutreachRow[];
};

function maskEmail(email: string | null): string {
  if (!email) return "—";
  const [user, domain] = email.split("@");
  if (!domain) return email;
  const shown = user.length <= 2 ? `${user[0] ?? ""}*` : `${user.slice(0, 2)}…`;
  return `${shown}@${domain}`;
}

function DraftCard({
  row,
  secret,
  mode,
}: {
  row: AuthorOutreachRow;
  secret: string;
  mode: "pending" | "held";
}) {
  const [subject, setSubject] = useState(row.subject ?? "");
  const [bodyText, setBodyText] = useState(row.body_text ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");
  const [gone, setGone] = useState(false);

  const previewHtml = useMemo(() => row.body_html ?? "", [row.body_html]);

  async function saveEdits(e: FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setMessage("");
    const res = await saveAuthorOutreachEditsAction({
      secret,
      pmid: row.pmid,
      subject,
      bodyText,
    });
    if (!res.ok) {
      setStatus("error");
      setMessage(res.error ?? "Save failed.");
      return;
    }
    setStatus("saved");
    setMessage("Saved. The evening send will use this text.");
  }

  async function setNext(
    next: "held" | "never" | "pending"
  ) {
    setStatus("saving");
    const res = await setAuthorOutreachStatusAction({
      secret,
      pmid: row.pmid,
      status: next,
    });
    if (!res.ok) {
      setStatus("error");
      setMessage(res.error ?? "Update failed.");
      return;
    }
    setGone(true);
  }

  if (gone) return null;

  return (
    <article className="rounded-sm border border-[#D8D4C8] bg-white p-4 shadow-xs">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-sans text-[11px] uppercase tracking-wider text-[#72705B]">
            PMID {row.pmid}
            {row.corresponding_email
              ? ` · ${maskEmail(row.corresponding_email)}`
              : ""}
          </p>
          <h3 className={`${brief.serif} mt-1 text-base font-bold text-[#1C0B19]`}>
            {row.headline || row.title || `PMID ${row.pmid}`}
          </h3>
          {row.journal && (
            <p className="mt-0.5 font-sans text-xs text-[#72705B]">{row.journal}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {mode === "pending" && (
            <>
              <button
                type="button"
                onClick={() => void setNext("held")}
                className="rounded-sm border border-[#D8D4C8] px-2.5 py-1 text-xs font-medium text-[#1C0B19] hover:bg-[#EFECE4]"
              >
                Hold
              </button>
              <button
                type="button"
                onClick={() => void setNext("never")}
                className="rounded-sm border border-red-200 px-2.5 py-1 text-xs font-medium text-red-800 hover:bg-red-50"
              >
                Never send
              </button>
            </>
          )}
          {mode === "held" && (
            <button
              type="button"
              onClick={() => void setNext("pending")}
              className="rounded-sm border border-[#D8D4C8] px-2.5 py-1 text-xs font-medium text-[#1C0B19] hover:bg-[#EFECE4]"
            >
              Undo hold
            </button>
          )}
        </div>
      </div>

      <form onSubmit={saveEdits} className="space-y-3">
        <div>
          <label className="block font-sans text-[11px] font-semibold uppercase tracking-wider text-[#1C0B19]">
            Subject
          </label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="mt-1 w-full rounded-sm border border-[#D8D4C8] px-3 py-2 text-xs text-[#1C0B19] outline-none focus:border-[#2A79A7] focus:ring-1 focus:ring-[#2A79A7]"
          />
        </div>
        <div>
          <label className="block font-sans text-[11px] font-semibold uppercase tracking-wider text-[#1C0B19]">
            Email text
          </label>
          <textarea
            rows={8}
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            className="mt-1 w-full rounded-sm border border-[#D8D4C8] px-3 py-2 font-sans text-xs leading-relaxed text-[#1C0B19] outline-none focus:border-[#2A79A7] focus:ring-1 focus:ring-[#2A79A7]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={status === "saving"}
            className="rounded-sm bg-[#1C0B19] px-3 py-1.5 text-xs font-semibold text-[#FAF9F5] hover:bg-[#2A79A7] disabled:opacity-50"
          >
            {status === "saving" ? "Saving…" : "Save edits"}
          </button>
          {message && (
            <p
              className={`text-xs ${status === "error" ? "text-red-700" : "text-[#2A79A7]"}`}
            >
              {message}
            </p>
          )}
        </div>
      </form>

      {previewHtml && (
        <iframe
          srcDoc={previewHtml}
          title={`Author email ${row.pmid}`}
          className="mt-3 h-[280px] w-full rounded-sm border border-[#D8D4C8] bg-[#F8F6F0]"
          sandbox="allow-same-origin"
        />
      )}
    </article>
  );
}

export default function AuthorOutreachQueue({
  secret,
  lists,
}: {
  secret: string;
  lists: Lists;
}) {
  return (
    <section
      aria-labelledby="author-outreach-heading"
      className="space-y-5 border-t-2 border-[#1C0B19] pt-8"
    >
      <div>
        <p className={`${brief.kicker} mb-1.5`}>Author notices</p>
        <h2
          id="author-outreach-heading"
          className={`${brief.serif} text-2xl font-bold text-[#1C0B19]`}
        >
          Corresponding-author emails
        </h2>
        <p className="mt-1.5 max-w-2xl font-sans text-xs leading-relaxed text-[#72705B]">
          Queued when you rate a paper 5 or higher. Unheld drafts send around
          9:00 PM Eastern. Hold skips until you undo. Never send is permanent.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-sm bg-[#1C0B19]/10 px-2.5 py-1 font-semibold">
          {lists.pending.length} pending tonight
        </span>
        <span className="rounded-sm bg-[#72705B]/15 px-2.5 py-1 font-semibold text-[#72705B]">
          {lists.noEmail.length} no email
        </span>
        <span className="rounded-sm bg-amber-100 px-2.5 py-1 font-semibold text-amber-900">
          {lists.held.length} held
        </span>
      </div>

      <div className="space-y-3">
        <h3 className={`${brief.serif} text-lg font-bold`}>Pending tonight</h3>
        {lists.pending.length === 0 ? (
          <p className="text-xs text-[#72705B]">No author emails waiting to send.</p>
        ) : (
          lists.pending.map((row) => (
            <DraftCard key={row.pmid} row={row} secret={secret} mode="pending" />
          ))
        )}
      </div>

      {lists.noEmail.length > 0 && (
        <div className="space-y-2">
          <h3 className={`${brief.serif} text-lg font-bold`}>No corresponding email</h3>
          <p className="text-xs text-[#72705B]">
            PubMed had no author address. These will not send.
          </p>
          <ul className="space-y-1.5 text-xs">
            {lists.noEmail.map((row) => (
              <li
                key={row.pmid}
                className="rounded-sm border border-[#D8D4C8] bg-white px-3 py-2"
              >
                <span className="font-semibold text-[#1C0B19]">
                  {row.headline || row.title || `PMID ${row.pmid}`}
                </span>
                <span className="ml-2 text-[#72705B]">PMID {row.pmid}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {lists.held.length > 0 && (
        <div className="space-y-3">
          <h3 className={`${brief.serif} text-lg font-bold`}>Held</h3>
          {lists.held.map((row) => (
            <DraftCard key={row.pmid} row={row} secret={secret} mode="held" />
          ))}
        </div>
      )}

      {lists.never.length > 0 && (
        <div className="space-y-2">
          <h3 className={`${brief.serif} text-lg font-bold`}>Never send</h3>
          <ul className="space-y-1.5 text-xs text-[#72705B]">
            {lists.never.map((row) => (
              <li key={row.pmid}>
                {row.headline || row.title || `PMID ${row.pmid}`} (PMID {row.pmid})
              </li>
            ))}
          </ul>
        </div>
      )}

      {lists.sent.length > 0 && (
        <div className="space-y-2">
          <h3 className={`${brief.serif} text-lg font-bold`}>Sent recently</h3>
          <ul className="space-y-1.5 text-xs text-[#72705B]">
            {lists.sent.map((row) => (
              <li key={row.pmid}>
                {row.headline || row.title || `PMID ${row.pmid}`} →{" "}
                {maskEmail(row.corresponding_email)}
                {row.sent_at
                  ? ` · ${new Date(row.sent_at).toLocaleString("en-US", { timeZone: "America/New_York" })} ET`
                  : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
