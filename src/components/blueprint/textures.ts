import * as THREE from "three";
import type { Vec3 } from "./builders";

/**
 * Procedural materials for the REAL view: small tileable canvases (colour-variation, roughness-
 * variation, bump) generated once per finish KIND — not per colour, not per part — and cached at
 * module level so every mesh with the same finish shares the same drawing. The actual tint stays
 * the part's own `color` (see builders.ts): these maps are grayscale and only *multiply* a
 * grain/fleck/groove variation into it (three.js multiplies `map`/`roughnessMap` into
 * `color`/`roughness` the same way any texture does), which is also why one wood texture works
 * for every wood-coloured part regardless of which product the customer chose.
 *
 * UV scale: every part is a scaled unit box (see Scene.tsx's `UNIT_BOX`), so a face's UV always
 * spans 0..1 no matter the part's real size — the real-world scale comes entirely from the
 * texture's `repeat`, computed in `repeatFor` from the part's own size and the finish's real
 * "repeat unit" (a board's true width, a tile's true format before any "draw fewer, bigger"
 * scale-up for performance — see `tiling()`/`paving()` in builders.ts).
 *
 * No images, nothing downloaded: every canvas below is drawn with 2D primitives and simple
 * (tileable, wrapped) value noise.
 */

export type FinishKind = "wood" | "wpc" | "tile" | "tileWall" | "paver" | "gravel" | "sand" | "soil" | "concrete" | "plaster" | "metal" | "membrane" | "fence" | "grass";

export interface Finish {
  kind: FinishKind;
  /**
   * Real size (m) of one texture tile along the part's U/V — a board's true width, a catalogue
   * tile's true format — *before* any "draw fewer, bigger boxes" scale-up a builder did for
   * performance. Most parts are already drawn at their real size (one board, one tile, one
   * paver), so this is only needed where a builder enlarged the drawn unit; otherwise a sensible
   * per-kind default is used.
   */
  unit?: [number, number];
  /**
   * Which two of the part's local box dimensions the texture wraps: "xz" — the ground plane
   * (width × depth, seen from above: boards, tiles, pavers, slabs, gravel…), "xy" — a vertical
   * face facing along z (width × height: panels, posts, painted walls), or "zy" — a vertical
   * face facing along x (depth × height: an east/west wall's own tiles, where the wall's long
   * span is its *depth*, not its width). Defaults per kind.
   */
  axes?: "xz" | "xy" | "zy";
}

const DEFAULT_UNIT: Record<FinishKind, [number, number]> = {
  wood: [0.9, 0.14],
  wpc: [0.9, 0.14],
  tile: [0.33, 0.33],
  tileWall: [0.33, 0.33],
  paver: [0.2, 0.1],
  gravel: [0.3, 0.3],
  sand: [0.2, 0.2],
  soil: [0.32, 0.32],
  concrete: [0.6, 0.6],
  plaster: [0.5, 0.5],
  metal: [0.22, 0.22],
  membrane: [0.18, 0.18],
  fence: [0.14, 1.8],
  grass: [0.5, 0.5],
};

const DEFAULT_AXES: Record<FinishKind, "xz" | "xy" | "zy"> = {
  wood: "xz",
  wpc: "xz",
  tile: "xz",
  tileWall: "xy",
  paver: "xz",
  gravel: "xz",
  sand: "xz",
  soil: "xz",
  concrete: "xz",
  plaster: "xy",
  metal: "xy",
  membrane: "xz",
  fence: "xy",
  grass: "xz",
};

/**
 * The texture `repeat` for one part: its own size against the finish's real-world repeat unit
 * on the two local axes `Finish.axes` picks (see the module doc). Floored so a sliver-thin part
 * never asks for a near-zero (or negative) repeat.
 */
export function repeatFor(size: Vec3, finish: Finish): [number, number] {
  const [w, h, d] = size;
  const axes = finish.axes ?? DEFAULT_AXES[finish.kind];
  const [u, v] = axes === "xy" ? [w, h] : axes === "zy" ? [d, h] : [w, d];
  const [tu, tv] = finish.unit ?? DEFAULT_UNIT[finish.kind];
  return [Math.max(0.2, Math.abs(u) / tu), Math.max(0.2, Math.abs(v) / tv)];
}

/** Per-kind PBR baseline, multiplied by the maps' own grayscale variation. `clearcoat` is a thin
 *  lacquer layer on top of the base PBR response (a glazed ceramic's "wet" look) — only used by
 *  `PartMesh` on desktop (phones keep the plain `meshStandardMaterial` path, clearcoat unused). */
