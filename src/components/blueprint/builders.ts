import type { ProjectType } from "@/domain/calculators";
import type { Lang } from "@/domain/types";

/**
 * Procedural 3D "assemblies" for each project type, generated from the same
 * inputs the calculators used. Each part belongs to a layer (a material role)
 * so the shopping list and the model can highlight each other.
 */

export type Vec3 = [number, number, number];

export type Grow = "drop" | "rise" | "pop" | "slide" | "fade";

export interface Part {
  id: string;
  layer: string;
  pos: Vec3;
  size: Vec3;
  color: string;
  delay: number;
  grow: Grow;
  opacity?: number;
  /** Structural context (walls, slab) — not something you buy. */
  context?: boolean;
}

export interface DimLine {
  from: Vec3;
  to: Vec3;
  label: string;
}

export interface Layer {
  id: string;
  label: string;
  color: string;
}

export interface Build {
  parts: Part[];
  dims: DimLine[];
  extent: Vec3;
  layers: Layer[];
  grass?: { w: number; d: number; count: number; delay: number };
  duration: number;
}

const m = (n: number, lang: Lang) => `${n.toLocaleString(lang === "en" ? "en-GB" : "ro-RO", { maximumFractionDigits: 2 })} m`;
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : d);

const C = {
  slab: "#b9b2a4",
  wall: "#e7e1d4",
  wood: "#c9935a",
  woodDark: "#8e6038",
  support: "#4d4f52",
  membrane: "#2c2f33",
  paint: "#8fa98a",
  tape: "#3d7cff",
  foil: "#d9e8ff",
  laminate: ["#c8a172", "#bf966a", "#cfa97b", "#b98f63"],
  underlay: "#6ea6dd",
  vapor: "#e8f1ff",
  tileFloor: ["#cfcac1", "#c7c2b8"],
  tileWall: ["#f3f1ec", "#ebe8e1"],
  waterproof: "#5c7d99",
  stud: "#a3acb6",
  wool: "#e9c343",
  board: "#eeebe4",
  fence: "#a8743f",
  post: "#6b4a2e",
  concrete: "#8f8f8f",
  soil: "#5a4230",
  topsoil: "#6b4f37",
};

function roomShell(L: number, W: number, H: number, lowH: number, parts: Part[]) {
  const t = 0.1;
  parts.push({ id: "slab", layer: "structure", pos: [0, -0.03, 0], size: [L + 2 * t, 0.06, W + 2 * t], color: C.slab, delay: 0, grow: "fade", context: true });
  parts.push({ id: "wall-back", layer: "structure", pos: [0, H / 2, -W / 2 - t / 2], size: [L + 2 * t, H, t], color: C.wall, delay: 0, grow: "rise", context: true });
  parts.push({ id: "wall-left", layer: "structure", pos: [-L / 2 - t / 2, H / 2, 0], size: [t, H, W], color: C.wall, delay: 0.1, grow: "rise", context: true });
  parts.push({ id: "wall-front", layer: "structure", pos: [0, lowH / 2, W / 2 + t / 2], size: [L + 2 * t, lowH, t], color: C.wall, delay: 0.15, grow: "rise", context: true });
  parts.push({ id: "wall-right", layer: "structure", pos: [L / 2 + t / 2, lowH / 2, 0], size: [t, lowH, W], color: C.wall, delay: 0.2, grow: "rise", context: true });
}

