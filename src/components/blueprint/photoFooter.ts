import type { Lang } from "@/domain/types";

/**
 * Text for the branded footer strip baked into a "Randare foto" export (see PhotoRender.tsx):
 * the project title, its main dimensions, the retailer, the date and the same "indicative
 * sketch" notice the sketch itself always shows — never a price (see usage.ts's privacy note:
 * nothing here is personal either, it's the same facts already on screen).
 */

export interface FooterMeasurement {
  label: string;
  value: number;
  unit: string;
}

export interface FooterOptions {
  title: string;
  /** `ProjectSnapshot.measurements` — the first couple make the "4 m × 3 m" line. */
  measurements: FooterMeasurement[];
  tenant: string;
  lang: Lang;
  date?: Date;
  /** The sketch's own plan dimensions ("4 m × 3 m"), when it has them. */
  size?: string;
}

export interface FooterText {
  title: string;
  /** "4 m × 3 m" (empty when there's nothing to show). */
  dims: string;
  /** "HORNBACH  ·  24 oct. 2026  ·  Schiță orientativă". */
  meta: string;
}

const UNIT_EN: Record<string, string> = { buc: "pcs", rânduri: "rows" };
const unitText = (u: string, lang: Lang) => (lang === "en" ? UNIT_EN[u] ?? u : u);
const isWholeUnit = (u: string) => u === "buc" || u === "rânduri";

function formatNumber(n: number, lang: Lang, digits: number): string {
  return new Intl.NumberFormat(lang === "en" ? "en-GB" : "ro-RO", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

/** Pure — no DOM, no canvas (those live in PhotoRender.tsx), so it's unit-tested directly. */
export function footerText(opts: FooterOptions): FooterText {
  const { title, measurements, tenant, lang } = opts;
  const date = opts.date ?? new Date();
  // Measurements are different quantities (area, rows, joists): each keeps its label — never "12 m² × 20 rows".
  const facts = measurements
    .slice(0, opts.size ? 1 : 2)
    .map((m) => `${m.label} ${formatNumber(m.value, lang, isWholeUnit(m.unit) ? 0 : 2)} ${unitText(m.unit, lang)}`);
  const dims = [opts.size, ...facts].filter(Boolean).join("  ·  ");
  const dateText = date.toLocaleDateString(lang === "en" ? "en-GB" : "ro-RO", { day: "numeric", month: "short", year: "numeric" });
  const note = lang === "en" ? "Indicative sketch" : "Schiță orientativă";
  const meta = [tenant, dateText, note].filter(Boolean).join("  ·  ");
  return { title, dims, meta };
}

/**
 * The part of a captured frame that has something in it: the bounding box of the pixels with
 * any opacity (the canvas is transparent where there's no model, shadow or dimension line), grown
 * by a margin and widened to at least `minAspect` (w / h) so a tall fence or a narrow path still
 * makes a pleasant picture. Scans every `step`-th pixel — a 3000 px frame needs no more.
 */
export function contentCrop(
  alpha: (x: number, y: number) => number,
  width: number,
  height: number,
  opts: { margin?: number; minAspect?: number; maxAspect?: number; step?: number } = {},
): { x: number; y: number; w: number; h: number } {
  const { margin = 0.08, minAspect = 4 / 3, maxAspect = 16 / 9, step = 4 } = opts;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (alpha(x, y) > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, w: width, h: height };
  let w = maxX - minX + step;
  let h = maxY - minY + step;
  const m = Math.round(Math.max(w, h) * margin);
  w += 2 * m;
  h += 2 * m;
  // Keep a photo-like shape: never thinner than minAspect, never wider than maxAspect.
  if (w / h < minAspect) w = h * minAspect;
  if (w / h > maxAspect) h = w / maxAspect;
  w = Math.min(width, Math.round(w));
  h = Math.min(height, Math.round(h));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const x = Math.round(Math.min(Math.max(0, cx - w / 2), width - w));
  const y = Math.round(Math.min(Math.max(0, cy - h / 2), height - h));
  return { x, y, w, h };
}

/** "terasa-din-deck-hornbach-2026-10-24.png" */
export function photoFileName(title: string, tenantId: string, date = new Date()): string {
  const slug = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return `${[slug || "schita", tenantId, day].join("-")}.png`;
}
