"use client";

import { useEffect, useRef, useState } from "react";
import type { BriefItem } from "@/lib/brief/items";
import type { StoryImageMatch } from "@/lib/brief/storyImageTypes";
import { brief } from "@/components/brief/briefTheme";
import {
  composeVisualSummary,
  downloadBlob,
} from "@/components/brief/composeVisualSummary";
import { graphicTakeawayShareText } from "@/lib/brief/shareAttribution";

type Prepared = { blob: Blob; file: File; url: string };

/**
 * The text graphic takeaway, drawn in the reader's browser from the headline, takeaway, methods and findings already
 * on the page. It costs nothing, so it is what a reader gets when the visual abstract is paused, not available for
 * their paper, or when they are not signed in. Same preview, Download and Share as before.
 */
export default function TextGraphicPanel({
  item,
  image,
}: {
  item: BriefItem;
  image?: StoryImageMatch | null;
}) {
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        const blob = await composeVisualSummary({ item, image });
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setPrepared({
          blob,
          file: new File([blob], `stewardship-brief-${item.pmid}.png`, { type: "image/png" }),
          url,
        });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not create the graphic takeaway");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      setPrepared(null);
    };
  }, [item, image]);

  function download() {
    setError(null);
    if (!prepared) {
      setError(busy ? "Still preparing. Try Download again in a moment." : "Image not ready");
      return;
    }
    downloadBlob(prepared.blob, prepared.file.name);
  }

  async function share() {
    setError(null);
    if (!prepared) {
      setError(busy ? "Still preparing. Try Share again in a moment." : "Image not ready");
      return;
    }
    const { file, blob } = prepared;
    try {
      if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
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
      } else {
        downloadBlob(blob, file.name);
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      const msg = e instanceof Error ? e.message : "Could not share";
      if (/user gesture|NotAllowedError/i.test(msg) || (e instanceof DOMException && e.name === "NotAllowedError")) {
        downloadBlob(blob, file.name);
        return;
      }
      setError(msg);
    }
  }

  return (
    <>
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
            className={`flex aspect-video items-center justify-center px-4 ${brief.sans} text-sm ${brief.muted}`}
          >
            {busy ? "Preparing graphic…" : "Preview unavailable"}
          </div>
        )}
      </div>
      {error && (
        <p className={`mt-3 ${brief.sans} text-sm text-[#9B3A3A]`}>{error}</p>
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
    </>
  );
}