function deck(inputs: Record<string, unknown>, lang: Lang): Build {
  const L = num(inputs.lengthM, 4);
  const W = num(inputs.widthM, 3);
  const parts: Part[] = [];
  const supH = 0.08;
  const joistH = 0.07;
  const J = Math.ceil(L / 0.4) + 1;
  const S = Math.ceil(W / 0.6) + 1;
  const R = Math.ceil(W / 0.15);

  if (inputs.base !== "concrete_slab") {
    parts.push({ id: "membrane", layer: "weed_membrane", pos: [0, 0.003, 0], size: [L + 0.2, 0.006, W + 0.2], color: C.membrane, delay: 0, grow: "fade" });
  } else {
    parts.push({ id: "slab", layer: "structure", pos: [0, -0.05, 0], size: [L + 0.3, 0.1, W + 0.3], color: C.slab, delay: 0, grow: "fade", context: true });
  }
  const stepS = Math.max(1, Math.ceil((J * S) / 180));
  let k = 0;
  for (let i = 0; i < J; i++) {
    const x = -L / 2 + (i * L) / (J - 1);
    for (let j = 0; j < S; j++) {
      if ((i * S + j) % stepS !== 0) continue;
      const z = -W / 2 + (j * W) / (S - 1);
      parts.push({ id: `sup-${i}-${j}`, layer: "deck_support", pos: [x, supH / 2, z], size: [0.1, supH, 0.1], color: C.support, delay: 0.3 + (k++ * 0.9) / (J * S / stepS), grow: "pop" });
    }
    parts.push({ id: `joist-${i}`, layer: "deck_joist", pos: [x, supH + joistH / 2, 0], size: [0.045, joistH, W], color: C.woodDark, delay: 1.2 + i * (1 / J), grow: "drop" });
  }
  const top = supH + joistH;
  for (let r = 0; r < R; r++) {
    const z = Math.min(-W / 2 + 0.0725 + r * 0.15, W / 2 - 0.0725);
    parts.push({ id: `board-${r}`, layer: "deck_board", pos: [0, top + 0.014, z], size: [L, 0.028, 0.145], color: r % 2 ? C.wood : "#c28c55", delay: 2.4 + r * (2.2 / R), grow: "slide" });
  }
  return {
    parts,
    dims: [
      { from: [-L / 2, 0, W / 2 + 0.45], to: [L / 2, 0, W / 2 + 0.45], label: m(L, lang) },
      { from: [L / 2 + 0.45, 0, -W / 2], to: [L / 2 + 0.45, 0, W / 2], label: m(W, lang) },
    ],
    extent: [L, 0.3, W],
    layers: [
      { id: "weed_membrane", label: lang === "en" ? "Weed membrane" : "Geotextil", color: C.membrane },
      { id: "deck_support", label: lang === "en" ? "Adjustable supports" : "Suporturi reglabile", color: C.support },
      { id: "deck_joist", label: lang === "en" ? "Joists" : "Grinzi", color: C.woodDark },
      { id: "deck_board", label: lang === "en" ? "Deck boards" : "Deck", color: C.wood },
    ],
    duration: 5,
  };
}

function fence(inputs: Record<string, unknown>, lang: Lang): Build {
  const len = num(inputs.lengthM, 20);
  const H = num(inputs.heightM, 1.8);
  const N = Math.ceil(len / 1.89 - 1e-9);
  const total = N * 1.89;
  const x0 = -total / 2;
  const parts: Part[] = [];
  const perStep = Math.min(0.12, 3 / N);
  for (let i = 0; i <= N; i++) {
    const x = x0 + i * 1.89;
    parts.push({ id: `foot-${i}`, layer: "post_concrete", pos: [x, -0.3, 0], size: [0.28, 0.6, 0.28], color: C.concrete, delay: i * perStep * 0.6, grow: "pop" });
    parts.push({ id: `post-${i}`, layer: "fence_post", pos: [x, (H + 0.1) / 2, 0], size: [0.09, H + 0.1, 0.09], color: C.post, delay: 0.6 + i * perStep, grow: "rise" });
    parts.push({ id: `cap-${i}`, layer: "post_cap", pos: [x, H + 0.12, 0], size: [0.12, 0.03, 0.12], color: "#3b3b3b", delay: 3.6 + i * perStep * 0.5, grow: "drop" });
  }
  for (let i = 0; i < N; i++) {
    const x = x0 + i * 1.89 + 0.945;
    parts.push({ id: `panel-${i}`, layer: "fence_panel", pos: [x, H / 2 + 0.05, 0], size: [1.8, H * 0.97, 0.035], color: i % 2 ? C.fence : "#b17c46", delay: 1.6 + i * perStep * 1.2, grow: "slide" });
  }
  parts.push({ id: "ground", layer: "structure", pos: [0, -0.005, 0], size: [total + 1.5, 0.01, 2.4], color: "#6d8b58", delay: 0, grow: "fade", context: true, opacity: 0.5 });
  return {
    parts,
    dims: [
      { from: [x0, 0, 0.8], to: [x0 + total, 0, 0.8], label: m(len, lang) },
      { from: [x0 - 0.4, 0, 0], to: [x0 - 0.4, H, 0], label: m(H, lang) },
    ],
    extent: [total, H, 2],
    layers: [
      { id: "post_concrete", label: lang === "en" ? "Concrete footings" : "Fundații beton", color: C.concrete },
      { id: "fence_post", label: lang === "en" ? "Posts" : "Stâlpi", color: C.post },
      { id: "fence_panel", label: lang === "en" ? "Panels" : "Panouri", color: C.fence },
      { id: "post_cap", label: lang === "en" ? "Post caps" : "Capace", color: "#3b3b3b" },
    ],
    duration: 4.5,
  };
}

