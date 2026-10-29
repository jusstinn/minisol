import type { Build, Part } from "../builders";

/**
 * What sits around a project so the REAL view reads as a real place — a house wall behind a deck
 * or patio, a lawn, shrubs, planters and a tree; a window, a door frame and skirting boards in a
 * cut-away room. Everything here is *pure planning* (no renderer): the plan is derived from the
 * build's own footprint and never touches `build.parts` — the calculators and the price list
 * stay exactly as they were. Scene.tsx draws the plan (see `Surroundings.tsx`).
 *
 * Plan coordinates, as everywhere: x → east, z → south (so *north* is −z), y up. The house wall
 * therefore stands on the minimum-z side of a deck, and the default camera (south-east) looks at
 * its sunlit face.
 *
 * The one hard rule, unit-tested: nothing is ever placed inside the build's footprint plus a
 * margin (`MARGIN`). The house wall is the single deliberate neighbour — it stands against the
 * footprint's north edge, never inside it.
 */

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export type SurroundingsKind = "deck" | "paving" | "fence" | "lawn" | "room";

/** Clear space kept around the build's own footprint: nothing is planted inside it. */
export const MARGIN = 0.45;
export const WALL_HEIGHT = 2.8;
const TAU = Math.PI * 2;

export function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A small stable string hash (FNV-1a) — the same id always gives the same number. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rectOf(parts: readonly Part[]): Rect | null {
  if (!parts.length) return null;
  const r: Rect = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const p of parts) {
    r.minX = Math.min(r.minX, p.pos[0] - p.size[0] / 2);
    r.maxX = Math.max(r.maxX, p.pos[0] + p.size[0] / 2);
    r.minZ = Math.min(r.minZ, p.pos[2] - p.size[2] / 2);
    r.maxZ = Math.max(r.maxZ, p.pos[2] + p.size[2] / 2);
  }
  return r;
}

export const expand = (r: Rect, m: number): Rect => ({ minX: r.minX - m, maxX: r.maxX + m, minZ: r.minZ - m, maxZ: r.maxZ + m });

/** Distance from a point to a rectangle (0 inside). */
export function distToRect(x: number, z: number, r: Rect): number {
  const dx = Math.max(r.minX - x, 0, x - r.maxX);
  const dz = Math.max(r.minZ - z, 0, z - r.maxZ);
  return Math.hypot(dx, dz);
}

/** Does a circle of radius `r` at (x, z) stay clear of the rectangle? */
export const circleClear = (x: number, z: number, r: number, rect: Rect) => distToRect(x, z, rect) >= r - 1e-9;

export interface ShrubSpec {
  x: number;
  z: number;
  /** Bounding radius on the ground. */
  r: number;
  /** Height of the mass, metres. */
  h: number;
  seed: number;
  /** A flowering colour, or null for plain foliage. */
  flower: string | null;
  /** Foliage hue family: 0 fresh green … 1 deep/blue-green. */
  tone: number;
}
export interface TreeSpec {
  x: number;
  z: number;
  trunkH: number;
  crown: number;
  seed: number;
  tone: number;
}
export interface PlanterSpec {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  seed: number;
  flower: string | null;
}

export interface OpeningSpec {
  kind: "window" | "door";
  wall: "n" | "s" | "e" | "w";
  /** Extent along the wall (x for n/s walls, z for e/w walls) and in height. */
  u0: number;
  u1: number;
  y0: number;
  y1: number;
}

export interface HouseSpec {
  x0: number;
  x1: number;
  /** The wall's south (front) face. */
  zFront: number;
  thickness: number;
  height: number;
  /** Where the floor of the deck/patio meets the wall: the door's threshold. */
  sillY: number;
  door: { cx: number; w: number; h: number };
  window: { cx: number; w: number; h: number; sill: number } | null;
}

export interface RoomSpec {
  /** Inner faces of the four walls. */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  height: number;
  lowHeight: number;
  openings: OpeningSpec[];
  /** A default window/door is added where the build has none on the tall walls. */
  window: OpeningSpec;
  door: OpeningSpec | null;
  skirting: boolean;
}

