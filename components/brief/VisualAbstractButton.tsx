"use client";

import { useCallback, useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import type { BriefItem } from "@/lib/brief/items";
import type { StoryImageMatch } from "@/lib/brief/storyImageTypes";
import type { VaStatusResponse } from "@/lib/brief/visualAbstract/types";
import { isNumericPmid } from "@/lib/doi";
import { graphicTakeawayShareText } from "@/lib/brief/shareAttribution";
import { brief } from "@/components/brief/briefTheme";
import { downloadBlob } from "@/components/brief/composeVisualSummary";
import BriefDialog from "@/components/brief/BriefDialog";
import GraphicTakeawayButton from "@/components/brief/GraphicTakeawayButton";
import TextGraphicPanel from "@/components/brief/TextGraphicPanel";

type Props = {
  item: BriefItem;
  image?: StoryImageMatch | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

type View =
  | { kind: "checking" }
  | { kind: "signin" }
  | { kind: "working"; step: "extract" | "draw" }
  | { kind: "ready"; url: string }
  | { kind: "failed"; message: string; retryable: boolean }
  | { kind: "text"; note: string | null };

const POLL_MS = 2500;
/** The service reads an abstract in under two minutes; past this the dialog stops waiting and offers a retry. */
const GIVE_UP_MS = 6 * 60 * 1000;

export const VISUAL_ABSTRACT_LABEL = "Visual abstract (beta)";

const NETWORK_MESSAGE = "We could not reach the server. Check your connection and try again.";

const NETWORK_FAILURE: VaStatusResponse = {
  status: "failed",
  code: "SERVICE_DOWN",
  message: NETWORK_MESSAGE,
  retryable: true,
};

const TOO_SLOW: VaStatusResponse = {
  status: "failed",
  code: "TIMEOUT",
  message: "That took too long. Please try again.",
  retryable: true,
};

async function ask(pmid: string, method: "POST" | "GET"): Promise<VaStatusResponse> {
  try {
    const response = await fetch(
      method === "GET"
        ? `/api/brief/visual-abstract?pmid=${encodeURIComponent(pmid)}`
        : "/api/brief/visual-abstract",
      {
        method,
        headers: method === "POST" ? { "content-type": "application/json" } : undefined,
        body: method === "POST" ? JSON.stringify({ pmid }) : undefined,
        cache: "no-store",
        credentials: "same-origin",
      }
    );
    const body = (await response.json()) as VaStatusResponse;
    if (body && typeof body.status === "string") return body;
  } catch {
    /* offline, or not JSON */
  }
  return NETWORK_FAILURE;
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** Where someone lands after signing in: this paper's page with the dialog open. */
function afterSignInUrl(pmid: string): string {
  return typeof window === "undefined"
    ? `/article/${pmid}?takeaway=1`
    : `${window.location.origin}/article/${encodeURIComponent(pmid)}?takeaway=1`;
}

/**
 * Pink "Visual abstract (beta)" button to the right of Share. A click (by a signed-in reader) asks for a picture of the
 * paper's findings, made from its abstract; nothing is made before a click. It takes about 30 seconds the first time
 * and is instant after that. If it cannot be made, or the reader is not signed in, the text graphic takeaway is one
 * button away. Papers without a PubMed ID get the text graphic only.
 */
export default function VisualAbstractButton(props: Props) {
  if (!isNumericPmid(props.item.pmid)) return <GraphicTakeawayButton {...props} />;
  return <VisualAbstract {...props} />;
}

function VisualAbstract({ item, image, open: openProp, onOpenChange }: Props) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : uncontrolledOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange]
  );

  const { status } = useSession();
  const signedIn = status === "authenticated";
  const [stored, setView] = useState<View>({ kind: "working", step: "extract" });
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ url: string; blob: Blob } | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);

  // What the sign-in state decides is derived, not stored: it follows the session the moment it changes.
  const view: View = !open
    ? stored
    : status === "loading"
      ? { kind: "checking" }
      : !signedIn
        ? { kind: "signin" }
        : stored;

  const pmid = item.pmid;

  // One run per open (and per "Try again"): ask once, then check every few seconds until it is ready or has failed.
  useEffect(() => {
    if (!open || !signedIn) return;
    let cancelled = false;
    void (async () => {
      const startedAt = Date.now();
      setView({ kind: "working", step: "extract" });
      let result = await ask(pmid, "POST");
      while (!cancelled && result.status === "working") {
        setView({ kind: "working", step: result.step });
        if (Date.now() - startedAt > GIVE_UP_MS) {
          result = TOO_SLOW;
          break;
        }
        await sleep(POLL_MS);
        if (cancelled) return;
        result = await ask(pmid, "GET");
      }
      if (cancelled) return;
      switch (result.status) {
        case "ready":
          setView({ kind: "ready", url: result.url });
          break;
        case "failed":
          setView({ kind: "failed", message: result.message, retryable: result.retryable });
          break;
        case "signin":
          setView({ kind: "signin" });
          break;
        case "disabled":
          setView({ kind: "text", note: result.message });
          break;
        default:
          setView({ kind: "failed", message: NETWORK_MESSAGE, retryable: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, signedIn, pmid, attempt]);

  // Keep the picture's bytes ready for Download and Share (Share needs the file the moment it is tapped).
  const readyUrl = view.kind === "ready" ? view.url : null;
  const blob = readyUrl && loaded?.url === readyUrl ? loaded.blob : null;
  useEffect(() => {
    if (!readyUrl) return;
    let cancelled = false;
    fetch(readyUrl)
      .then((response) => (response.ok ? response.blob() : Promise.reject(new Error("not ok"))))
      .then((bytes) => {
        if (!cancelled) setLoaded({ url: readyUrl, blob: bytes });
      })
      .catch(() => {
        /* Download opens the picture in a tab, and Share shares the link */
      });
    return () => {
      cancelled = true;
    };
  }, [readyUrl]);

  const close = useCallback(() => setOpen(false), [setOpen]);
  const fileName = `stewardship-brief-visual-abstract-${pmid}.png`;
  const shareText = graphicTakeawayShareText({
    headline: item.headline,
    bottomLine: item.bottomLine,
    pubmedUrl: item.pubmedUrl,
  });

  function download() {
    setShareError(null);
    if (blob) downloadBlob(blob, fileName);
    else if (readyUrl) window.open(readyUrl, "_blank", "noopener,noreferrer");
  }

  async function share() {
    setShareError(null);
    try {
      if (blob) {
        const file = new File([blob], fileName, { type: "image/png" });
        if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: item.headline, text: shareText, url: item.pubmedUrl });
          return;
        }
      }
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: item.headline, text: shareText, url: item.pubmedUrl });
        return;
      }
      download();
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (e instanceof DOMException && e.name === "NotAllowedError") {
        download();
        return;
      }
      setShareError("Could not share. Try Download instead.");
    }
  }

  const useTextGraphic = (
    <button
      type="button"
      onClick={() => setView({ kind: "text", note: null })}
      className={`${brief.sans} rounded-sm border border-[#1C0B19] bg-transparent px-4 py-2 text-[0.8125rem] font-medium tracking-wide text-[#1C0B19] transition-colors hover:bg-[#EFECE4]`}
    >
      Use the text graphic instead
    </button>
  );

  const intro =
    view.kind === "text"
      ? "Preview, then download or share."
      : "Made automatically from the abstract. Check the paper for accuracy before use.";

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        className={`${brief.sans} rounded-sm border border-[#FFA69E]/25 bg-[#FFA69E]/12 px-2 py-0.5 text-[0.7rem] font-medium tracking-wide text-[#1C0B19] transition-colors hover:bg-[#FFA69E]/20`}
        onClick={() => setOpen(true)}
      >
        {VISUAL_ABSTRACT_LABEL}
      </button>

      <BriefDialog
        open={open}
        onClose={close}
        title={view.kind === "text" ? "Graphic takeaway" : VISUAL_ABSTRACT_LABEL}
        intro={intro}
      >
        {view.kind === "checking" && (
          <Placeholder>Checking your sign-in…</Placeholder>
        )}

        {view.kind === "signin" && (
          <div className="mt-4 rounded-sm border border-[#D8D4C8] bg-[#EFECE4] p-4 sm:p-6">
            <p className={`${brief.serif} text-lg font-semibold ${brief.ink}`}>
              Sign in to make a visual abstract
            </p>
            <p className={`mt-2 ${brief.sans} text-sm leading-relaxed ${brief.muted}`}>
              It is free. A visual abstract turns a paper&apos;s main results into one picture you can
              download or share. This feature is in beta.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void signIn("google", { callbackUrl: afterSignInUrl(pmid) })}
                className="rounded-sm bg-[#2A79A7] px-4 py-2 text-[0.8125rem] font-semibold text-white transition-colors hover:bg-[#236389]"
              >
                Sign in with Google
              </button>
              <a
                href="/settings?tab=saved"
                className={`${brief.sans} text-[0.8125rem] font-medium text-[#2A79A7] hover:underline`}
              >
                or sign in with email and password
              </a>
            </div>
            <div className="mt-5 border-t border-[#D8D4C8] pt-4">{useTextGraphic}</div>
          </div>
        )}

        {view.kind === "working" && (
          <Placeholder>
            <WorkProgress step={view.step} />
            <span className="mt-3 block">
              This takes about 30 seconds the first time. Feel free to close this window and come back!
            </span>
          </Placeholder>
        )}

        {view.kind === "ready" && (
          <>
            <div className="mt-4 overflow-hidden rounded-sm border border-[#D8D4C8] bg-[#EFECE4]">
              {/* eslint-disable-next-line @next/next/no-img-element -- public storage URL, fixed size */}
              <img
                src={view.url}
                alt={`Visual abstract (beta) for ${item.headline}`}
                className="h-auto w-full"
                width={1600}
                height={900}
                onError={() =>
                  setView({
                    kind: "failed",
                    message: "The picture could not be loaded. Please try again in a moment.",
                    retryable: true,
                  })
                }
              />
            </div>
            {shareError && (
              <p className={`mt-3 ${brief.sans} text-sm text-[#9B3A3A]`}>{shareError}</p>
            )}
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={download}
                className={`${brief.sans} rounded-sm border border-[#FFA69E]/25 bg-[#FFA69E]/12 px-3 py-1.5 text-[0.8125rem] font-medium tracking-wide text-[#1C0B19] transition-colors hover:bg-[#FFA69E]/20`}
              >
                Download
              </button>
              <button
                type="button"
                onClick={() => void share()}
                className={`${brief.sans} rounded-sm border border-[#1C0B19] bg-transparent px-4 py-2 text-[0.8125rem] font-medium tracking-wide text-[#1C0B19] transition-colors hover:bg-[#EFECE4]`}
              >
                Share
              </button>
            </div>
          </>
        )}

        {view.kind === "failed" && (
          <div className="mt-4 rounded-sm border border-[#D8D4C8] bg-[#EFECE4] p-4 sm:p-6">
            <p role="alert" className={`${brief.sans} text-sm leading-relaxed text-[#1C0B19]`}>
              {view.message}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              {view.retryable && (
                <button
                  type="button"
                  onClick={() => setAttempt((n) => n + 1)}
                  className={`${brief.sans} rounded-sm border border-[#FFA69E]/25 bg-[#FFA69E]/12 px-3 py-1.5 text-[0.8125rem] font-medium tracking-wide text-[#1C0B19] transition-colors hover:bg-[#FFA69E]/20`}
                >
                  Try again
                </button>
              )}
              {useTextGraphic}
            </div>
          </div>
        )}

        {view.kind === "text" && (
          <>
            {view.note && (
              <p className={`mt-3 ${brief.sans} text-sm ${brief.muted}`}>{view.note}</p>
            )}
            <TextGraphicPanel item={item} image={image} />
            {signedIn && (
              <button
                type="button"
                onClick={() => setAttempt((n) => n + 1)}
                className={`${brief.action} mt-4`}
              >
                Try the visual abstract (beta) instead
              </button>
            )}
          </>
        )}
      </BriefDialog>
    </>
  );
}