function paintRoom(inputs: Record<string, unknown>, lang: Lang): Build {
  const L = num(inputs.lengthM, 4);
  const W = num(inputs.widthM, 3.5);
  const H = num(inputs.heightM, 2.6);
  const parts: Part[] = [];
  roomShell(L, W, H, 0.4, parts);
  parts.push({ id: "foil", layer: "protective_foil", pos: [0, 0.004, 0], size: [L - 0.1, 0.006, W - 0.1], color: C.foil, delay: 0.4, grow: "fade", opacity: 0.7 });
  parts.push({ id: "tape-back", layer: "painters_tape", pos: [0, H - 0.015, -W / 2 + 0.006], size: [L, 0.03, 0.01], color: C.tape, delay: 0.8, grow: "slide" });
  parts.push({ id: "tape-left", layer: "painters_tape", pos: [-L / 2 + 0.006, H - 0.015, 0], size: [0.01, 0.03, W], color: C.tape, delay: 0.9, grow: "slide" });
  const doors = typeof inputs.doors === "number" ? inputs.doors : 1;
  const windows = typeof inputs.windows === "number" ? inputs.windows : 1;
  parts.push({ id: "paint-back", layer: "interior_paint", pos: [0, H / 2, -W / 2 + 0.004], size: [L, H - 0.04, 0.008], color: C.paint, delay: 1.3, grow: "rise" });
  parts.push({ id: "paint-left", layer: "interior_paint", pos: [-L / 2 + 0.004, H / 2, 0], size: [0.008, H - 0.04, W], color: C.paint, delay: 2.0, grow: "rise" });
  for (let i = 0; i < Math.min(windows, 3); i++) {
    const x = -L / 2 + ((i + 1) * L) / (Math.min(windows, 3) + 1);
    parts.push({ id: `window-${i}`, layer: "structure", pos: [x, 1.55, -W / 2 + 0.012], size: [1.2, 1.4, 0.01], color: "#bcd8f5", delay: 0.3, grow: "fade", context: true });
  }
  for (let i = 0; i < Math.min(doors, 2); i++) {
    const z = W / 2 - 0.7 - i * 1.2;
    parts.push({ id: `door-${i}`, layer: "structure", pos: [-L / 2 + 0.012, 1.05, z], size: [0.01, 2.1, 0.9], color: "#7a5a3e", delay: 0.3, grow: "fade", context: true });
  }
  if (inputs.paintCeiling !== false) {
    parts.push({ id: "ceiling", layer: "interior_paint", pos: [0, H + 0.01, 0], size: [L, 0.01, W], color: C.paint, delay: 2.8, grow: "fade", opacity: 0.22 });
  }
  return {
    parts,
    dims: [
      { from: [-L / 2, 0, W / 2 + 0.5], to: [L / 2, 0, W / 2 + 0.5], label: m(L, lang) },
      { from: [L / 2 + 0.5, 0, -W / 2], to: [L / 2 + 0.5, 0, W / 2], label: m(W, lang) },
      { from: [L / 2 + 0.3, 0, -W / 2 - 0.2], to: [L / 2 + 0.3, H, -W / 2 - 0.2], label: m(H, lang) },
    ],
    extent: [L, H, W],
    layers: [
      { id: "protective_foil", label: lang === "en" ? "Protective sheeting" : "Folie protecție", color: C.foil },
      { id: "painters_tape", label: lang === "en" ? "Masking tape" : "Bandă mascare", color: C.tape },
      { id: "interior_paint", label: lang === "en" ? "Paint" : "Vopsea", color: C.paint },
    ],
    duration: 4,
  };
}

