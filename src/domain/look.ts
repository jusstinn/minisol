import { artOf } from "./art";
import type { MaterialRole, Product } from "./types";

/**
 * How the products actually in the basket look in the 3D sketch: colour and the
 * dimensions that change the drawing (board width, tile format, plank size…).
 * Swapping larch boards for grey WPC or 30 × 30 tiles for 60 × 60 re-draws the
 * sketch with the new product — no 3D models needed, everything comes from the
 * catalogue specs.
 */
export interface RoleLook {
  color: string;
  /** Product name, for labels. */
  name: string;
  /** Board / plank / tile width and length (or height) in metres. */
  w?: number;
  l?: number;
  /** Thickness / section height in metres. */
  t?: number;
  /** Height in metres (skirting, boards). */
  h?: number;
}

export type Look = Partial<Record<MaterialRole, RoleLook>>;

const MATERIAL_COLOR: [RegExp, string][] = [
  [/larice/, "#b9774a"],
  [/wpc.*antracit|antracit/, "#3d3f43"],
  [/wpc.*(maro|brown)|co-extrudat maro/, "#6b4a33"],
  [/wpc/, "#8a8c8f"],
  [/pin tratat maro|maro/, "#7b5334"],
  [/pin tratat|pin\b/, "#c7a56d"],
  [/aluminiu/, "#b8bec6"],
  [/hidro/, "#a9ccb0"],
  [/rezistent la foc|antifoc|\bfoc\b/, "#e8b9b9"],
];

const num = (v: unknown) => (typeof v === "number" && v > 0 ? v : undefined);

/** "33x33" / "20 × 120" → [0.33, 0.33] metres. */
export function parseSizeCm(v: unknown): [number, number] | undefined {
  const m = String(v ?? "").match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/);
  if (!m) return undefined;
  return [Number(m[1].replace(",", ".")) / 100, Number(m[2].replace(",", ".")) / 100];
}

export function lookOf(p: Product): RoleLook {
  const text = `${p.name} ${String(p.specs.material ?? "")} ${String(p.specs.decor ?? "")} ${String(p.specs.type ?? "")}`.toLowerCase();
  const color = MATERIAL_COLOR.find(([re]) => re.test(text))?.[1] ?? artOf(p).color;
  const s = p.specs;
  const look: RoleLook = { color, name: p.name };
  const width = num(s.widthMm) ?? num(s.boardWidthMm);
  if (width) look.w = width / 1000;
  const length = num(s.boardLengthMm) ? (s.boardLengthMm as number) / 1000 : num(s.lengthM);
  if (length) look.l = length;
  if (num(s.thicknessMm)) look.t = (s.thicknessMm as number) / 1000;
  const section = parseSizeCm(s.sectionMm);
  if (section) {
    // sectionMm is in mm ("45x70"): parseSizeCm divides by 100, so /10 more.
    look.w = section[0] / 10;
    look.t = section[1] / 10;
  }
  const tile = parseSizeCm(s.sizeCm);
  if (tile) {
    look.w = tile[0];
    look.l = tile[1];
  }
  if (num(s.heightM)) look.l = s.heightM as number;
  if (num(s.heightMm)) look.h = (s.heightMm as number) / 1000;
  return look;
}

/** The look of every job in the basket (first product per role wins). */
export function lookForBasket(items: { sku: string; role?: MaterialRole }[], products: Map<string, Product>): Look {
  const look: Look = {};
  for (const it of items) {
    const p = products.get(it.sku);
    if (!p) continue;
    for (const role of it.role ? [it.role] : p.roles) if (!look[role]) look[role] = lookOf(p);
  }
  return look;
}

/** Lighter/darker variants of a colour for alternating boards, tiles and planks. */
export function shades(hex: string, n = 4, spread = 0.07): string[] {
  const m = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return [hex];
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16));
  return Array.from({ length: n }, (_, i) => {
    const k = 1 + spread * ((i % 2 ? 1 : -1) * (1 + Math.floor(i / 2)) * 0.6);
    const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)))
      .toString(16)
      .padStart(2, "0");
    return `#${c(r)}${c(g)}${c(b)}`;
  });
}