export interface SurroundingsPlan {
  kind: SurroundingsKind;
  footprint: Rect;
  /** Footprint + `MARGIN`: no vegetation or fixture is placed inside it. */
  keepOut: Rect;
  /** Height of the ground the surroundings stand on (0, or the paved top for a patio). */
  groundY: number;
  /** Radius of the faded lawn disc (outdoor). */
  groundR: number;
  /** A hole in the lawn where the paved build sits flush (patio only). */
  hole: Rect | null;
  /** Dull/dry lawn colour for the lawn project (so the new turf is the hero); healthy otherwise. */
  lawnTone: "healthy" | "dry";
  house: HouseSpec | null;
  shrubs: ShrubSpec[];
  trees: TreeSpec[];
  planters: PlanterSpec[];
  room: RoomSpec | null;
}

const FLOWERS = ["#f4f1ea", "#f2a3b8", "#f6d34d", "#d9558a", "#b9a5f2", "#ffffff"];

export function surroundingsKind(build: Build): SurroundingsKind | null {
  if (build.interior) return "room";
  if (!build.outdoor) return null;
  const ids = new Set(build.layers.map((l) => l.id));
  if (ids.has("deck_board")) return "deck";
  if (ids.has("fence_panel")) return "fence";
  if (ids.has("pavers")) return "paving";
  if (build.grass) return "lawn";
  return null;
}

/** The builders' own translucent "ground" context parts, which the lawn replaces (REAL only). */
export function groundPartRole(part: Part, kind: SurroundingsKind | null): "hide" | null {
  if (!part.context || !kind) return null;
  if (kind === "fence" && part.id === "ground") return "hide";
  // A patio's "ground it is dug into": ghost soil and turf strips, replaced by the lawn itself.
  if (kind === "paving" && (part.id.startsWith("soil-") || part.id.startsWith("turf-"))) return "hide";
  return null;
}

/** Parts that define the project's own footprint (everything except the fence's oversize ground slab). */
const footprintParts = (build: Build, kind: SurroundingsKind | null) => (kind === "fence" ? build.parts.filter((p) => p.id !== "ground") : build.parts);

/** Top of the highest board/paver: where a door steps out onto the deck or patio. */
function surfaceTop(build: Build): number {
  let y = 0;
  for (const p of build.parts) if (p.layer === "deck_board" || p.layer === "pavers") y = Math.max(y, p.pos[1] + p.size[1] / 2);
  return y;
}

interface Placed {
  x: number;
  z: number;
  r: number;
}

/** Rejection-samples a spot near `want`: clear of the keep-out zone and not smothering what is already there. */
function place(want: () => [number, number], r: number, keepOut: Rect, placed: Placed[], overlap = 0.35, tries = 14): [number, number] | null {
  for (let i = 0; i < tries; i++) {
    const [x, z] = want();
    if (!circleClear(x, z, r, keepOut)) continue;
    if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + r - overlap)) continue;
    placed.push({ x, z, r });
    return [x, z];
  }
  return null;
}

const pickFlower = (rnd: () => number, p = 0.55) => (rnd() < p ? FLOWERS[Math.floor(rnd() * FLOWERS.length)] : null);

function shrub(rnd: () => number, x: number, z: number, r: number, h: number, flowering = 0.5): ShrubSpec {
  return { x, z, r, h, seed: Math.floor(rnd() * 1e9), flower: pickFlower(rnd, flowering), tone: rnd() };
}

/** Dimensions of the lawn disc, big enough that its soft edge sits far outside any sensible camera. */
function groundRadius(fp: Rect): number {
  return Math.max(fp.maxX - fp.minX, fp.maxZ - fp.minZ) * 0.5 + 9;
}

