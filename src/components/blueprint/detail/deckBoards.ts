import type { FrameSides } from "@/domain/patterns";
import { clipHalfPlane, polygonArea } from "./prism";
import type { Pt } from "./prism";

/**
 * Board outlines for the two deck layouts that are not a row of straight boards: boards at 45°
 * cut flush at the edge of the deck, and a picture-frame border with mitred corners. Pure maths,
 * shared by `deck()` in `builders.ts` and the tests; each outline becomes a prism part (see
 * `prism.ts`). Plan coordinates, metres.
 */

export interface DeckZoneRect {
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface BoardOutline {
  /** Stable index within the zone (id suffix, colour mix, build order). */
  index: number;
  poly: Pt[];
  /** The direction the board runs, radians in the x–z plane. */
  grain: number;
}

/** Parts smaller than this (m²) — a corner of a diagonal board — are not worth a mesh. */
const MIN_AREA = 0.0008;

/**
 * Boards at 45° across a rectangle: strips `width` wide every `pitch`, each clipped to the zone —
 * a board cut flush with the deck's edge, so a long board in the middle and a small triangle in
 * each corner. `flip` mirrors the angle (the other diagonal).
 */
export function diagonalBoards(zone: DeckZoneRect, flip: boolean, pitch: number, width: number): BoardOutline[] {
  const grain = flip ? -Math.PI / 4 : Math.PI / 4;
  const gx = Math.cos(grain);
  const gz = Math.sin(grain);
  // Across the boards.
  const nx = -gz;
  const nz = gx;
  const rect: Pt[] = [
    [zone.x, zone.z],
    [zone.x + zone.w, zone.z],
    [zone.x + zone.w, zone.z + zone.d],
    [zone.x, zone.z + zone.d],
  ];
  const ss = rect.map(([x, z]) => x * nx + z * nz);
  const sMin = Math.min(...ss);
  const sMax = Math.max(...ss);
  const count = Math.max(1, Math.ceil((sMax - sMin - 1e-9) / pitch));
  const out: BoardOutline[] = [];
  for (let k = 0; k < count; k++) {
    const s0 = sMin + k * pitch;
    const s1 = s0 + width;
    let poly = clipHalfPlane(rect, nx, nz, s0);
    if (poly.length >= 3) poly = clipHalfPlane(poly, -nx, -nz, -s1);
    if (poly.length < 3 || polygonArea(poly) < MIN_AREA) continue;
    out.push({ index: k, poly, grain });
  }
  return out;
}

export type FrameSide = "n" | "e" | "s" | "w";

export interface FrameBoard extends BoardOutline {
  side: FrameSide;
}

/**
 * The border of a zone: one board `width` wide along every open side, mitred at 45° where two
 * open sides meet and cut square where the next side is open to a neighbouring zone. Boards touch
 * at the mitre — the joint is the seam between two grain directions.
 */
export function frameBoards(zone: DeckZoneRect, sides: FrameSides, width: number): FrameBoard[] {
  const x0 = zone.x;
  const x1 = zone.x + zone.w;
  const z0 = zone.z;
  const z1 = zone.z + zone.d;
  const bw = width;
  const out: FrameBoard[] = [];
  if (sides.n) {
    const a = sides.w ? bw : 0;
    const b = sides.e ? bw : 0;
    out.push({ index: 0, side: "n", grain: 0, poly: [[x0, z0], [x1, z0], [x1 - b, z0 + bw], [x0 + a, z0 + bw]] });
  }
  if (sides.s) {
    const a = sides.w ? bw : 0;
    const b = sides.e ? bw : 0;
    out.push({ index: 2, side: "s", grain: 0, poly: [[x0 + a, z1 - bw], [x1 - b, z1 - bw], [x1, z1], [x0, z1]] });
  }
  if (sides.w) {
    const a = sides.n ? bw : 0;
    const b = sides.s ? bw : 0;
    out.push({ index: 3, side: "w", grain: Math.PI / 2, poly: [[x0, z0], [x0 + bw, z0 + a], [x0 + bw, z1 - b], [x0, z1]] });
  }
  if (sides.e) {
    const a = sides.n ? bw : 0;
    const b = sides.s ? bw : 0;
    out.push({ index: 1, side: "e", grain: Math.PI / 2, poly: [[x1 - bw, z0 + a], [x1, z0], [x1, z1], [x1 - bw, z1 - b]] });
  }
  return out;
}
