import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Vec3 } from "../builders";
import { BEVEL_RADIUS, isBevelShape } from "./shapes";
import type { ShapeKind } from "./shapes";

/**
 * The actual `THREE.BufferGeometry` behind each `ShapeKind` (see `shapes.ts`). Every "unit" shape
 * — box, pedestal, post cap, cylinder, cone, sphere — fits exactly in the -0.5..0.5 cube on every
 * axis, so `Scene.tsx`'s existing per-frame `mesh.scale.set(w, h, d)` (the part's own real size,
 * times whatever the build/edit animation is doing that frame) works completely unchanged: these
 * are drop-in replacements for the old single shared `UNIT_BOX`, not a new animation path.
 *
 * Bevelled products are different on purpose: `RoundedBoxGeometry` takes real width/height/depth
 * directly, so a chamfer can be a constant few millimetres regardless of the part's own size —
 * scaling a *unit* rounded box instead would stretch that chamfer into a giant, wrong-looking
 * diagonal on anything long (a 4 m deck board, a 3 m skirting run). Built once per distinct real
 * size and cached (module-level, like `textures.ts`'s own caches): a run of identical boards or a
 * floor of identical tiles all share one geometry.
 */

export const UNIT_BOX: THREE.BufferGeometry = new THREE.BoxGeometry(1, 1, 1);
const UNIT_CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 20, 1);
const UNIT_CONE = new THREE.ConeGeometry(0.5, 1, 18, 1);
const UNIT_SPHERE = new THREE.SphereGeometry(0.5, 16, 12);

/** A round adjustable paving pedestal, unit-sized: a wide base, a slender column and a broader
 *  levelling plate near the top — never read as a plain post once it's scaled to its real size. */
function buildPedestalGeometry(): THREE.BufferGeometry {
  const baseH = 0.22;
  const plateH = 0.14;
  const columnH = 1 - baseH - plateH;
  const base = new THREE.CylinderGeometry(0.46, 0.5, baseH, 14, 1);
  base.translate(0, -0.5 + baseH / 2, 0);
  const column = new THREE.CylinderGeometry(0.22, 0.26, columnH, 12, 1);
  column.translate(0, -0.5 + baseH + columnH / 2, 0);
  const plate = new THREE.CylinderGeometry(0.5, 0.42, plateH, 14, 1);
  plate.translate(0, 0.5 - plateH / 2, 0);
  const merged = mergeGeometries([base, column, plate], false);
  base.dispose();
  column.dispose();
  plate.dispose();
  return merged;
}

/** A small pyramidal finial over a short skirt, unit-sized — a fence post's cap, not a flat lid. */
function buildPostCapGeometry(): THREE.BufferGeometry {
  const skirtH = 0.3;
  const skirt = new THREE.CylinderGeometry(0.56, 0.5, skirtH, 4, 1);
  skirt.rotateY(Math.PI / 4);
  skirt.translate(0, -0.5 + skirtH / 2, 0);
  const peakH = 0.55;
  const peak = new THREE.ConeGeometry(0.5, peakH, 4, 1);
  peak.rotateY(Math.PI / 4);
  peak.translate(0, -0.5 + skirtH + peakH / 2, 0);
  const merged = mergeGeometries([skirt, peak], false);
  skirt.dispose();
  peak.dispose();
  return merged;
}

const UNIT_PEDESTAL = buildPedestalGeometry();
const UNIT_POST_CAP = buildPostCapGeometry();

/** A blade of grass: two crossed tapered quads (base width baked in, real metres — not scaled
 *  from a 1 m-wide unit, which blade this thin can't afford) from y = 0 (the ground) to y = 1
 *  (its tip) — reads as a blade from any horizontal angle, not just a flat card. Scaled per
 *  instance by (width jitter, real height × growth, width jitter) in `Scene.tsx`'s `Grass`, which
 *  also varies the hue/lightness per instance — multiplied with this geometry's own baked-in
 *  vertex colours (a touch darker at the base, lighter at the tip, like real grass catching
 *  light along its length). */
function buildBladeGeometry(): THREE.BufferGeometry {
  const halfWidth = 0.006;
  const baseShade = 0.82;
  const tipShade = 1.22;
  const quad = (nx: number, nz: number) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-halfWidth, 0, 0, halfWidth, 0, 0, 0, 1, 0]), 3));
    g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array([nx, 0, nz, nx, 0, nz, nx, 0, nz]), 3));
    g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0.5, 1]), 2));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array([baseShade, baseShade, baseShade, baseShade, baseShade, baseShade, tipShade, tipShade, tipShade]), 3));
    return g;
  };
  const a = quad(0, 1);
  const b = quad(1, 0);
  b.rotateY(Math.PI / 2);
  const merged = mergeGeometries([a, b], false);
  a.dispose();
  b.dispose();
  return merged;
}

