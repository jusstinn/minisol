"use client";

import type { Checked, PlanFormat } from "./files";
import type { ImageSize } from "./calibration";

/**
 * Plan images in the browser: decode (proves it really is a picture), cap the size for
 * storage, and make the two derived versions we need — a light-blue "blueprint" rendering
 * for the dark views, and the downscaled JPEG the optional AI read sends (once, on request).
 */

/** Longest side we keep on the device (bigger scans are downscaled once, on upload). */
const MAX_SIDE = 4096;

export interface PreparedPlan {
  blob: Blob;
  img: ImageSize;
  source: "image" | "pdf";
}

const unreadable = { ro: "Imaginea nu poate fi citită. Încearcă un PNG sau JPG.", en: "The image can't be read. Please try a PNG or JPG." };

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

const toBlob = (c: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob | null>((resolve) => {
    try {
      c.toBlob(resolve, type, quality);
    } catch {
      resolve(null);
    }
  });

export async function decodeImage(blob: Blob): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

/** Downscale so the longest side is ≤ max (white background, so transparent PNGs stay readable). */
function draw(src: CanvasImageSource, w: number, h: number, max: number, white = true): HTMLCanvasElement {
  const k = Math.min(1, max / Math.max(w, h));
  const c = canvas(w * k, h * k);
  const ctx = c.getContext("2d")!;
  if (white) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

export async function preparePlan(file: Blob, format: PlanFormat): Promise<Checked<PreparedPlan>> {
  if (format === "pdf") {
    const { renderPdfFirstPage } = await import("./pdf");
    return renderPdfFirstPage(file, MAX_SIDE);
  }
  const bmp = await decodeImage(file);
  if (!bmp) return { ok: false, error: unreadable };
  const { width: w, height: h } = bmp;
  try {
    if (w < 32 || h < 32) return { ok: false, error: { ro: "Imaginea e prea mică pentru un plan.", en: "The image is too small to be a plan." } };
    if (Math.max(w, h) <= MAX_SIDE) return { ok: true, value: { blob: file, img: { w, h }, source: "image" } };
    const c = draw(bmp, w, h, MAX_SIDE);
    const out = await toBlob(c, "image/jpeg", 0.9);
    if (!out) return { ok: false, error: unreadable };
    return { ok: true, value: { blob: out, img: { w: c.width, h: c.height }, source: "image" } };
  } finally {
    bmp.close();
  }
}

/**
 * The plan as a JPEG data URL of at most ~1.4 MB for the optional AI read (2048 px, then
 * smaller / lower quality until it fits).
 */
export async function aiJpeg(blob: Blob): Promise<string | null> {
  const bmp = await decodeImage(blob);
  if (!bmp) return null;
  try {
    for (const [side, q] of [
      [2048, 0.85],
      [1600, 0.8],
      [1280, 0.72],
      [1024, 0.65],
    ] as const) {
      const out = await toBlob(draw(bmp, bmp.width, bmp.height, side), "image/jpeg", q);
      if (out && out.size <= 1.4 * 1024 * 1024) {
        return await new Promise<string | null>((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(typeof r.result === "string" ? r.result : null);
          r.onerror = () => resolve(null);
          r.readAsDataURL(out);
        });
      }
    }
    return null;
  } finally {
    bmp.close();
  }
}

/**
 * Two canvases for the 3D ground: the plan as drawn (real view) and a "blueprint" version
 * where dark lines become light blue and the paper becomes transparent (dark views).
 */
export async function groundCanvases(blob: Blob, max = 2048): Promise<{ real: HTMLCanvasElement; blue: HTMLCanvasElement } | null> {
  const bmp = await decodeImage(blob);
  if (!bmp) return null;
  try {
    const real = draw(bmp, bmp.width, bmp.height, max);
    const blue = canvas(real.width, real.height);
    const src = real.getContext("2d")!.getImageData(0, 0, real.width, real.height);
    const d = src.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      const a = Math.max(0, Math.min(1, (1 - lum) * 2));
      d[i] = 220;
      d[i + 1] = 233;
      d[i + 2] = 255;
      d[i + 3] = Math.round(a * 255);
    }
    blue.getContext("2d")!.putImageData(src, 0, 0);
    return { real, blue };
  } finally {
    bmp.close();
  }
}