function houseFor(fp: Rect, build: Build, rnd: () => number): HouseSpec {
  const w = fp.maxX - fp.minX;
  const cx = (fp.minX + fp.maxX) / 2;
  const half = Math.max(w / 2 + 1.7, 3.4);
  const doorW = Math.min(1.8, Math.max(1.2, w * 0.4));
  const sillY = surfaceTop(build);
  const doorCx = cx + (w > 3 ? (rnd() - 0.5) * 0.4 : 0);
  const windowW = 1.25;
  // A window on whichever side has the room for it beside the door.
  const room = half - (doorCx - cx) - doorW / 2;
  const roomLeft = half + (doorCx - cx) - doorW / 2;
  const useRight = room >= roomLeft;
  const free = Math.max(room, roomLeft);
  const winCx = free > windowW + 0.9 ? (useRight ? doorCx + doorW / 2 + 0.3 + (free - 0.3) / 2 : doorCx - doorW / 2 - 0.3 - (free - 0.3) / 2) : null;
  return {
    x0: cx - half,
    x1: cx + half,
    zFront: fp.minZ,
    thickness: 0.42,
    height: WALL_HEIGHT + sillY,
    sillY,
    door: { cx: doorCx, w: doorW, h: 2.1 },
    window: winCx === null ? null : { cx: winCx, w: windowW, h: 1.25, sill: sillY + 0.95 },
  };
}

function roomFor(build: Build): RoomSpec | null {
  const byId = new Map(build.parts.map((p) => [p.id, p]));
  const back = byId.get("wall-back");
  const left = byId.get("wall-left");
  const front = byId.get("wall-front");
  const right = byId.get("wall-right");
  if (!back || !left || !front || !right) return null;
  const x0 = left.pos[0] + left.size[0] / 2;
  const x1 = right.pos[0] - right.size[0] / 2;
  const z0 = back.pos[2] + back.size[2] / 2;
  const z1 = front.pos[2] - front.size[2] / 2;
  const height = back.size[1];
  const lowHeight = front.size[1];
  const openings: OpeningSpec[] = [];
  for (const p of build.parts) {
    if (!p.id.startsWith("op-")) continue;
    const kind = p.color.toLowerCase() === "#bcd8f5" ? "window" : "door";
    const thinZ = p.size[2] < p.size[0] && p.size[2] < 0.05;
    const wall: OpeningSpec["wall"] = thinZ ? (p.pos[2] < (z0 + z1) / 2 ? "n" : "s") : p.pos[0] < (x0 + x1) / 2 ? "w" : "e";
    const along = thinZ ? p.pos[0] : p.pos[2];
    const len = thinZ ? p.size[0] : p.size[2];
    openings.push({ kind, wall, u0: along - len / 2, u1: along + len / 2, y0: p.pos[1] - p.size[1] / 2, y1: p.pos[1] + p.size[1] / 2 });
  }
  const tall = (o: OpeningSpec) => o.wall === "n" || o.wall === "w";
  const hasWindow = openings.some((o) => o.kind === "window" && tall(o));
  const hasDoor = openings.some((o) => o.kind === "door" && tall(o) && o.y1 > 1.4);
  const L = x1 - x0;
  const W = z1 - z0;
  const winW = Math.min(1.25, Math.max(0.6, L * 0.4));
  const winC = x0 + L * 0.64;
  const window: OpeningSpec = { kind: "window", wall: "n", u0: winC - winW / 2, u1: winC + winW / 2, y0: 1.0, y1: Math.min(height - 0.35, 2.2) };
  const doorC = z0 + W * 0.72;
  const door: OpeningSpec | null = hasDoor || W < 1.6 ? null : { kind: "door", wall: "w", u0: doorC - 0.45, u1: doorC + 0.45, y0: 0, y1: Math.min(2.05, height - 0.3) };
  // Wall tiles run to the floor; skirting only makes sense on painted/plastered walls.
  const tiled = build.layers.some((l) => l.id === "wall_tiles" || l.id === "floor_tiles");
  return { x0, x1, z0, z1, height, lowHeight, openings: hasWindow ? openings : [...openings, window], window, door, skirting: !tiled };
}