function WorkProgress({ step }: { step: "extract" | "draw" }) {
  const [pct, setPct] = useState(step === "draw" ? 62 : 8);
  useEffect(() => {
    const floor = step === "extract" ? 8 : 62;
    const cap = step === "extract" ? 58 : 92;
    setPct((current) => Math.max(current, floor));
    const timer = window.setInterval(() => {
      setPct((current) => {
        if (current >= cap) return current;
        return Math.min(cap, current + Math.max(0.6, (cap - current) * 0.045));
      });
    }, 450);
    return () => window.clearInterval(timer);
  }, [step]);
  const shown = Math.round(pct);
  const label = step === "extract" ? "Reading the abstract…" : "Drawing the picture…";
  return (
    <div className="w-full max-w-sm">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="font-medium text-[#1C0B19]">{label}</span>
        <span className="tabular-nums text-[#1C0B19]">{shown}%</span>
      </div>
      <div
        className="h-1 overflow-hidden rounded-full bg-[#D8D4C8]"
        role="progressbar"
        aria-valuenow={shown}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="brief-va-bar-fill h-full rounded-full bg-[#2A79A7]"
          style={{ width: `${shown}%`, transition: "width 0.45s ease" }}
        />
      </div>
    </div>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`mt-4 flex aspect-video flex-col items-center justify-center rounded-sm border border-[#D8D4C8] bg-[#EFECE4] px-6 text-center ${brief.sans} text-sm ${brief.muted}`}
    >
      <div className="w-full">{children}</div>
    </div>
  );
}