function laminate(inputs: Record<string, unknown>, lang: Lang): Build {
  const L = num(inputs.lengthM, 5);
  const W = num(inputs.widthM, 4);
  const parts: Part[] = [];
  roomShell(L, W, 2.6, 0.5, parts);
  if (inputs.subfloor !== "wood") {
    parts.push({ id: "vapor", layer: "vapor_barrier", pos: [0, 0.002, 0], size: [L, 0.003, W], color: C.vapor, delay: 0.3, grow: "fade", opacity: 0.8 });
  }
  parts.push({ id: "underlay", layer: "underlay", pos: [0, 0.006, 0], size: [L, 0.004, W], color: C.underlay, delay: 0.7, grow: "slide" });
  const pw = 0.193;
  const pl = 1.285;
  const rows = Math.ceil(W / pw);
  const maxParts = 420;
  const perRow = Math.ceil(L / pl) + 1;
  const scale = rows * perRow > maxParts ? Math.ceil((rows * perRow) / maxParts) : 1;
  const plankL = pl * scale;
  for (let r = 0; r < rows; r++) {
    const z = -W / 2 + pw / 2 + r * pw;
    const zc = Math.min(z, W / 2 - pw / 2);
    let x = -L / 2 - ((r * 0.43 * scale) % plankL);
    let k = 0;
    while (x < L / 2) {
      const a = Math.max(x, -L / 2);
      const b = Math.min(x + plankL, L / 2);
      if (b - a > 0.05) {
        parts.push({
          id: `plank-${r}-${k}`,
          layer: "laminate",
          pos: [(a + b) / 2, 0.013, zc],
          size: [b - a - 0.004, 0.009, pw - 0.003],
          color: C.laminate[(r * 3 + k) % C.laminate.length],
          delay: 1.2 + r * (2.6 / rows) + k * 0.04,
          grow: "drop",
        });
      }
      x += plankL;
      k++;
    }
  }
  const sk = 0.06;
  parts.push({ id: "sk-back", layer: "skirting_board", pos: [0, 0.018 + sk / 2, -W / 2 + 0.008], size: [L, sk, 0.015], color: "#f4f1ea", delay: 4.0, grow: "slide" });
  parts.push({ id: "sk-left", layer: "skirting_board", pos: [-L / 2 + 0.008, 0.018 + sk / 2, 0], size: [0.015, sk, W], color: "#f4f1ea", delay: 4.2, grow: "slide" });
  return {
    parts,
    dims: [
      { from: [-L / 2, 0, W / 2 + 0.5], to: [L / 2, 0, W / 2 + 0.5], label: m(L, lang) },
      { from: [L / 2 + 0.5, 0, -W / 2], to: [L / 2 + 0.5, 0, W / 2], label: m(W, lang) },
    ],
    extent: [L, 1, W],
    layers: [
      { id: "vapor_barrier", label: lang === "en" ? "Vapour barrier" : "Barieră vapori", color: C.vapor },
      { id: "underlay", label: lang === "en" ? "Underlay" : "Folie parchet", color: C.underlay },
      { id: "laminate", label: lang === "en" ? "Laminate" : "Parchet", color: C.laminate[0] },
      { id: "skirting_board", label: lang === "en" ? "Skirting" : "Plintă", color: "#f4f1ea" },
    ],
    duration: 4.8,
  };
}