export const UNIT_BLADE: THREE.BufferGeometry = buildBladeGeometry();

const UNIT_SHAPES: Record<Exclude<ShapeKind, "bevelFlat" | "bevelTile" | "bevelSoft" | "bevelCrisp" | "slats">, THREE.BufferGeometry> = {
  box: UNIT_BOX,
  pedestal: UNIT_PEDESTAL,
  postCap: UNIT_POST_CAP,
  cylinder: UNIT_CYLINDER,
  cone: UNIT_CONE,
  sphere: UNIT_SPHERE,
};

/** The shared unit geometry for a non-bevel shape (bevels are built to real size — see below). */
export function unitGeometryFor(shape: ShapeKind): THREE.BufferGeometry {
  return isBevelShape(shape) || shape === "slats" ? UNIT_BOX : UNIT_SHAPES[shape];
}

const bevelCache = new Map<string, THREE.BufferGeometry>();

function bevelKey(shape: string, size: Vec3): string {
  return `${shape}:${size[0].toFixed(3)}:${size[1].toFixed(3)}:${size[2].toFixed(3)}`;
}

/** A chamfered box at the part's exact real size (see the module doc for why size has to be
 *  baked in rather than applied through `mesh.scale`), cached per distinct size. */
export function bevelGeometryFor(shape: "bevelFlat" | "bevelTile" | "bevelSoft" | "bevelCrisp", size: Vec3): THREE.BufferGeometry {
  const key = bevelKey(shape, size);
  const cached = bevelCache.get(key);
  if (cached) return cached;
  const radius = BEVEL_RADIUS[shape];
  const geo = new RoundedBoxGeometry(Math.max(size[0], 1e-4), Math.max(size[1], 1e-4), Math.max(size[2], 1e-4), 1, radius);
  bevelCache.set(key, geo);
  return geo;
}

/** Test/diagnostic hook: how many distinct bevel geometries are currently cached. */
export function bevelCacheSize(): number {
  return bevelCache.size;
}

/** Fence boards: ~9 cm wide with ~1.2 cm gaps, like a slatted garden panel. */
export const SLAT_TARGET_WIDTH = 0.09;
export const SLAT_GAP = 0.012;

/** How a panel `length` metres long is divided into boards: count and exact board width. */
export function slatLayout(length: number): { count: number; width: number } {
  const count = Math.max(1, Math.round((length + SLAT_GAP) / (SLAT_TARGET_WIDTH + SLAT_GAP)));
  return { count, width: (length - (count - 1) * SLAT_GAP) / count };
}

const slatsCache = new Map<string, THREE.BufferGeometry>();

/**
 * A slatted fence panel (or gate) at its real size: vertical boards with gaps you can see
 * through, on two horizontal rails behind them. Its long side follows whichever horizontal
 * axis the part is longer on. UVs are projected on the panel's face (u along it, v up), the
 * same 0..1 a plain box's front face gets — so the finish's `repeatFor` scale still applies.
 */
export function slatsGeometryFor(size: Vec3): THREE.BufferGeometry {
  const key = bevelKey("slats", size);
  const cached = slatsCache.get(key);
  if (cached) return cached;
  const alongX = size[0] >= size[2];
  const L = Math.max(alongX ? size[0] : size[2], 0.02);
  const H = Math.max(size[1], 0.02);
  const T = Math.max(alongX ? size[2] : size[0], 0.01);
  const boardT = T * 0.55;
  const railT = T - boardT;
  const { count, width } = slatLayout(L);
  const pieces: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const b = new RoundedBoxGeometry(width, H, boardT, 1, Math.min(0.003, width / 4, boardT / 4));
    b.translate(-L / 2 + width / 2 + i * (width + SLAT_GAP), 0, T / 2 - boardT / 2);
    pieces.push(b);
  }
  const railH = Math.min(0.07, H * 0.1);
  for (const y of [-H * 0.32, H * 0.32]) {
    const r = new THREE.BoxGeometry(L - 0.01, railH, railT);
    r.translate(0, y, -T / 2 + railT / 2);
    pieces.push(r);
  }
  // RoundedBoxGeometry is non-indexed and BoxGeometry indexed: merge them all as non-indexed.
  const flat = pieces.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(flat, false);
  for (const g of new Set([...pieces, ...flat])) g.dispose();
  const pos = merged.getAttribute("position");
  const uv = merged.getAttribute("uv");
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + L / 2) / L, (pos.getY(i) + H / 2) / H);
  uv.needsUpdate = true;
  if (!alongX) merged.rotateY(Math.PI / 2);
  merged.computeBoundingSphere();
  slatsCache.set(key, merged);
  return merged;
}
