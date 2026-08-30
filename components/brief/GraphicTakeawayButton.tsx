"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BriefItem } from "@/lib/brief/items";
import type { StoryImageMatch } from "@/lib/brief/storyImageTypes";
import { brief } from "@/components/brief/briefTheme";
import {
  composeVisualSummary,
  downloadBlob,
} from "@/components/brief/composeVisualSummary";
import { graphicTakeawayShareText } from "@/lib/brief/shareAttribution";

type Props = {
  item: BriefItem;
  image?: StoryImageMatch | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

type Prepared = {
  blob: Blob;
  file: File;
  url: string;
};

/**
 * Pink CTA to the right of Share — opens a popup with the graphic takeaway
 * preview, then Download or Share.
 * Portal to document.body so article photo stacking / CSS transforms cannot
 * cover the dialog on mobile scroll.
 */
export default function GraphicTakeawayButton({
  item,
  image,
  open: openProp,
  onOpenChange,
}: Props) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : uncontrolledOpen;
  function setOpen(next: boolean) {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
  const prepareGen = useRef(0);
  const preparedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const gen = ++prepareGen.current;
    let cancelled = false;
    setBusy(true);
    setError(null);
    if (preparedUrlRef.current) {
      URL.revokeObjectURL(preparedUrlRef.current);
      preparedUrlRef.current = null;
    }
    setPrepared(null);
    void (async () => {
      try {
        const blob = await composeVisualSummary({ item, image });
        if (cancelled || gen !== prepareGen.current) return;
        const filename = `stewardship-brief-${item.pmid}.png`;
        const url = URL.createObjectURL(blob);
        preparedUrlRef.current = url;
        setPrepared({
          blob,
          file: new File([blob], filename, { type: "image/png" }),
          url,
        });
      } catch (e) {
        if (cancelled || gen !== prepareGen.current) return;
        setError(
          e instanceof Error ? e.message : "Could not create graphic takeaway"
        );
      } finally {
        if (!cancelled && gen === prepareGen.current) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, item, image]);

  useEffect(() => {
    return () => {
      if (preparedUrlRef.current) {
        URL.revokeObjectURL(preparedUrlRef.current);
        preparedUrlRef.current = null;
      }
    };
  }, []);

  function close() {
    setOpen(false);
    setError(null);
  }

  function download() {
    setError(null);
    if (!prepared) {
      setError(
        busy
          ? "Still preparing — try Download again in a moment"
          : "Image not ready"
      );
      return;
    }
    downloadBlob(prepared.blob, prepared.file.name);
  }

  async function share() {
    setError(null);
    if (!prepared) {
      setError(
        busy
          ? "Still preparing — try Share again in a moment"
          : "Image not ready"
      );
      return;
    }
    const { file, blob } = prepared;
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.canShare?.({ files: [file] })
      ) {
        await navigator.share({
          files: [file],
          title: item.headline,
          text: graphicTakeawayShareText({
            headline: item.headline,
            bottomLine: item.bottomLine,
            pubmedUrl: item.pubmedUrl,
          }),
          url: item.pubmedUrl,
        });
        close();
      } else {
        downloadBlob(blob, file.name);
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      const msg = e instanceof Error ? e.message : "Could not share";
      if (
        /user gesture|NotAllowedError/i.test(msg) ||
        (e instanceof DOMException && e.name === "NotAllowedError")
      ) {
        downloadBlob(blob, file.name);
        close();
        return;
      }
      setError(msg);
    }
  }

  const dialog =
    open && mounted
      ? createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <button
              type="button"
              aria-label="Close"
              className="absolute inset-0 bg-[#1C0B19]/45"
              onClick={close}
            />
            <div className="relative z-[201] w-full max-w-lg max-h-[min(90vh,720px)] overflow-y-auto rounded-sm border border-[#D8D4C8] bg-[#F6F4EF] p-5 shadow-[0_16px_40px_rgba(28,11,25,0.2)] sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <h2
                  id={titleId}
                  className={`${brief.serif} text-xl font-semibold tracking-tight ${brief.ink}`}
                >
                  Graphic takeaway
                </h2>
                <button
                  type="button"
                  onClick={close}
                  className={`${brief.action} shrink-0`}
                >
                  Close
                </button>
              </div>
              <p
                className={`mt-2 ${brief.sans} text-sm leading-relaxed ${brief.muted}`}
              >
                Preview, then download or share.
              </p>

              <div className="mt-4 overflow-hidden rounded-sm border border-[#D8D4C8] bg-[#EFECE4]">
                {prepared ? (
                  // eslint-disable-next-line @next/next/no-img-element -- blob preview URL
                  <img
                    src={prepared.url}
                    alt={`Graphic takeaway for ${item.headline}`}
                    className="h-auto w-full"
                  />
                ) : (
                  <div
                    className={`flex aspect-[4/5] items-center justify-center px-4 ${brief.sans} text-sm ${brief.muted}`}
                  >
                    {busy ? "Preparing graphic…" : "Preview unavailable"}
                  </div>
                )}
              </div>

              {error && (
                <p className={`mt-3 ${brief.sans} text-sm text-[#9B3A3A]`}>
                  {error}
                </p>
              )}

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={download}
                  disabled={busy && !prepared}
                  className={`${brief.sans} rounded-sm border border-[#FFA69E]/25 bg-[#FFA69E]/12 px-3 py-1.5 text-[0.8125rem] font-medium tracking-wide text-[#1C0B19] transition-colors hover:bg-[#FFA69E]/20 disabled:opacity-50`}
                >
                  Download
                </button>
                <button
                  type="button"
                  onClick={() => void share()}
                  disabled={busy && !prepared}
                  className={`${brief.sans} rounded-sm border border-[#1C0B19] bg-transparent px-4 py-2 text-[0.8125rem] font-medium tracking-wide text-[#1C0B19] transition-colors hover:bg-[#EFECE4] disabled:opacity-50`}
                >
                  Share
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        type="button"
        className={`${brief.sans} rounded-sm border border-[#FFA69E]/25 bg-[#FFA69E]/12 px-2 py-0.5 text-[0.7rem] font-medium tracking-wide text-[#1C0B19] transition-colors hover:bg-[#FFA69E]/20`}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Graphic takeaway
      </button>
      {dialog}
    </>
  );
}
