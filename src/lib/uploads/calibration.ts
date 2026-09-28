import type { QuarterTurns } from "./units";

/**
 * An architect's plan (an image) laid under the sketch, in plan metres.
 *
 * Image pixels (u right, v down) map to the plan (x right/east, z down/south) by:
 *   scale (metres per pixel) about the image centre → turn clockwise by rot × 90° → move to (cx, cz).
 * Until the customer calibrates (two points + the real distance) a guessed scale is used.
 */

export interface ImageSize {
  w: number;
  h: number;
}

export interface PlanCalibration {
  /** Calibrated metres per image pixel (null = not calibrated yet). */
  mpp: number | null;
  /** Guessed metres per pixel, used until calibrated. */
  guess: number;
  /** Plan position (m) of the image centre. */
  cx: number;
  cz: number;
  rot: QuarterTurns;
  /** 0.15 … 1 */
  opacity: number;
  hidden: boolean;
  /** Also lay it on the ground in the 3D sketch (once calibrated). */
  in3d: boolean;
  /** The last calibration (image pixels + metres), so it can be adjusted. */
  ref?: { a: [number, number]; b: [number, number]; m: number };
}

type P2 = readonly [number, number];

export const scaleOf = (c: Pick<PlanCalibration, "mpp" | "guess">) => c.mpp ?? c.guess;

const turn = (x: number, z: number, rot: QuarterTurns): [number, number] => {
  switch (rot) {
    case 1:
      return [-z, x];
    case 2:
      return [-x, -z];
    case 3:
      return [z, -x];
    default:
      return [x, z];
  }
};

export function imageToPlan(p: P2, img: ImageSize, cal: PlanCalibration): [number, number] {
  const s = scaleOf(cal);
  const [x, z] = turn((p[0] - img.w / 2) * s, (p[1] - img.h / 2) * s, cal.rot);
  return [x + cal.cx, z + cal.cz];
}

export function planToImage(p: P2, img: ImageSize, cal: PlanCalibration): [number, number] {
  const s = scaleOf(cal);
  const [x, z] = turn(p[0] - cal.cx, p[1] - cal.cz, ((4 - cal.rot) % 4) as QuarterTurns);
  return [x / s + img.w / 2, z / s + img.h / 2];
}

/** Size of the plan on the ground (m): width along x, depth along z. */
export function planFootprint(img: ImageSize, cal: PlanCalibration): { w: number; d: number } {
  const s = scaleOf(cal);
  return cal.rot % 2 ? { w: img.h * s, d: img.w * s } : { w: img.w * s, d: img.h * s };
}

/** SVG transform that draws an <image width=w height=h> at its plan place inside the plan editor's frame. */
export function svgTransform(img: ImageSize, cal: PlanCalibration, f: { sc: number; ox: number; oz: number }): string {
  const s = scaleOf(cal) * f.sc;
  return `translate(${f.ox + cal.cx * f.sc} ${f.oz + cal.cz * f.sc}) rotate(${cal.rot * 90}) scale(${s}) translate(${-img.w / 2} ${-img.h / 2})`;
}

/** Metres per pixel from two image points and the real distance between them (null if unusable). */
export function metresPerPixel(a: P2, b: P2, metres: number): number | null {
  const px = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!(metres > 0) || !Number.isFinite(metres) || px < 4) return null;
  const mpp = metres / px;
  return mpp > 1e-5 && mpp < 10 ? mpp : null;
}

/**
 * Apply a calibration. The middle of the measured segment stays where it was on the plan,
 * so something already lined up with the sketch doesn't jump away when the scale changes.
 */
export function calibrate(cal: PlanCalibration, img: ImageSize, a: P2, b: P2, metres: number): PlanCalibration | null {
  const mpp = metresPerPixel(a, b, metres);
  if (mpp === null) return null;
  const mid: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const before = imageToPlan(mid, img, cal);
  const next: PlanCalibration = { ...cal, mpp, ref: { a: [a[0], a[1]], b: [b[0], b[1]], m: metres } };
  const after = imageToPlan(mid, img, next);
  return { ...next, cx: round(cal.cx + before[0] - after[0]), cz: round(cal.cz + before[1] - after[1]), in3d: cal.mpp === null ? true : cal.in3d };
}

const round = (v: number) => Math.round(v * 1000) / 1000;

/** "3,2" · "3.2 m" · "320 cm" · "3200 mm" → metres (null if not a sensible distance). */
export function parseMetres(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, "").replace(",", ".");
  const m = s.match(/^(\d+(?:\.\d+)?|\.\d+)(mm|cm|m)?$/);
  if (!m) return null;
  const v = Number.parseFloat(m[1]) * (m[2] === "mm" ? 0.001 : m[2] === "cm" ? 0.01 : 1);
  return v >= 0.05 && v <= 500 ? v : null;
}

/** Until calibrated: make the image about 1.6 × the sketch, so both are visible in the plan editor. */
export function guessScale(img: ImageSize, extentM: number): number {
  const target = Math.max(2, extentM) * 1.6;
  return target / Math.max(1, img.w, img.h);
}

export function defaultCalibration(img: ImageSize, center: P2, extentM: number): PlanCalibration {
  return { mpp: null, guess: guessScale(img, extentM), cx: round(center[0]), cz: round(center[1]), rot: 0, opacity: 0.6, hidden: false, in3d: false };
}

export const rotatePlan = (c: PlanCalibration): PlanCalibration => ({ ...c, rot: ((c.rot + 1) % 4) as QuarterTurns });

/** Accept a stored calibration only if every field makes sense. */
export function sanitizeCalibration(raw: unknown, fallback: PlanCalibration): PlanCalibration {
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const pt = (v: unknown): [number, number] | null =>
    Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number" && Number.isFinite(n)) ? [v[0] as number, v[1] as number] : null;
  const ref = r.ref && typeof r.ref === "object" ? (r.ref as Record<string, unknown>) : null;
  const a = ref && pt(ref.a);
  const b = ref && pt(ref.b);
  return {
    mpp: typeof r.mpp === "number" && r.mpp > 1e-5 && r.mpp < 10 ? r.mpp : null,
    guess: num(r.guess, fallback.guess, 1e-5, 10),
    cx: num(r.cx, fallback.cx, -500, 500),
    cz: num(r.cz, fallback.cz, -500, 500),
    rot: [0, 1, 2, 3].includes(r.rot as number) ? (r.rot as QuarterTurns) : 0,
    opacity: num(r.opacity, fallback.opacity, 0.15, 1),
    hidden: typeof r.hidden === "boolean" ? r.hidden : false,
    in3d: typeof r.in3d === "boolean" ? r.in3d : false,
    ...(a && b && ref && typeof ref.m === "number" ? { ref: { a, b, m: ref.m } } : {}),
  };
}
