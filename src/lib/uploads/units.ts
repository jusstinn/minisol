/**
 * Placing the customer's own 3D model next to the sketch (pure maths, no three.js).
 *
 * The model is normalised so the middle of its footprint sits on (x, z) and its lowest
 * point on y; units are guessed from the bounding box (a 12 000-unit wide house is in
 * millimetres) and can be overridden. Positions are plan metres — the same coordinates
 * the plan editor and the sketch use.
 */

export type Unit = "m" | "cm" | "mm";
export const UNITS: Unit[] = ["m", "cm", "mm"];
export const UNIT_SCALE: Record<Unit, number> = { m: 1, cm: 0.01, mm: 0.001 };

/** Quarter turns, clockwise as seen from above (like the plan). */
export type QuarterTurns = 0 | 1 | 2 | 3;

/**
 * Guess the unit from the model's largest dimension (in file units):
 * more than 200 → millimetres, more than 20 → centimetres, otherwise metres.
 */
export function detectUnit(size: readonly number[]): Unit {
  const max = Math.max(0, ...size.map((v) => (Number.isFinite(v) ? Math.abs(v) : 0)));
  if (max > 200) return "mm";
  if (max > 20) return "cm";
  return "m";
}

export interface ModelPlacement {
  unit: Unit;
  /** The unit was guessed (the UI says "auto"). */
  unitAuto: boolean;
  rot: QuarterTurns;
  /** Plan metres of the footprint centre / the lowest point. */
  x: number;
  y: number;
  z: number;
  /** 0.1 … 1 */
  opacity: number;
  hidden: boolean;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const LIMIT = 500; // metres from the sketch — further is certainly a mistake

export function defaultPlacement(size: readonly number[], at: readonly [number, number] = [0, 0]): ModelPlacement {
  return { unit: detectUnit(size), unitAuto: true, rot: 0, x: r3(at[0]), y: 0, z: r3(at[1]), opacity: 1, hidden: false };
}

export const nudge = (p: ModelPlacement, dx: number, dz: number, dy = 0): ModelPlacement => ({
  ...p,
  x: r3(clamp(p.x + dx, -LIMIT, LIMIT)),
  z: r3(clamp(p.z + dz, -LIMIT, LIMIT)),
  y: r3(clamp(p.y + dy, -50, 50)),
});
export const rotateQuarter = (p: ModelPlacement, dir: 1 | -1 = 1): ModelPlacement => ({ ...p, rot: (((p.rot + dir) % 4) + 4) % 4 as QuarterTurns });
export const ground = (p: ModelPlacement): ModelPlacement => ({ ...p, y: 0 });
export const setUnit = (p: ModelPlacement, unit: Unit): ModelPlacement => ({ ...p, unit, unitAuto: false });

/** Size in metres of the model's bounding box (width x, height y, depth z) once scaled and turned. */
export function placedSize(size: readonly number[], p: Pick<ModelPlacement, "unit" | "rot">): [number, number, number] {
  const s = UNIT_SCALE[p.unit];
  const [w, h, d] = [size[0] * s, size[1] * s, size[2] * s];
  return p.rot % 2 ? [d, h, w] : [w, h, d];
}

/** Rotation about the vertical axis (radians) for three.js: clockwise from above is negative. */
export const yaw = (rot: QuarterTurns) => (-rot * Math.PI) / 2;

/** Accept a stored placement only if every field makes sense (IndexedDB data is not trusted blindly). */
export function sanitizePlacement(raw: unknown, fallback: ModelPlacement): ModelPlacement {
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? clamp(v, lo, hi) : d);
  return {
    unit: UNITS.includes(r.unit as Unit) ? (r.unit as Unit) : fallback.unit,
    unitAuto: typeof r.unitAuto === "boolean" ? r.unitAuto : fallback.unitAuto,
    rot: [0, 1, 2, 3].includes(r.rot as number) ? (r.rot as QuarterTurns) : fallback.rot,
    x: num(r.x, fallback.x, -LIMIT, LIMIT),
    y: num(r.y, fallback.y, -50, 50),
    z: num(r.z, fallback.z, -LIMIT, LIMIT),
    opacity: num(r.opacity, fallback.opacity, 0.1, 1),
    hidden: typeof r.hidden === "boolean" ? r.hidden : fallback.hidden,
  };
}
