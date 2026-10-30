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
/** A trunk or branch: a tapering cylinder from (x, y, z) along the unit direction (dx, dy, dz). */
export interface Trunk {
  x: number;
  y: number;
  z: number;
  h: number;
  r: number;
  dx: number;
  dy: number;
  dz: number;
}
/**
 * One leaf card: a small alpha-cut quad of leaves on the outside of a foliage mass. `rx/ry/rz`
 * is its (random) orientation; `nx/ny/nz` the *mass's* outward normal at that spot, which the
 * shader shades with instead of the card's own — so a shrub lights as one leafy volume, not as
 * a thousand flickering quads.
 */
export interface Card {
  x: number;
  y: number;
  z: number;
  s: number;
  rx: number;
  ry: number;
  rz: number;
  nx: number;
  ny: number;
  nz: number;
  color: string;
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
  cards: Card[];
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
  // Garden greens, not game greens: muted saturation; `tone` also sets the plant's own value, so
  // neighbouring shrubs read as different species (a light yellow-green beside a deep blue-green).
  const hue = 0.21 + tone * 0.1 + (rnd() - 0.5) * 0.02;
  return hsl(hue, 0.24 + rnd() * 0.12, 0.25 - tone * 0.06 + lift + (rnd() - 0.5) * 0.05);
}

/**
 * Covers one foliage mass with leaf cards: spread evenly over its ellipsoid shell (Fibonacci
 * sphere, jittered), a little in and out of the surface so the silhouette is ragged, sparser
 * underneath where nobody looks. `size` is a card's edge in metres.
 */
function cover(b: Blob, rnd: () => number, size: number, out: Foliage, density = 1.6) {
  // Ellipsoid surface area (Knud Thomsen's approximation), in cards.
  const p = 1.6;
  const area = 4 * Math.PI * ((Math.pow(b.rx * b.ry, p) + Math.pow(b.rx * b.rz, p) + Math.pow(b.ry * b.rz, p)) / 3) ** (1 / p);
  const n = Math.min(900, Math.max(12, Math.round((area / (size * size)) * density)));
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const yy = 1 - ((i + 0.5) / n) * 2;
    if (yy < -0.55 && rnd() < 0.7) continue; // the underside, in its own shade
    const rr = Math.sqrt(1 - yy * yy);
    const th = i * golden + (rnd() - 0.5) * 0.6;
    const ux = Math.cos(th) * rr;
    const uz = Math.sin(th) * rr;
    const k = 0.84 + rnd() * 0.22;
    // Outward normal of the ellipsoid at that point.
    let nx = ux / b.rx;
    let ny = yy / b.ry;
    let nz = uz / b.rz;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    const c = Math.cos(b.rotY);
    const sn = Math.sin(b.rotY);
    const lx = ux * b.rx * k;
    const lz = uz * b.rz * k;
    const light = 0.03 + (rnd() - 0.5) * 0.09 + (yy > 0.3 ? 0.025 : 0);
    out.cards.push({
      x: b.x + lx * c + lz * sn,
      y: b.y + yy * b.ry * k,
      z: b.z - lx * sn + lz * c,
      s: size * (0.75 + rnd() * 0.5),
      rx: rnd() * Math.PI * 2,
      ry: rnd() * Math.PI * 2,
      rz: rnd() * Math.PI * 2,
      nx: nx * c + nz * sn,
      ny,
      nz: -nx * sn + nz * c,
      color: shade(b.color, light, (rnd() - 0.5) * 0.02),
    });
  }
}

/** Lightness / hue nudge of a hex colour (renderer-free, like `hsl` above). */
function shade(hex: string, dl: number, dh: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d > 1e-6) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  return hsl((h + dh + 1) % 1, s, Math.max(0.03, Math.min(0.9, l + dl)));
}