interface Style {
  roughness: number;
  metalness: number;
  bumpScale: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
}
const STYLE: Record<FinishKind, Style> = {
  wood: { roughness: 0.75, metalness: 0.02, bumpScale: 0.0022 },
  wpc: { roughness: 0.6, metalness: 0.05, bumpScale: 0.0016 },
  // Ceramic: smooth and a little glossy, not bumpy — a much smaller bump than most finishes here,
  // plus a thin clearcoat for the glazed look. Floor stays a touch more matte than wall tiling.
  tile: { roughness: 0.38, metalness: 0.02, bumpScale: 0.0003, clearcoat: 0.35, clearcoatRoughness: 0.22 },
  tileWall: { roughness: 0.16, metalness: 0.02, bumpScale: 0.00018, clearcoat: 0.75, clearcoatRoughness: 0.08 },
  paver: { roughness: 0.8, metalness: 0.02, bumpScale: 0.002 },
  gravel: { roughness: 0.92, metalness: 0, bumpScale: 0.004 },
  sand: { roughness: 0.95, metalness: 0, bumpScale: 0.0018 },
  soil: { roughness: 0.95, metalness: 0, bumpScale: 0.003 },
  concrete: { roughness: 0.85, metalness: 0, bumpScale: 0.0016 },
  plaster: { roughness: 0.82, metalness: 0, bumpScale: 0.0006 },
  metal: { roughness: 0.4, metalness: 0.75, bumpScale: 0.0008 },
  membrane: { roughness: 0.88, metalness: 0, bumpScale: 0.0014 },
  fence: { roughness: 0.72, metalness: 0.02, bumpScale: 0.002 },
  grass: { roughness: 0.92, metalness: 0, bumpScale: 0.0022 },
};

/** Exposed for tests (e.g. metal reads back as far more metallic than wood). */
export function finishStyle(kind: FinishKind): Style {
  return STYLE[kind];
}

// ─────────────────────────────────────────────────────────────────────────
// Canvas generation — browser only (never called during SSR or in tests:
// Scene.tsx, the only caller, is loaded with `ssr: false`).
// ─────────────────────────────────────────────────────────────────────────

function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h || 1;
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** A tileable value-noise field: a small random grid, wrapped (mod) so RepeatWrapping never seams. */
function valueNoise(w: number, h: number, cell: number, seed: number) {
  const rng = mulberry32(seed);
  const gw = Math.max(1, Math.round(w / cell));
  const gh = Math.max(1, Math.round(h / cell));
  const grid = Array.from({ length: gw * gh }, () => rng());
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const at = (ix: number, iy: number) => grid[(((iy % gh) + gh) % gh) * gw + (((ix % gw) + gw) % gw)];
  return (x: number, y: number) => {
    const gx = (x / w) * gw;
    const gy = (y / h) * gh;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const tx = smooth(gx - x0);
    const ty = smooth(gy - y0);
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
    const bot = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
    return top + (bot - top) * ty;
  };
}

