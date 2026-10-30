import * as THREE from "three";
import type { Build, Part, Vec3 } from "../builders";
import { deckScrewInstances } from "../detail/deckScrews";

/**
 * The scene's instanced extras — deck screw heads and lawn blades — written out as plain
 * triangles, so the file needs no instancing extension (EXT_mesh_gpu_instancing is not in AR
 * Quick Look, nor in most older viewers) and merges into one mesh each. Capped and thinned
 * evenly: a screw head is 3 mm and a blade is a hair, nobody sees the difference past a few
 * thousand, and every one costs file size.
 */

export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Keep at most `cap` of `items`, evenly spread (so thinning a deck's screws still covers all of it). */
export function thinEvenly<T>(items: readonly T[], cap: number): T[] {
  if (items.length <= cap) return [...items];
  if (cap <= 0) return [];
  const out: T[] = [];
  const step = items.length / cap;
  for (let i = 0; i < cap; i++) out.push(items[Math.floor(i * step)]);
  return out;
}

// ───────────── deck screws ─────────────

/** Flat 6-sided heads (radius 1.6 mm — as in the live view's 8-sided cylinders) facing up. */
export const SCREW_RADIUS = 0.0016;

export function deckScrewPoints(parts: readonly Part[], origin: readonly [number, number], cap: number): Vec3[] {
  const all = deckScrewInstances(parts, 4000).map((s) => [s.pos[0] - origin[0], s.pos[1], s.pos[2] - origin[1]] as Vec3);
  return thinEvenly(all, cap);
}

/** One merged mesh geometry: a hexagon at every point, normal up. */
export function screwGeometry(points: readonly Vec3[]): THREE.BufferGeometry | null {
  if (!points.length) return null;
  const sides = 6;
  const positions = new Float32Array(points.length * (sides + 1) * 3);
  const normals = new Float32Array(positions.length);
  const uvs = new Float32Array(points.length * (sides + 1) * 2);
  const index: number[] = [];
  points.forEach(([x, y, z], i) => {
    const base = i * (sides + 1);
    // Centre + ring: a fan of 6 triangles.
    positions.set([x, y, z], base * 3);
    uvs.set([0.5, 0.5], base * 2);
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      positions.set([x + Math.cos(a) * SCREW_RADIUS, y, z + Math.sin(a) * SCREW_RADIUS], (base + 1 + k) * 3);
      uvs.set([0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5], (base + 1 + k) * 2);
      index.push(base, base + 1 + ((k + 1) % sides), base + 1 + k);
    }
    for (let v = 0; v <= sides; v++) normals.set([0, 1, 0], (base + v) * 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  g.setIndex(index);
  return g;
}

// ───────────── lawn blades ─────────────

export interface Blade {
  x: number;
  z: number;
  /** Height, m. */
  h: number;
  /** Width jitter (× the base 1.2 cm). */
  widthJ: number;
  /** Spin about the vertical, rad. */
  r: number;
  /** Lean, rad. */
  lean: number;
  /** -1..1: how light or dark this blade's green is. */
  tone: number;
}

/**
 * The blades the live view's `Grass` plants (same per-zone seed and distribution, so the lawn
 * looks the same), at most `cap` of them, in export space.
 */
export function grassBlades(grass: NonNullable<Build["grass"]>, origin: readonly [number, number], cap: number): Blade[] {
  const count = Math.min(grass.count, Math.max(0, cap));
  const total = grass.zones.reduce((s, z) => s + z.w * z.d, 0) || 1;
  const out: Blade[] = [];
  grass.zones.forEach((zone, zi) => {
    const rnd = mulberry32(42 + zi * 7919);
    const n = Math.round((count * zone.w * zone.d) / total);
    for (let i = 0; i < n; i++) {
      const x = zone.x + rnd() * zone.w;
      const z = zone.z + rnd() * zone.d;
      const h = 0.06 + rnd() * 0.09;
      const widthJ = 0.8 + rnd() * 0.7;
      const r = rnd() * Math.PI;
      const lean = (rnd() - 0.5) * 0.45;
      rnd(); // the live view's wave offset — skipped, but the sequence stays aligned
      rnd(); // hue jitter
      const tone = (rnd() - 0.5) * 2;
      out.push({ x: x - origin[0], z: z - origin[1], h, widthJ, r, lean, tone });
    }
  });
  return out;
}

const BLADE_HALF_WIDTH = 0.006;
/** Base and tip brightness of a blade (vertex colour): darker where it meets the soil. */
const BLADE_BASE = 0.68;
const BLADE_TIP = 1;

/**
 * Two crossed, tapered triangles per blade — a blade from any side, like the live view's — as one
 * geometry. `backfaces` adds the reversed copy of each triangle for formats with no double-sided
 * material (USDZ); `colors` adds the base-to-tip vertex-colour gradient (glTF only).
 */
export function bladeGeometry(blades: readonly Blade[], opts: { backfaces?: boolean; colors?: boolean } = {}): THREE.BufferGeometry | null {
  if (!blades.length) return null;
  const faces = opts.backfaces ? 2 : 1;
  const verts = blades.length * 2 * 3 * faces;
  const positions = new Float32Array(verts * 3);
  const normals = new Float32Array(verts * 3);
  const uvs = new Float32Array(verts * 2);
  const colors = opts.colors ? new Float32Array(verts * 3) : null;
  const euler = new THREE.Euler();
  const quat = new THREE.Quaternion();
  const mat = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  let at = 0;
  const push = (p: THREE.Vector3, nrm: THREE.Vector3, u: number, vv: number, shade: number) => {
    positions.set([p.x, p.y, p.z], at * 3);
    normals.set([nrm.x, nrm.y, nrm.z], at * 3);
    uvs.set([u, vv], at * 2);
    colors?.set([shade, shade, shade], at * 3);
    at++;
  };
  for (const b of blades) {
    // The live view's transform: scale, then lean about x on top of a spin about y.
    euler.set(b.lean, b.r, 0);
    quat.setFromEuler(euler);
    mat.compose(new THREE.Vector3(b.x, 0.012, b.z), quat, new THREE.Vector3(b.widthJ, b.h, b.widthJ));
    const rot = new THREE.Matrix4().extractRotation(mat);
    for (const plane of [0, 1]) {
      // A tapered triangle in the plane z = 0 (plane 0) or x = 0 (plane 1), base on the ground.
      const corners: [number, number, number][] = plane === 0 ? [[-BLADE_HALF_WIDTH, 0, 0], [BLADE_HALF_WIDTH, 0, 0], [0, 1, 0]] : [[0, 0, -BLADE_HALF_WIDTH], [0, 0, BLADE_HALF_WIDTH], [0, 1, 0]];
      const front = plane === 0 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
      n.copy(front).applyMatrix4(rot).normalize();
      const tri = corners.map((c) => v.set(...c).applyMatrix4(mat).clone());
      const shade = [BLADE_BASE, BLADE_BASE, BLADE_TIP];
      const uv: [number, number][] = [[0, 0], [1, 0], [0.5, 1]];
      // Winding: counter-clockwise seen from `front`, which is the normal.
      const order = plane === 0 ? [0, 1, 2] : [1, 0, 2];
      for (const i of order) push(tri[i], n, uv[i][0], uv[i][1], shade[i]);
      if (opts.backfaces) {
        const back = n.clone().negate();
        for (const i of [...order].reverse()) push(tri[i], back, uv[i][0], uv[i][1], shade[i]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  if (colors) g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}