function shrubBlobs(s: ShrubSpec, out: Foliage) {
  const rnd = mulberry32(s.seed);
  const n = Math.max(3, Math.round(3 + s.r * 5));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.9;
    const ring = i === 0 ? 0 : 0.35 + rnd() * 0.45;
    const px = Math.cos(a) * s.r * ring * 0.45;
    const pz = Math.sin(a) * s.r * ring * 0.45;
    // Every mass, leaves included (cards reach ~6% past it), stays inside the planned radius.
    const br = Math.min(s.r * (0.5 + rnd() * 0.28), (s.r - Math.hypot(px, pz)) / 1.12);
    const ry = Math.max(br * 0.7, s.h * (0.32 + rnd() * 0.12) * (i === 0 ? 1.15 : 1));
    out.blobs.push({ x: s.x + px, y: ry * 0.82, z: s.z + pz, rx: br, ry, rz: br * (0.88 + rnd() * 0.2), rotY: rnd() * Math.PI, color: leafColor(rnd, s.tone, i === 0 ? 0.02 : 0) });
    cover(out.blobs[out.blobs.length - 1], rnd, 0.12 + s.r * 0.05, out);
  }
  if (s.flower) {
    const count = Math.round(14 + s.r * s.r * 70);
    for (let i = 0; i < count; i++) {
      const b = out.blobs[out.blobs.length - 1 - Math.floor(rnd() * n)];
      // On the upper shell of a blob.
      const theta = rnd() * Math.PI * 2;
      const phi = Math.acos(0.25 + rnd() * 0.75);
      const k = 1.03;
      out.dots.push({
        x: b.x + Math.sin(phi) * Math.cos(theta) * b.rx * k,
        y: b.y + Math.cos(phi) * b.ry * k,
        z: b.z + Math.sin(phi) * Math.sin(theta) * b.rz * k,
        s: 0.014 + rnd() * 0.014,
        color: s.flower,
      });
    }
  }
}

function treeBlobs(t: TreeSpec, out: Foliage) {
  const rnd = mulberry32(t.seed);
  const lean = (rnd() - 0.5) * 0.06;
  const lean2 = (rnd() - 0.5) * 0.06;
  const r0 = 0.09 + t.crown * 0.035;
  const trunkH = t.trunkH + t.crown * 0.55;
  const tl = Math.hypot(lean, 1, lean2);
  out.trunks.push({ x: t.x, y: -0.05, z: t.z, h: trunkH + 0.05, r: r0, dx: lean / tl, dy: 1 / tl, dz: lean2 / tl });
  const n = 8 + Math.floor(rnd() * 4);
  const cy = t.trunkH + t.crown * 0.55;
  const topX = t.x + (lean / tl) * trunkH;
  const topZ = t.z + (lean2 / tl) * trunkH;
  for (let i = 0; i < n; i++) {
    const u = rnd();
    const a = rnd() * Math.PI * 2;
    const spread = t.crown * 0.5 * Math.sqrt(u);
    const br = Math.min(t.crown * (0.42 + rnd() * 0.22), (t.crown - spread) / 1.12);
    const y = cy + (rnd() - 0.35) * t.crown * 0.7;
    // Lower blobs sit further out and darker (the shaded underside of the crown).
    const lift = (y - cy) / (t.crown * 2) * 0.1;
    const b: Blob = { x: t.x + Math.cos(a) * spread, y, z: t.z + Math.sin(a) * spread, rx: br, ry: br * 0.85, rz: br, rotY: rnd() * Math.PI, color: leafColor(rnd, t.tone, lift) };
    out.blobs.push(b);
    cover(b, rnd, 0.2 + t.crown * 0.03, out, 1.35);
    // A branch from the trunk out into most masses: what shows through the gaps in a crown.
    if (i % 2 === 0 || i < 4) {
      const fy = t.trunkH * (0.72 + rnd() * 0.25);
      const fx = t.x + (topX - t.x) * (fy / trunkH);
      const fz = t.z + (topZ - t.z) * (fy / trunkH);
      const dx = b.x - fx;
      const dy = b.y - fy;
      const dz = b.z - fz;
      const len = Math.hypot(dx, dy, dz) || 1;
      out.trunks.push({ x: fx, y: fy, z: fz, h: len * 0.85, r: r0 * (0.32 + rnd() * 0.12), dx: dx / len, dy: dy / len, dz: dz / len });
    }
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
    cover(out.blobs[out.blobs.length - 1], rnd, 0.075, out);
    if (p.flower) {
      for (let k = 0; k < 7; k++) {
        const theta = rnd() * Math.PI * 2;
        const phi = Math.acos(0.3 + rnd() * 0.7);
        out.dots.push({ x: x + Math.sin(phi) * Math.cos(theta) * r, y: y + Math.cos(phi) * r * 0.85, z: z + Math.sin(phi) * Math.sin(theta) * r, s: 0.013 + rnd() * 0.012, color: p.flower });
      }
    }
  }
}

export function foliageFor(plan: SurroundingsPlan): Foliage {
  const out: Foliage = { blobs: [], dots: [], cards: [], trunks: [], planters: [], soils: [] };
  for (const s of plan.shrubs) shrubBlobs(s, out);
  for (const t of plan.trees) treeBlobs(t, out);
  for (const p of plan.planters) planterBlobs(p, out);
  // Heights are relative to the ground: the component lifts the whole group to `plan.groundY`
  // (a patio's lawn sits at the paved top, not at the bottom of the dig).
  return out;
}