export function planSurroundings(build: Build): SurroundingsPlan | null {
  const kind = surroundingsKind(build);
  if (!kind) return null;
  const fpParts = footprintParts(build, kind);
  const footprint = rectOf(fpParts);
  if (!footprint) return null;
  const keepOut = expand(footprint, MARGIN);
  const w = footprint.maxX - footprint.minX;
  const d = footprint.maxZ - footprint.minZ;
  // Same build → same garden; a different size → a different (but equally stable) one.
  const rnd = mulberry32(hashString(`${kind}:${w.toFixed(2)}:${d.toFixed(2)}`));
  const base: SurroundingsPlan = {
    kind,
    footprint,
    keepOut,
    groundY: 0,
    groundR: groundRadius(footprint),
    hole: null,
    lawnTone: kind === "lawn" ? "dry" : "healthy",
    house: null,
    shrubs: [],
    trees: [],
    planters: [],
    room: null,
  };
  if (kind === "room") return { ...base, room: roomFor(build) };

  const placed: Placed[] = [];
  const shrubs: ShrubSpec[] = [];
  const trees: TreeSpec[] = [];
  const planters: PlanterSpec[] = [];
  const cx = (footprint.minX + footprint.maxX) / 2;
  const cz = (footprint.minZ + footprint.maxZ) / 2;
  const addShrub = (want: () => [number, number], r: number, h: number, flowering = 0.5) => {
    const at = place(want, r, keepOut, placed, 0.35, 14);
    if (at) shrubs.push(shrub(rnd, at[0], at[1], r, h, flowering));
  };
  const addTree = (want: () => [number, number], crown: number, trunkH: number) => {
    const at = place(want, crown * 0.55, keepOut, placed, 0.2, 18);
    if (at) trees.push({ x: at[0], z: at[1], trunkH, crown, seed: Math.floor(rnd() * 1e9), tone: rnd() });
  };
  const addPlanter = (want: () => [number, number], pw: number, pd: number) => {
    const at = place(want, Math.hypot(pw, pd) / 2, keepOut, placed, 0.05, 14);
    if (at) planters.push({ x: at[0], z: at[1], w: pw, d: pd, h: 0.45, seed: Math.floor(rnd() * 1e9), flower: pickFlower(rnd, 0.85) });
  };
  const J = (a: number, b: number) => a + rnd() * (b - a);

  if (kind === "deck" || kind === "paving") {
    const house = houseFor(footprint, build, rnd);
    base.house = house;
    const east = rnd() < 0.5 ? 1 : -1;
    const sideX = (s: number, off: number) => (s > 0 ? footprint.maxX + MARGIN + off : footprint.minX - MARGIN - off);
    // Foundation planting along the wall on both sides of the deck.
    for (const s of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const r = J(0.45, 0.7);
        addShrub(() => [sideX(s, r + i * 1.1 + J(0, 0.35)), footprint.minZ + J(0.15, 0.5)], r, J(0.55, 1.05), 0.6);
      }
    }
    // A tall, informal hedge on one side, lower beds on the other; both stay clear of the camera's south-east.
    for (let i = 0; i < 3; i++) addShrub(() => [sideX(-east, J(1.5, 2.3)), J(footprint.minZ + 0.2, footprint.maxZ - 0.3)], J(0.55, 0.85), J(1.0, 1.5), 0.35);
    for (let i = 0; i < 2; i++) addShrub(() => [sideX(east, J(1.4, 2.4)), J(footprint.minZ + 0.1, cz + d * 0.15)], J(0.4, 0.7), J(0.5, 0.95), 0.7);
    // A tree on the hedge side, far enough back to read as a garden tree rather than a prop.
    addTree(() => [sideX(-east, J(3.2, 4.3)), J(footprint.minZ - 0.2, cz)], J(1.55, 2.0), J(1.7, 2.1));
    // Pots and low planters at the front corners.
    addPlanter(() => [sideX(-east, J(0.5, 0.9)), footprint.maxZ + J(0.4, 0.9)], 0.9, 0.42);
    addPlanter(() => [sideX(east, J(0.4, 0.8)), footprint.maxZ + J(0.3, 0.8)], 0.6, 0.6);
    addShrub(() => [sideX(-east, J(0.9, 1.6)), footprint.maxZ + J(0.9, 1.6)], J(0.35, 0.5), J(0.3, 0.5), 0.9);
    if (kind === "paving") {
      // The patio sits flush with the lawn: the ground is the paved top, with a hole for the build.
      const top = build.parts.filter((p) => p.layer === "pavers").reduce((m, p) => Math.max(m, p.pos[1] + p.size[1] / 2), 0);
      // The lawn meets the kerb flush (or, with no kerb, the outermost paved layer).
      const kerbs = rectOf(build.parts.filter((p) => p.layer === "paving_edging"));
      const solid = kerbs ?? rectOf(build.parts.filter((p) => !p.context));
      base.groundY = top;
      base.hole = solid;
    }
  } else if (kind === "fence") {
    const alongX = w >= d;
    // Garden on the south (alongX) / east (along z) side — the side the camera looks at.
    const L = alongX ? w : d;
    const along0 = alongX ? footprint.minX : footprint.minZ;
    const side = alongX ? footprint.maxZ + MARGIN : footprint.maxX + MARGIN;
    const at = (u: number, off: number): [number, number] => (alongX ? [u, side + off] : [side + off, u]);
    let u = along0 + J(0.2, 0.7);
    while (u < along0 + L - 0.3) {
      const r = J(0.38, 0.75);
      const uu = u;
      addShrub(() => at(uu + J(-0.2, 0.2), r + J(0.02, 0.5)), r, J(0.45, 1.25), 0.65);
      u += r * 1.5 + J(0.2, 0.8);
    }
    // A second, lower row further out and a couple of planters — the "garden" side.
    for (let i = 0; i < 4; i++) addShrub(() => at(along0 + J(0, L), J(1.5, 2.6)), J(0.3, 0.5), J(0.3, 0.6), 0.9);
    addPlanter(() => at(along0 + J(0.1, L * 0.35), J(1.2, 1.8)), 0.8, 0.4);
    addPlanter(() => at(along0 + L * 0.7 + J(0, L * 0.25), J(1.2, 1.8)), 0.6, 0.6);
    // The neighbour's side: a few taller shrubs a good way back, and a tree beyond the end.
    const far = alongX ? footprint.minZ - MARGIN : footprint.minX - MARGIN;
    for (let i = 0; i < 3; i++) {
      const uu = along0 + J(0, L);
      addShrub(() => (alongX ? [uu, far - J(1.6, 3)] : [far - J(1.6, 3), uu]), J(0.6, 0.9), J(1.1, 1.7), 0.2);
    }
    addTree(() => (alongX ? [along0 + L * J(0.15, 0.4), far - J(3.0, 4.2)] : [far - J(3.0, 4.2), along0 + L * J(0.15, 0.4)]), J(1.6, 2.1), J(1.8, 2.2));
    addTree(() => (alongX ? [along0 + L + J(2.2, 3.2), footprint.maxZ + J(0.5, 1.8)] : [footprint.maxX + J(0.5, 1.8), along0 + L + J(2.2, 3.2)]), J(1.3, 1.7), J(1.5, 1.9));
  } else if (kind === "lawn") {
    // New turf in the middle; a mixed border around it, never on it.
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + J(-0.25, 0.25);
      const rr = Math.max(w, d) * 0.5 + J(1.3, 2.4);
      // Keep the camera's south-east a little clearer than the rest.
      const south = Math.sin(a) > 0.3 && Math.cos(a) > -0.2;
      addShrub(() => [cx + Math.cos(a) * rr * 1.15, cz + Math.sin(a) * rr], south ? J(0.3, 0.5) : J(0.5, 0.9), south ? J(0.3, 0.55) : J(0.8, 1.4), 0.6);
    }
    addTree(() => [footprint.minX - J(1.5, 2.4), footprint.minZ - J(0.8, 1.8)], J(1.7, 2.2), J(1.8, 2.2));
    addPlanter(() => [footprint.maxX + J(0.9, 1.6), footprint.minZ + J(0.3, 1.5)], 0.9, 0.42);
    addPlanter(() => [footprint.minX + J(0.3, 1.5), footprint.maxZ + J(0.9, 1.5)], 0.6, 0.6);
  }

  return { ...base, shrubs, trees, planters };
}
