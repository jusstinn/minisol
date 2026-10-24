"use client";

import { useRef, useState } from "react";
import type { Tenant } from "@/config/tenant";
import type { Lang } from "@/domain/types";
import { tr } from "@/lib/i18n";
import { track } from "@/lib/track";
import { IconPhoto, IconWarn } from "../ui/icons";
import type { CaptureFn, ViewMode } from "./Scene";
import { footerText } from "./photoFooter";

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
}: {
  captureRef: React.RefObject<CaptureFn | null>;
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
  title: string;
  measurements: { label: string; value: number; unit: string }[];
  tenant: Tenant;
  lang: Lang;
  dark: boolean;
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
      const blob = await addFooter(dataUrl, footerText({ title, measurements, tenant: tenant.name, lang }), tenant.accent);
      await shareOrDownload(blob, fileName(tenant.id));
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
        className={`grid h-8 w-8 place-items-center rounded-full backdrop-blur transition disabled:opacity-60 ${
          dark ? "bg-[#0a1f47]/70 text-[#dce9ff] ring-1 ring-[#dce9ff]/25 hover:text-white" : "bg-white/70 text-ink-2 ring-1 ring-ink/10"
        }`}
      >
        {busy ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <IconPhoto size={15} />}
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

function fileName(tenantId: string): string {
  return `schita-${tenantId}-${Date.now()}.png`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

/** Composites the branded footer strip under the captured frame. */
async function addFooter(dataUrl: string, footer: { title: string; dims: string; meta: string }, accent: string): Promise<Blob> {
  const img = await loadImage(dataUrl);
  const barH = Math.max(56, Math.round(img.height * 0.09));
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height + barH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(img, 0, 0);
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
