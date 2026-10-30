import type { Build, Part, Vec3 } from "../builders";

/**
 * Which parts of a `Build` go into an exported 3D model, and where they sit — pure maths on the
 * builder's own data (no THREE, no DOM), so it is unit-tested without WebGL.
 *
 * Export space: metres, y up, the origin at the project's centre ON THE GROUND (x/z recentred on
 * `build.center`, y = 0 stays the ground), exactly how the live scene frames the drawing. AR
 * viewers put the model's origin on the detected floor, so this is what gives true scale and
 * correct placement.
 */

export interface ExportOptions {
  /** Walls, slab and other surroundings the customer doesn't buy (default: left out). */
  includeContext?: boolean;
  /**
   * What to do with anything below the ground (concrete footings of fence posts): "clip" cuts the
   * model at y = 0 — right for AR, where floor-placement puts y = 0 on the real floor and anything
   * below would poke through it — and "keep" leaves it for a contractor's download.
   */
  underground?: "clip" | "keep";
}

/** A part ready to be turned into geometry: real size, centred position, in export space. */
export interface PlacedPart {
  part: Part;
  /** Box centre. */
  pos: Vec3;
  /** Full size (after any ground clipping). */
  size: Vec3;
}

/** Parts thinner than this (1 mm) in any dimension are noise, not product. */
const MIN_DIMENSION = 0.001;
/** Float slack when deciding "touches the ground". */
const EPS = 1e-6;

/** The plan centre the scene recentres on (the origin of the export). */
export function exportOrigin(build: Pick<Build, "center">): [number, number] {
  return build.center ?? [0, 0];
}

/** Whether a part is drawn at all in an export (never invisible or degenerate ones). */
export function isExportable(part: Part, opts: ExportOptions = {}): boolean {
  if (part.context && !opts.includeContext) return false;
  if (part.opacity !== undefined && part.opacity <= 0) return false;
  return part.size.every((s) => Number.isFinite(s) && s >= MIN_DIMENSION) && part.pos.every(Number.isFinite);
}

/**
 * The parts to export, placed in export space. Filters context (unless asked), invisible and
 * degenerate parts, recentres x/z on the plan centre and optionally cuts the underground.
 */
export function placeParts(build: Pick<Build, "parts" | "center">, opts: ExportOptions = {}): PlacedPart[] {
  const [cx, cz] = exportOrigin(build);
  const clip = (opts.underground ?? "clip") === "clip";
  const out: PlacedPart[] = [];
  for (const part of build.parts) {
    if (!isExportable(part, opts)) continue;
    const [x, y, z] = part.pos;
    const [w, h, d] = part.size;
    let cy = y;
    let ch = h;
    if (clip) {
      const bottom = y - h / 2;
      const top = y + h / 2;
      // Entirely below the floor: nothing to see in AR.
      if (top <= EPS) continue;
      if (bottom < -EPS) {
        // Straddling it: keep the part above the floor only.
        ch = top;
        cy = top / 2;
        if (ch < MIN_DIMENSION) continue;
      }
    }
    out.push({ part, pos: [x - cx, cy, z - cz], size: [w, ch, d] });
  }
  return out;
}

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

/** Axis-aligned bounds of placed parts (null when there are none). */
export function boundsOf(placed: readonly Pick<PlacedPart, "pos" | "size">[]): Bounds | null {
  if (!placed.length) return null;
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of placed) {
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], p.pos[a] - p.size[a] / 2);
      max[a] = Math.max(max[a], p.pos[a] + p.size[a] / 2);
    }
  }
  return { min, max };
}
