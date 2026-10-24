"use client";

import { useRef, useState } from "react";
import type { Tenant } from "@/config/tenant";
import type { Lang } from "@/domain/types";
import { tr } from "@/lib/i18n";
import { track } from "@/lib/track";
import { IconPhoto, IconWarn } from "../ui/icons";
import type { CaptureFn, ViewMode } from "./Scene";
import { contentCrop, footerText, photoFileName } from "./photoFooter";

/**
 * "Randare foto": a high-resolution PNG of the current sketch's REAL view, with a branded
 * footer strip baked in (title, main dimensions, retailer, date, "Schiță orientativă" — never a
 * price). Switches to REAL for the capture if the customer isn't already looking at it, then
 * switches back. Shares via the Web Share API on phones that support sharing a file, downloads
 * everywhere else.
 */
export default function PhotoRenderButton({
  captureRef,
  mode,
  setMode,
  title,
  measurements,
  tenant,
  lang,
  dark,
  inline,
  backdrop,
  size,
}: {
  captureRef: React.RefObject<CaptureFn | null>;
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
  title: string;
  measurements: { label: string; value: number; unit: string }[];
  tenant: Tenant;
  lang: Lang;
  dark: boolean;
  /** Phone tab layout: the label is screen-reader only, like the other toolbar buttons. */
  inline?: boolean;
  /** The sky behind the model (the sun simulation's tint); the usual warm paper otherwise. */
  backdrop?: string;
  /** The sketch's plan dimensions ("4 m × 3 m"). */
  size?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    const original = mode;
    try {
      if (mode !== "real") {
        setMode("real");
        // Let React commit the mode switch and the live Canvas render at least one frame with
        // the new (textured) materials before we read pixels back from it.
        await new Promise((r) => requestAnimationFrame(r));
        await new Promise((r) => requestAnimationFrame(r));
      }
      const capture = captureRef.current;
      const dataUrl = capture?.();
      if (mode !== original) setMode(original);
      if (!dataUrl) throw new Error("capture unavailable");
      const blob = await composePhoto(dataUrl, footerText({ title, measurements, tenant: tenant.name, lang, size }), tenant.accent, backdrop);
      await shareOrDownload(blob, photoFileName(title, tenant.id));
      track("render_exported");
    } catch {
      if (mode !== original) setMode(original);
      setError(true);
      if (errorTimer.current) clearTimeout(errorTimer.current);
      errorTimer.current = setTimeout(() => setError(false), 4500);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative">
      <button
        title={tr("photoRender", lang)}
        aria-label={busy ? tr("photoRendering", lang) : tr("photoRender", lang)}
        aria-busy={busy}
        disabled={busy}
        onClick={() => void run()}
        className={`flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-full px-2 font-mono sm:px-3 text-[10.5px] uppercase tracking-wider backdrop-blur transition disabled:opacity-60 ${
          dark ? "bg-[#0a1f47]/70 text-[#dce9ff] ring-1 ring-[#dce9ff]/25 hover:text-white" : "bg-white/70 text-ink-2 ring-1 ring-ink/10"
        }`}
      >
        {busy ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <IconPhoto size={15} />}
        <span className={inline ? "sr-only" : "hidden @6xl:inline"}>{tr("photoRender", lang)}</span>
      </button>
      {error && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-20 flex w-[min(60vw,220px)] items-start gap-1.5 rounded-lg bg-[#b3261e] px-2.5 py-2 text-[11px] leading-snug text-white shadow-lg">
          <IconWarn size={13} />
          <span>{tr("photoRenderFailed", lang)}</span>
        </div>
      )}
    </div>
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

/**
 * The photo: the captured frame cropped to the model (the live view leaves room for the
 * toolbar and cards), on an opaque backdrop — the canvas itself is transparent, which most
 * photo apps show as black — with the branded footer strip under it.
 */
async function composePhoto(dataUrl: string, footer: { title: string; dims: string; meta: string }, accent: string, backdrop?: string): Promise<Blob> {
  const src = await loadImage(dataUrl);
  const probe = document.createElement("canvas");
  probe.width = src.width;
  probe.height = src.height;
  const pctx = probe.getContext("2d", { willReadFrequently: true });
  if (!pctx) throw new Error("no 2d context");
  pctx.drawImage(src, 0, 0);
  const data = pctx.getImageData(0, 0, src.width, src.height).data;
  const crop = contentCrop((x, y) => data[(y * src.width + x) * 4 + 3], src.width, src.height);

  const img = { width: crop.w, height: crop.h };
  const barH = Math.max(56, Math.round(img.height * 0.09));
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height + barH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  if (backdrop) ctx.fillStyle = backdrop;
  else {
    // The REAL view's paper: radial-gradient(120% 100% at 30% 0%, #fbf8f1, #e7e1d3).
    const g = ctx.createRadialGradient(img.width * 0.3, 0, 0, img.width * 0.3, 0, Math.max(img.width, img.height) * 1.1);
    g.addColorStop(0, "#fbf8f1");
    g.addColorStop(1, "#e7e1d3");
    ctx.fillStyle = g;
  }
  ctx.fillRect(0, 0, img.width, img.height);
  ctx.drawImage(src, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
  ctx.fillStyle = "#141311";
  ctx.fillRect(0, img.height, canvas.width, barH);
  ctx.fillStyle = accent;
  ctx.fillRect(0, img.height, canvas.width, Math.max(2, Math.round(barH * 0.045)));
  const pad = Math.round(img.width * 0.018);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.font = `600 ${Math.round(barH * 0.32)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText(footer.title, pad, img.height + barH * 0.46, canvas.width - pad * 2);
  ctx.fillStyle = "#c9c2b2";
  ctx.font = `${Math.round(barH * 0.22)}px ui-monospace, "SF Mono", Menlo, monospace`;
  const line2 = [footer.dims, footer.meta].filter(Boolean).join("   ·   ");
  ctx.fillText(line2, pad, img.height + barH * 0.78, canvas.width - pad * 2);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? new Blob()), "image/png"));
}

async function shareOrDownload(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (data?: { files?: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch {
      // Cancelled or unsupported mid-flight — fall back to a download below.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