function tiling(inputs: Record<string, unknown>, lang: Lang): Build {
  const L = num(inputs.lengthM, 2.5);
  const W = num(inputs.widthM, 2);
  const wallH = typeof inputs.wallTileHeightM === "number" ? inputs.wallTileHeightM : inputs.roomType === "bathroom" ? 2.1 : 0;
  const tileFloor = inputs.tileFloor !== false;
  const s = inputs.largeFormat === false ? 0.3 : 0.6;
  const parts: Part[] = [];
  roomShell(L, W, 2.6, 0.45, parts);
  if (inputs.roomType === "bathroom" || inputs.roomType === undefined) {
    parts.push({ id: "wp", layer: "waterproofing", pos: [0, 0.003, 0], size: [L, 0.005, W], color: C.waterproof, delay: 0.3, grow: "fade" });
    parts.push({ id: "wp-back", layer: "waterproofing", pos: [0, 0.1, -W / 2 + 0.003], size: [L, 0.2, 0.005], color: C.waterproof, delay: 0.4, grow: "rise" });
  }
  if (tileFloor) {
    const nx = Math.ceil(L / s);
    const nz = Math.ceil(W / s);
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const a = -L / 2 + i * s;
        const b = Math.min(a + s, L / 2);
        const c = -W / 2 + j * s;
        const d = Math.min(c + s, W / 2);
        parts.push({ id: `ft-${i}-${j}`, layer: "floor_tiles", pos: [(a + b) / 2, 0.011, (c + d) / 2], size: [b - a - 0.004, 0.01, d - c - 0.004], color: C.tileFloor[(i + j) % 2], delay: 0.9 + (i + j) * (1.6 / (nx + nz)), grow: "drop" });
      }
    }
  }
  if (wallH > 0) {
    const th = 0.3;
    const tw = 0.6;
    const rows = Math.ceil(wallH / th);
    for (let r = 0; r < rows; r++) {
      const y0 = r * th;
      const h = Math.min(th, wallH - y0);
      for (let c = 0; c < Math.ceil(L / tw); c++) {
        const a = -L / 2 + c * tw;
        const b = Math.min(a + tw, L / 2);
        parts.push({ id: `wb-${r}-${c}`, layer: "wall_tiles", pos: [(a + b) / 2, y0 + h / 2, -W / 2 + 0.008], size: [b - a - 0.004, h - 0.004, 0.008], color: C.tileWall[(r + c) % 2], delay: 2.4 + r * 0.16 + c * 0.02, grow: "pop" });
      }
      for (let c = 0; c < Math.ceil(W / tw); c++) {
        const a = -W / 2 + c * tw;
        const b = Math.min(a + tw, W / 2);
        parts.push({ id: `wl-${r}-${c}`, layer: "wall_tiles", pos: [-L / 2 + 0.008, y0 + h / 2, (a + b) / 2], size: [0.008, h - 0.004, b - a - 0.004], color: C.tileWall[(r + c + 1) % 2], delay: 2.5 + r * 0.16 + c * 0.02, grow: "pop" });
      }
    }
  }
  return {
    parts,
    dims: [
      { from: [-L / 2, 0, W / 2 + 0.5], to: [L / 2, 0, W / 2 + 0.5], label: m(L, lang) },
      { from: [L / 2 + 0.5, 0, -W / 2], to: [L / 2 + 0.5, 0, W / 2], label: m(W, lang) },
      ...(wallH > 0 ? [{ from: [-L / 2 - 0.35, 0, -W / 2] as Vec3, to: [-L / 2 - 0.35, wallH, -W / 2] as Vec3, label: m(wallH, lang) }] : []),
    ],
    extent: [L, 2.6, W],
    layers: [
      { id: "waterproofing", label: lang === "en" ? "Waterproofing" : "Hidroizolație", color: C.waterproof },
      { id: "floor_tiles", label: lang === "en" ? "Floor tiles" : "Gresie", color: C.tileFloor[0] },
      { id: "wall_tiles", label: lang === "en" ? "Wall tiles" : "Faianță", color: C.tileWall[0] },
    ],
    duration: 4.5,
  };
}

