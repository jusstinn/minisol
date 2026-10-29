import { mulberry32 } from "./plan";
import type { PlanterSpec, ShrubSpec, SurroundingsPlan, TreeSpec } from "./plan";

/**
 * Turns the planned shrubs, trees and planters into flat, instance-ready lists — pure and
 * deterministic (every shape comes from its spec's own seed), so it is unit-tested without a
 * renderer and a re-render never re-rolls the garden. Scene-side code (`Vegetation.tsx`) just
 * writes these into a handful of `InstancedMesh`es: foliage blobs, trunks, flower dots, planter
 * boxes — one draw call each, however many plants there are.
 */

export interface Blob {
  x: number;
  y: number;
  z: number;
  /** Radii along x/y/z (a mound is wider than it is tall). */
  rx: number;
  ry: number;
  rz: number;
  rotY: number;
  /** Linear-ish sRGB tint, multiplied into the foliage colour. */
  color: string;
}
export interface Dot {
  x: number;
  y: number;
  z: number;
  s: number;
  color: string;
}
export interface Trunk {
  x: number;
  z: number;
  h: number;
  r: number;
  lean: number;
  rotY: number;
}
export interface PlanterBox {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  rotY: number;
}

export interface Foliage {
  blobs: Blob[];
  dots: Dot[];
  trunks: Trunk[];
  planters: PlanterBox[];
  /** Soil tops inside the planters. */
  soils: PlanterBox[];
}

const hsl = (h: number, s: number, l: number): string => {
  // A compact HSL → hex (three would do it, but this module stays renderer-free).
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

/** A foliage colour for one blob: a family picked by `tone`, then a per-blob jitter. */
function leafColor(rnd: () => number, tone: number, lift = 0): string {
  const hue = 0.235 + tone * 0.085 + (rnd() - 0.5) * 0.025;
  return hsl(hue, 0.36 + rnd() * 0.16, 0.22 + tone * 0.04 + lift + (rnd() - 0.5) * 0.07);
}

function shrubBlobs(s: ShrubSpec, out: Foliage) {
  const rnd = mulberry32(s.seed);
  const n = Math.max(3, Math.round(3 + s.r * 5));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.9;
    const ring = i === 0 ? 0 : 0.35 + rnd() * 0.45;
    const br = s.r * (0.5 + rnd() * 0.28);
    const px = Math.cos(a) * s.r * ring * 0.62;
    const pz = Math.sin(a) * s.r * ring * 0.62;
    const ry = Math.max(br * 0.7, s.h * (0.32 + rnd() * 0.12) * (i === 0 ? 1.15 : 1));
    out.blobs.push({ x: s.x + px, y: ry * 0.82, z: s.z + pz, rx: br, ry, rz: br * (0.88 + rnd() * 0.2), rotY: rnd() * Math.PI, color: leafColor(rnd, s.tone, i === 0 ? 0.02 : 0) });
  }
  if (s.flower) {
    const count = Math.round(14 + s.r * s.r * 70);
    for (let i = 0; i < count; i++) {
      const b = out.blobs[out.blobs.length - 1 - Math.floor(rnd() * n)];
      // On the upper shell of a blob.
      const theta = rnd() * Math.PI * 2;
      const phi = Math.acos(0.25 + rnd() * 0.75);
      const k = 1.0;
      out.dots.push({
        x: b.x + Math.sin(phi) * Math.cos(theta) * b.rx * k,
        y: b.y + Math.cos(phi) * b.ry * k,
        z: b.z + Math.sin(phi) * Math.sin(theta) * b.rz * k,
        s: 0.022 + rnd() * 0.022,
        color: s.flower,
      });
    }
  }
}

function treeBlobs(t: TreeSpec, out: Foliage) {
  const rnd = mulberry32(t.seed);
  out.trunks.push({ x: t.x, z: t.z, h: t.trunkH + t.crown * 0.55, r: 0.075 + t.crown * 0.03, lean: (rnd() - 0.5) * 0.08, rotY: rnd() * Math.PI * 2 });
  const n = 8 + Math.floor(rnd() * 4);
  const cy = t.trunkH + t.crown * 0.55;
  for (let i = 0; i < n; i++) {
    const u = rnd();
    const a = rnd() * Math.PI * 2;
    const spread = t.crown * 0.62 * Math.sqrt(u);
    const br = t.crown * (0.42 + rnd() * 0.22);
    const y = cy + (rnd() - 0.35) * t.crown * 0.7;
    // Lower blobs sit further out and darker (the shaded underside of the crown).
    const lift = (y - cy) / (t.crown * 2) * 0.1;
    out.blobs.push({ x: t.x + Math.cos(a) * spread, y, z: t.z + Math.sin(a) * spread, rx: br, ry: br * 0.85, rz: br, rotY: rnd() * Math.PI, color: leafColor(rnd, t.tone, lift) });
  }
}

function planterBlobs(p: PlanterSpec, out: Foliage) {
  const rnd = mulberry32(p.seed);
  const rotY = (rnd() - 0.5) * 0.5;
  out.planters.push({ x: p.x, z: p.z, w: p.w, d: p.d, h: p.h, rotY });
  out.soils.push({ x: p.x, z: p.z, w: p.w - 0.06, d: p.d - 0.06, h: 0.02, rotY });
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const n = Math.max(2, Math.round((p.w * p.d) / 0.09));
  for (let i = 0; i < n; i++) {
    const lx = (rnd() - 0.5) * (p.w - 0.28);
    const lz = (rnd() - 0.5) * (p.d - 0.28);
    const r = 0.13 + rnd() * 0.1;
    const x = p.x + lx * cos + lz * sin;
    const z = p.z - lx * sin + lz * cos;
    const y = p.h + r * 0.55;
    out.blobs.push({ x, y, z, rx: r, ry: r * 0.85, rz: r, rotY: rnd() * Math.PI, color: leafColor(rnd, rnd(), 0.03) });
    if (p.flower) {
      for (let k = 0; k < 7; k++) {
        const theta = rnd() * Math.PI * 2;
        const phi = Math.acos(0.3 + rnd() * 0.7);
        out.dots.push({ x: x + Math.sin(phi) * Math.cos(theta) * r, y: y + Math.cos(phi) * r * 0.85, z: z + Math.sin(phi) * Math.sin(theta) * r, s: 0.02 + rnd() * 0.02, color: p.flower });
      }
    }
  }
}

export function foliageFor(plan: SurroundingsPlan): Foliage {
  const out: Foliage = { blobs: [], dots: [], trunks: [], planters: [], soils: [] };
  for (const s of plan.shrubs) shrubBlobs(s, out);
  for (const t of plan.trees) treeBlobs(t, out);
  for (const p of plan.planters) planterBlobs(p, out);
  // Heights are relative to the ground: the component lifts the whole group to `plan.groundY`
  // (a patio's lawn sits at the paved top, not at the bottom of the dig).
  return out;
}