function fillNoise(ctx: CanvasRenderingContext2D, w: number, h: number, cell: number, seed: number, base: number, range: number) {
  const n = valueNoise(w, h, cell, seed);
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = base + (n(x, y) - 0.5) * range;
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Full-width horizontal streaks (straight or gently wavy — the wave's period divides the
 *  canvas width exactly, so it tiles with no seam). Used by wood, WPC and metal. */
function streaks(ctx: CanvasRenderingContext2D, rng: () => number, w: number, h: number, n: number, wavy: boolean) {
  for (let i = 0; i < n; i++) {
    const y = rng() * h;
    const dark = rng() > 0.55;
    const v = dark ? 60 + rng() * 55 : 170 + rng() * 60;
    const freq = 1 + Math.floor(rng() * 3);
    const amp = wavy ? (h / n) * 0.4 : 0;
    ctx.strokeStyle = `rgba(${v},${v},${v},${(0.3 + rng() * 0.4).toFixed(2)})`;
    ctx.lineWidth = 0.6 + rng() * 2;
    ctx.beginPath();
    if (!wavy) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    } else {
      for (let x = 0; x <= w; x += 4) {
        const yy = y + Math.sin((x / w) * Math.PI * 2 * freq) * amp;
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
    }
    ctx.stroke();
  }
}

function drawWood(ctx: CanvasRenderingContext2D, rng: () => number, w: number, h: number) {
  ctx.fillStyle = "rgb(128,128,128)";
  ctx.fillRect(0, 0, w, h);
  streaks(ctx, rng, w, h, 18, true);
  for (let i = 0; i < 2; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = 2 + rng() * 3;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(50,50,50,0.9)");
    g.addColorStop(1, "rgba(50,50,50,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWPC(ctx: CanvasRenderingContext2D, rng: () => number, w: number, h: number) {
  ctx.fillStyle = "rgb(128,128,128)";
  ctx.fillRect(0, 0, w, h);
  const grooves = 6;
  for (let i = 0; i < grooves; i++) {
    const y = ((i + 0.5) / grooves) * h;
    ctx.strokeStyle = "rgba(70,70,70,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.strokeStyle = "rgba(190,190,190,0.8)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y + 1.6);
    ctx.lineTo(w, y + 1.6);
    ctx.stroke();
  }
  streaks(ctx, rng, w, h, 30, false);
}

function drawMetal(ctx: CanvasRenderingContext2D, rng: () => number, w: number, h: number) {
  ctx.fillStyle = "rgb(128,128,128)";
  ctx.fillRect(0, 0, w, h);
  streaks(ctx, rng, w, h, 60, false);
}

function drawFence(ctx: CanvasRenderingContext2D, rng: () => number, w: number, h: number) {
  fillNoise(ctx, w, h, 16, hashSeed("fence-grain") ^ Math.floor(rng() * 1e6), 128, 60);
  const boards = 5;
  ctx.strokeStyle = "rgba(55,55,55,0.95)";
  ctx.lineWidth = Math.max(1, w * 0.012);
  for (let i = 0; i < boards; i++) {
    const x = (i / boards) * w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
}

function drawTileLike(ctx: CanvasRenderingContext2D, rng: () => number, w: number, h: number, specks: number, groutFrac: number, groutV: number) {
  ctx.fillStyle = "rgb(195,195,195)";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < specks; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const v = 160 + rng() * 80;
    ctx.fillStyle = `rgba(${v},${v},${v},0.5)`;
    const s = 1 + rng() * 1.6;
    ctx.fillRect(x, y, s, s);
  }
  // A grout/joint border flush to all four edges: adjacent repeats line up into one continuous line.
  const g = Math.max(1, Math.round(w * groutFrac));
  ctx.fillStyle = `rgb(${groutV},${groutV},${groutV})`;
  ctx.fillRect(0, 0, w, g);
  ctx.fillRect(0, h - g, w, g);
  ctx.fillRect(0, 0, g, h);
  ctx.fillRect(w - g, 0, g, h);
}

function drawTile(ctx: CanvasRenderingContext2D, rng: () => number, w: number, h: number) {
  // Floor: smooth ceramic, a thin crisp grout line — not the thick, speckled joint a paver gets.
  drawTileLike(ctx, rng, w, h, 600, 0.014, 92);
}

/** Wall tiling: glossier and smoother again than the floor — fewer, fainter specks, an even
 *  thinner grout line (see textures.ts's own module doc on why this stays a separate finish
 *  from the floor's `tile` — the two read differently enough to need their own PBR numbers). */
function drawTileWall(ctx: CanvasRenderingContext2D, rng: () => number, w: number, h: number) {
  // ~3 px of 256 per border (≈ 3–4 mm on a 30 cm tile): wide enough not to break into dashes
  // when the wall is seen at an angle.
  drawTileLike(ctx, rng, w, h, 140, 0.012, 86);
}

function drawPaver(ctx: CanvasRenderingContext2D, rng: () => number, w: number, h: number) {
  drawTileLike(ctx, rng, w, h, 220, 0.05, 118);
}

/** A dense lawn seen from above: a soft tonal base plus many short, randomly angled blade
 *  strokes in varying brightness — reads as thick turf even before any instanced blade sits on
 *  top of it (see `lawn()` in builders.ts and `Scene.tsx`'s own `Grass`). */
function drawGrassGround(ctx: CanvasRenderingContext2D, rng: () => number, w: number, h: number) {
  fillNoise(ctx, w, h, 7, hashSeed("grass-ground") ^ Math.floor(rng() * 1e6), 150, 70);
  const blades = Math.round(w * h * 0.85);
  for (let i = 0; i < blades; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const len = 1.4 + rng() * 3.2;
    const ang = rng() * Math.PI * 2;
    const v = 85 + rng() * 150;
    ctx.strokeStyle = `rgba(${v},${v},${v},${(0.3 + rng() * 0.35).toFixed(2)})`;
    ctx.lineWidth = 0.7 + rng() * 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }
}

function drawGravel(ctx: CanvasRenderingContext2D, rng: () => number, w: number, h: number) {
  fillNoise(ctx, w, h, 10, hashSeed("gravel") ^ Math.floor(rng() * 1e6), 128, 170);
  for (let i = 0; i < 180; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = 0.6 + rng() * 1.6;
    const v = rng() > 0.5 ? 40 + rng() * 40 : 205 + rng() * 40;
    ctx.fillStyle = `rgba(${v},${v},${v},0.8)`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.7, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSand(ctx: CanvasRenderingContext2D, rng: () => number, w: number, h: number) {
  fillNoise(ctx, w, h, 8, hashSeed("sand") ^ Math.floor(rng() * 1e6), 128, 70);
}

function drawSoil(ctx: CanvasRenderingContext2D, rng: () => number, w: number, h: number) {
  fillNoise(ctx, w, h, 14, hashSeed("soil") ^ Math.floor(rng() * 1e6), 128, 110);
  for (let i = 0; i < 70; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = 1 + rng() * 2.4;
    const v = 60 + rng() * 40;
    ctx.fillStyle = `rgba(${v},${v},${v},0.7)`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawConcrete(ctx: CanvasRenderingContext2D, rng: () => number, w: number, h: number) {
  fillNoise(ctx, w, h, 18, hashSeed("concrete") ^ Math.floor(rng() * 1e6), 128, 48);
}

function drawPlaster(ctx: CanvasRenderingContext2D, rng: () => number, w: number, h: number) {
  fillNoise(ctx, w, h, 10, hashSeed("plaster") ^ Math.floor(rng() * 1e6), 128, 20);
}

function drawMembrane(ctx: CanvasRenderingContext2D, rng: () => number, w: number, h: number) {
  ctx.fillStyle = "rgb(128,128,128)";
  ctx.fillRect(0, 0, w, h);
  const period = 16; // divides 128 exactly, so the weave tiles without a seam
  for (let x = 0; x < w; x += period) {
    const v = 170 + (rng() - 0.5) * 24;
    ctx.strokeStyle = `rgba(${v},${v},${v},0.55)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += period) {
    const v = 95 + (rng() - 0.5) * 24;
    ctx.strokeStyle = `rgba(${v},${v},${v},0.55)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

const CANVAS_SIZE: Record<FinishKind, [number, number]> = {
  wood: [256, 64],
  wpc: [256, 64],
  tile: [256, 256],
  tileWall: [256, 256],
  paver: [128, 128],
  gravel: [128, 128],
  sand: [128, 128],
  soil: [128, 128],
  concrete: [128, 128],
  plaster: [128, 128],
  metal: [160, 64],
  membrane: [128, 128],
  fence: [128, 128],
  grass: [160, 160],
};

const DRAW: Record<FinishKind, (ctx: CanvasRenderingContext2D, rng: () => number, w: number, h: number) => void> = {
  wood: drawWood,
  wpc: drawWPC,
  tile: drawTile,
  tileWall: drawTileWall,
  paver: drawPaver,
  gravel: drawGravel,
  sand: drawSand,
  soil: drawSoil,
  concrete: drawConcrete,
  plaster: drawPlaster,
  metal: drawMetal,
  membrane: drawMembrane,
  fence: drawFence,
  grass: drawGrassGround,
};

interface DeriveSpec {
  colorBase: number;
  colorRange: number;
  roughBase: number;
  roughRange: number;
}
const DERIVE: Record<FinishKind, DeriveSpec> = {
  wood: { colorBase: 232, colorRange: 60, roughBase: 220, roughRange: 55 },
  wpc: { colorBase: 236, colorRange: 34, roughBase: 210, roughRange: 45 },
  tile: { colorBase: 248, colorRange: 30, roughBase: 236, roughRange: 30 },
  // Enough range that the grout reads as a joint (~10% darker), not a faint scratch.
  tileWall: { colorBase: 246, colorRange: 64, roughBase: 240, roughRange: 18 },
  paver: { colorBase: 228, colorRange: 46, roughBase: 222, roughRange: 42 },
  gravel: { colorBase: 222, colorRange: 68, roughBase: 236, roughRange: 24 },
  sand: { colorBase: 236, colorRange: 34, roughBase: 240, roughRange: 16 },
  soil: { colorBase: 216, colorRange: 62, roughBase: 240, roughRange: 16 },
  concrete: { colorBase: 230, colorRange: 32, roughBase: 228, roughRange: 26 },
  plaster: { colorBase: 244, colorRange: 14, roughBase: 236, roughRange: 12 },
  metal: { colorBase: 224, colorRange: 46, roughBase: 196, roughRange: 55 },
  membrane: { colorBase: 226, colorRange: 40, roughBase: 232, roughRange: 20 },
  fence: { colorBase: 224, colorRange: 58, roughBase: 216, roughRange: 38 },
  grass: { colorBase: 222, colorRange: 85, roughBase: 236, roughRange: 20 },
};

function remap(src: HTMLCanvasElement, f: (v: number) => number): HTMLCanvasElement {
  const { width: w, height: h } = src;
  const sctx = src.getContext("2d");
  const out = makeCanvas(w, h);
  const octx = out.getContext("2d");
  if (!sctx || !octx) return out;
  const data = sctx.getImageData(0, 0, w, h);
  const od = octx.createImageData(w, h);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = Math.max(0, Math.min(255, Math.round(f(data.data[i]))));
    od.data[i] = od.data[i + 1] = od.data[i + 2] = v;
    od.data[i + 3] = 255;
  }
  octx.putImageData(od, 0, 0);
  return out;
}

interface KindCanvases {
  color: HTMLCanvasElement;
  rough: HTMLCanvasElement;
  bump: HTMLCanvasElement;
}
const canvasCache = new Map<FinishKind, KindCanvases>();

/** A blurred copy (where the browser supports canvas filters; otherwise the original). */
function softened(src: HTMLCanvasElement, px: number): HTMLCanvasElement {
  const out = makeCanvas(src.width, src.height);
  const ctx = out.getContext("2d");
  if (!ctx || !("filter" in ctx)) return src;
  ctx.filter = `blur(${px}px)`;
  // Draw the 3 × 3 neighbourhood so the blur wraps like the repeating texture does.
  for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) ctx.drawImage(src, dx * src.width, dy * src.height);
  return out;
}

function canvasesFor(kind: FinishKind): KindCanvases {
  const cached = canvasCache.get(kind);
  if (cached) return cached;
  const [w, h] = CANVAS_SIZE[kind];
  const pattern = makeCanvas(w, h);
  const ctx = pattern.getContext("2d");
  if (ctx) DRAW[kind](ctx, mulberry32(hashSeed(kind)), w, h);
  const spec = DERIVE[kind];
  const color = remap(pattern, (v) => spec.colorBase + ((v - 128) * spec.colorRange) / 128);
  const rough = remap(pattern, (v) => spec.roughBase + ((v - 128) * spec.roughRange) / 128);
  // Glazed tile: a hard 1-px step in the bump map makes the clearcoat glint along every grout
  // line (white dashes); a softened edge reads as a rounded, recessed joint instead.
  const bump = kind === "tile" || kind === "tileWall" ? softened(pattern, 1.2) : pattern;
  const set: KindCanvases = { color, rough, bump };
  canvasCache.set(kind, set);
  return set;
}

export interface FinishTextureSet {
  map: THREE.Texture;
  roughnessMap: THREE.Texture;
  bumpMap: THREE.Texture;
  bumpScale: number;
  roughness: number;
  metalness: number;
  /** A thin glazed/lacquer layer (ceramic tile only, desktop) — see `Style`'s own doc. */
  clearcoat?: number;
  clearcoatRoughness?: number;
}

const textureCache = new Map<string, FinishTextureSet>();

/**
 * Everything a `<meshStandardMaterial>` needs for a finish, sized to this part: the three
 * canvases are generated once per KIND (cached above); only the lightweight `Texture` wrapper
 * (with its own `repeat`) is created per distinct size, and that too is cached and shared by
 * every other part asking for the same finish at the same size (very common — e.g. every deck
 * board in a run shares the same length).
 */
export function finishTextures(finish: Finish, size: Vec3): FinishTextureSet {
  const [rx, ry] = repeatFor(size, finish);
  const key = `${finish.kind}:${rx.toFixed(2)}:${ry.toFixed(2)}`;
  const cached = textureCache.get(key);
  if (cached) return cached;
  const c = canvasesFor(finish.kind);
  const style = STYLE[finish.kind];
  const map = new THREE.CanvasTexture(c.color);
  map.colorSpace = THREE.SRGBColorSpace;
  const roughnessMap = new THREE.CanvasTexture(c.rough);
  const bumpMap = new THREE.CanvasTexture(c.bump);
  for (const t of [map, roughnessMap, bumpMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    // Boards, tiles and pavers are mostly seen at a slant: without anisotropic filtering their
    // fine lines blur or break into dashes there (three.js clamps this to what the GPU allows).
    t.anisotropy = 8;
    t.needsUpdate = true;
  }
  const set: FinishTextureSet = {
    map,
    roughnessMap,
    bumpMap,
    bumpScale: style.bumpScale,
    roughness: style.roughness,
    metalness: style.metalness,
    clearcoat: style.clearcoat,
    clearcoatRoughness: style.clearcoatRoughness,
  };
  textureCache.set(key, set);
  return set;
}