function drywall(inputs: Record<string, unknown>, lang: Lang): Build {
  const L = num(inputs.lengthM, 3.5);
  const H = num(inputs.heightM, 2.6);
  const doors = typeof inputs.doors === "number" ? Math.min(inputs.doors, 2) : 0;
  const parts: Part[] = [];
  parts.push({ id: "floor", layer: "structure", pos: [0, -0.03, 0], size: [L + 1.2, 0.06, 2.4], color: C.slab, delay: 0, grow: "fade", context: true });
  parts.push({ id: "uw-bottom", layer: "uw_profile", pos: [0, 0.02, 0], size: [L, 0.04, 0.075], color: C.stud, delay: 0.2, grow: "slide" });
  parts.push({ id: "uw-top", layer: "uw_profile", pos: [0, H - 0.02, 0], size: [L, 0.04, 0.075], color: C.stud, delay: 0.4, grow: "slide" });
  const doorX = doors > 0 ? L / 2 - 1.3 : null;
  const studs = Math.ceil(L / 0.6) + 1;
  const xs: number[] = [];
  for (let i = 0; i < studs; i++) xs.push(-L / 2 + Math.min(i * 0.6, L));
  if (doorX !== null) xs.push(doorX - 0.45, doorX + 0.45);
  xs.sort((a, b) => a - b);
  xs.forEach((x, i) => {
    const inDoor = doorX !== null && x > doorX - 0.44 && x < doorX + 0.44;
    if (inDoor) return;
    parts.push({ id: `cw-${i}`, layer: "cw_profile", pos: [x, H / 2, 0], size: [0.05, H - 0.08, 0.075], color: C.stud, delay: 0.7 + i * 0.08, grow: "rise" });
  });
  if (doorX !== null) {
    parts.push({ id: "header", layer: "uw_profile", pos: [doorX, 2.05, 0], size: [0.9, 0.04, 0.075], color: C.stud, delay: 1.6, grow: "slide" });
  }
  if (inputs.insulation !== false) {
    for (let i = 0; i < xs.length - 1; i++) {
      const a = xs[i] + 0.03;
      const b = xs[i + 1] - 0.03;
      const mid = (a + b) / 2;
      if (b - a < 0.1) continue;
      if (doorX !== null && mid > doorX - 0.45 && mid < doorX + 0.45) continue;
      parts.push({ id: `wool-${i}`, layer: "mineral_wool", pos: [mid, H / 2, 0], size: [b - a, H - 0.1, 0.05], color: C.wool, delay: 2.0 + i * 0.07, grow: "fade" });
    }
  }
  const sheets = Math.ceil(L / 1.2);
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i < sheets; i++) {
      const a = -L / 2 + i * 1.2;
      const b = Math.min(a + 1.2, L / 2);
      const z = side === 0 ? 0.045 : -0.045;
      const boardH = doorX !== null && (a + b) / 2 > doorX - 0.6 && (a + b) / 2 < doorX + 0.6 ? H - 2.1 : H;
      const y = boardH === H ? H / 2 : H - boardH / 2;
      parts.push({ id: `gk-${side}-${i}`, layer: "drywall_board", pos: [(a + b) / 2, y, z], size: [b - a - 0.004, boardH, 0.0125], color: C.board, delay: 3.0 + side * 0.9 + i * 0.12, grow: "slide", opacity: side === 0 ? 0.92 : 1 });
    }
  }
  return {
    parts,
    dims: [
      { from: [-L / 2, 0, 0.7], to: [L / 2, 0, 0.7], label: m(L, lang) },
      { from: [-L / 2 - 0.35, 0, 0], to: [-L / 2 - 0.35, H, 0], label: m(H, lang) },
    ],
    extent: [L, H, 1.2],
    layers: [
      { id: "uw_profile", label: lang === "en" ? "UW tracks" : "Profile UW", color: C.stud },
      { id: "cw_profile", label: lang === "en" ? "CW studs" : "Montanți CW", color: C.stud },
      { id: "mineral_wool", label: lang === "en" ? "Mineral wool" : "Vată minerală", color: C.wool },
      { id: "drywall_board", label: lang === "en" ? "Plasterboard" : "Gips-carton", color: C.board },
    ],
    duration: 5,
  };
}

function lawn(inputs: Record<string, unknown>, lang: Lang): Build {
  const area = num(inputs.areaM2, 80);
  const w = Math.sqrt(area * 1.4);
  const d = area / w;
  const parts: Part[] = [
    { id: "soil", layer: "structure", pos: [0, -0.1, 0], size: [w, 0.2, d], color: C.soil, delay: 0, grow: "rise", context: true },
    { id: "topsoil", layer: "topsoil", pos: [0, 0.01, 0], size: [w, 0.02, d], color: C.topsoil, delay: 0.6, grow: "slide" },
  ];
  return {
    parts,
    dims: [
      { from: [-w / 2, 0, d / 2 + 0.6], to: [w / 2, 0, d / 2 + 0.6], label: m(Math.round(w * 10) / 10, lang) },
      { from: [w / 2 + 0.6, 0, -d / 2], to: [w / 2 + 0.6, 0, d / 2], label: m(Math.round(d * 10) / 10, lang) },
    ],
    extent: [w, 0.4, d],
    layers: [
      { id: "topsoil", label: lang === "en" ? "Lawn soil" : "Pământ gazon", color: C.topsoil },
      { id: "grass_seed", label: lang === "en" ? "Grass" : "Gazon", color: "#5fa04a" },
    ],
    grass: { w, d, count: Math.min(4200, Math.round(area * 40)), delay: 1.4 },
    duration: 4.5,
  };
}

const BUILDERS: Record<ProjectType, (i: Record<string, unknown>, lang: Lang) => Build> = {
  deck,
  fence,
  paint_room: paintRoom,
  laminate_floor: laminate,
  tiling,
  drywall_partition: drywall,
  lawn,
};

export function buildScene(type: ProjectType, inputs: Record<string, unknown>, lang: Lang): Build {
  return (BUILDERS[type] ?? deck)(inputs ?? {}, lang);
}
