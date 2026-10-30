import type { ProjectType } from "@/domain/calculators";
import { ITEMS, isOutdoor, itemRole, rotXZ } from "@/domain/items";
import type { ItemKind } from "@/domain/items";
import { defaultLayout, exposedEdges, fenceSegments, itemContainer, SIDES } from "@/domain/layout";
import type { Layout, Opening, Side, Zone } from "@/domain/layout";
import { shades } from "@/domain/look";
import { PAVING_BUILDUP, pavingDepth } from "@/domain/paving";
import { DECK_JOIST_SPACING, deckFrameFor, deckFrameSides } from "@/domain/patterns";
import type { Look } from "@/domain/look";
import type { Lang } from "@/domain/types";
import { MATERIAL_ROLES } from "@/domain/types";
import { diagonalBoards, frameBoards } from "./detail/deckBoards";
import { bondUnit, paverPieces } from "./detail/pavingBond";
import { pedestalGrid } from "./detail/pedestals";
import { prismOf } from "./detail/prism";
import type { Pt, PrismShape } from "./detail/prism";
import type { Finish } from "./textures";

/**
 * Procedural 3D "assemblies" drawn from the project layout — the same layout the
 * calculators use, so the sketch and the shopping list always agree. Part ids are
 * stable across edits (zone/segment based), which lets the scene animate only
 * what an edit added or changed.
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
  /** The REAL view's procedural material (see textures.ts) — flat colour without it. */
  finish?: Finish;
  /**
   * Explicit geometry for the handful of furniture/BBQ/lamp highlights that read wrong as a box
   * (see `itemBoxes` below) — everything else infers its shape from layer/finish instead (see
   * `./detail/shapes.ts`'s `shapeFor`), so this stays rare and intentional.
   */
  shape?: "cylinder" | "cone" | "sphere" | PrismShape;
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
  /** Plan centre [x, z] of the drawing; the scene recentres on it (smoothly after an edit). */
  center?: [number, number];
  layers: Layer[];
  grass?: { zones: { x: number; z: number; w: number; d: number }[]; count: number; delay: number };
  duration: number;
  /** A cut-away room (see `roomShell`): only the south/east walls are low/open — the camera (see
   *  `cameraPresets.ts`'s `tourArcFor`) should never swing round to the tall walls' backs. */
  interior?: boolean;
  /** A garden/outdoor project (deck, fence, paving, lawn) — `Scene.tsx`'s REAL-mode ground halo
   *  (see `GroundHalo`) tints itself grass-green for these, a floor tone for everything else. */
  outdoor?: boolean;
}

const m = (n: number, lang: Lang) => `${n.toLocaleString(lang === "en" ? "en-GB" : "ro-RO", { maximumFractionDigits: 2 })} m`;

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
  gate: "#7a5230",
  post: "#6b4a2e",
  concrete: "#8f8f8f",
  soil: "#5a4230",
  topsoil: "#6b4f37",
  door: "#7a5a3e",
  window: "#bcd8f5",
  profile: "#b8bec6",
  paver: "#a19d96",
  gravel: "#8b8781",
  sand: "#d9c49b",
  kerb: "#b4b0a8",
  lawnEdge: "#6d8b58",
};

const zoneDims = (zones: Zone[], lang: Lang, y = 0): DimLine[] =>
  zones.length > 3
    ? []
    : zones.flatMap((z) => [
        { from: [z.x, y, z.z + z.d + 0.4] as Vec3, to: [z.x + z.w, y, z.z + z.d + 0.4] as Vec3, label: m(z.w, lang) },
        { from: [z.x + z.w + 0.4, y, z.z] as Vec3, to: [z.x + z.w + 0.4, y, z.z + z.d] as Vec3, label: m(z.d, lang) },
      ]);

function centerOf(zones: Zone[]): [number, number] {
  const minX = Math.min(...zones.map((z) => z.x));
  const maxX = Math.max(...zones.map((z) => z.x + z.w));
  const minZ = Math.min(...zones.map((z) => z.z));
  const maxZ = Math.max(...zones.map((z) => z.z + z.d));
  return [(minX + maxX) / 2, (minZ + maxZ) / 2];
}

function extentOf(zones: Zone[], h: number): Vec3 {
  const minX = Math.min(...zones.map((z) => z.x));
  const maxX = Math.max(...zones.map((z) => z.x + z.w));
  const minZ = Math.min(...zones.map((z) => z.z));
  const maxZ = Math.max(...zones.map((z) => z.z + z.d));
  return [maxX - minX, h, maxZ - minZ];
}

/** Low cut-away walls around the outline of the zones (walls on shared edges are omitted). */
function outlineWalls(zones: Zone[], wallH: number, parts: Part[]) {
  const t = 0.1;
  exposedEdges(zones).forEach((e, i) => {
    const horizontal = e.side === "n" || e.side === "s";
    const len = horizontal ? Math.abs(e.x2 - e.x1) : Math.abs(e.z2 - e.z1);
    const cx = horizontal ? (e.x1 + e.x2) / 2 : e.x1 + (e.side === "w" ? -t / 2 : t / 2);
    const cz = horizontal ? e.z1 + (e.side === "n" ? -t / 2 : t / 2) : (e.z1 + e.z2) / 2;
    parts.push({
      id: `wall-${e.side}-${i}`,
      layer: "structure",
      pos: [cx, wallH / 2, cz],
      size: horizontal ? [len + t, wallH, t] : [t, wallH, len + t],
      color: C.wall,
      delay: 0.05 * i,
      grow: "rise",
      context: true,
      finish: { kind: "plaster" },
    });
  });
}

/** Position of an opening on a rectangular room's wall. */
function openingPart(o: Opening, L: number, W: number, H: number, delay: number): Part {
  const along = (len: number) => -len / 2 + o.pos * len;
  const h = Math.min(o.height, H);
  const y = o.kind === "window" ? Math.min(H - h / 2 - 0.1, 0.9 + h / 2) : h / 2;
  const color = o.kind === "window" ? C.window : C.door;
  const finish: Finish | undefined = o.kind === "window" ? undefined : { kind: "wood" };
  const base = { id: `op-${o.id}`, layer: "structure", color, delay, grow: "fade" as const, context: true, finish };
  switch (o.wall as Side) {
    case "n":
      return { ...base, pos: [along(L), y, -W / 2 + 0.012], size: [o.width, h, 0.012] };
    case "s":
      return { ...base, pos: [along(L), y, W / 2 - 0.012], size: [o.width, h, 0.012] };
    case "w":
      return { ...base, pos: [-L / 2 + 0.012, y, along(W)], size: [0.012, h, o.width] };
    default:
      return { ...base, pos: [L / 2 - 0.012, y, along(W)], size: [0.012, h, o.width] };
  }
}

function roomShell(L: number, W: number, H: number, lowH: number, parts: Part[]) {
  const t = 0.1;
  const wall: Finish = { kind: "plaster" };
  parts.push({ id: "slab", layer: "structure", pos: [0, -0.03, 0], size: [L + 2 * t, 0.06, W + 2 * t], color: C.slab, delay: 0, grow: "fade", context: true, finish: { kind: "concrete" } });
  parts.push({ id: "wall-back", layer: "structure", pos: [0, H / 2, -W / 2 - t / 2], size: [L + 2 * t, H, t], color: C.wall, delay: 0, grow: "rise", context: true, finish: wall });
  parts.push({ id: "wall-left", layer: "structure", pos: [-L / 2 - t / 2, H / 2, 0], size: [t, H, W], color: C.wall, delay: 0.1, grow: "rise", context: true, finish: wall });
  parts.push({ id: "wall-front", layer: "structure", pos: [0, lowH / 2, W / 2 + t / 2], size: [L + 2 * t, lowH, t], color: C.wall, delay: 0.15, grow: "rise", context: true, finish: wall });
  parts.push({ id: "wall-right", layer: "structure", pos: [L / 2 + t / 2, lowH / 2, 0], size: [t, lowH, W], color: C.wall, delay: 0.2, grow: "rise", context: true, finish: wall });
}

/** Height a wall is drawn at in the cut-away room (back/left full, front/right low). */
const drawnHeight = (side: Side, H: number, low: number) => (side === "n" || side === "w" ? H : low);

/**
 * A board with any convex outline (diagonal, mitred) as a part: its bounding box is the part's
 * size, its outline travels in `shape` (see detail/prism.ts). The wood texture is re-scaled so the
 * grain repeats at the real board length along the board, whatever the angle.
 */
function prismBoard(id: string, poly: Pt[], grain: number, y: number, t: number, color: string, delay: number, finish: Finish): Part {
  const { center, shape, width, depth } = prismOf(poly, grain);
  const gx = Math.cos(grain);
  const gz = Math.sin(grain);
  const along = poly.map(([x, z]) => x * gx + z * gz);
  const length = Math.max(...along) - Math.min(...along);
  // A whole number of half-repeats keeps the number of distinct textures small.
  const repeats = Math.max(0.5, Math.round((length / 0.9) * 2) / 2);
  return {
    id,
    layer: "deck_board",
    pos: [center[0], y, center[1]],
    size: [width, t, depth],
    color,
    delay,
    grow: "drop",
    shape,
    finish: { ...finish, unit: [width / repeats, depth] },
  };
}

// ───────────────────────────── deck ──────────────────────────────
function deck(l: Extract<Layout, { type: "deck" }>, lang: Lang, look: Look): Build {
  const parts: Part[] = [];
  const top = Math.max(0.12, l.heightM);
  // The boards/joists actually in the basket: width, thickness, section and colour.
  const bw = look.deck_board?.w ?? 0.145;
  const boardT = look.deck_board?.t ?? 0.028;
  const pitch = bw + 0.005;
  const boardColors = shades(look.deck_board?.color ?? C.wood);
  const joistH = look.deck_joist?.t ?? 0.07;
  const joistW = look.deck_joist?.w ?? 0.045;
  const joistColor = look.deck_joist?.color ?? C.woodDark;
  const supColor = look.deck_support?.color ?? C.support;
  const supH = Math.max(0.03, top - boardT - joistH);
  const alongX = l.direction === "x";
  const boards = l.boards ?? "straight";
  const frameSides = boards === "frame" ? deckFrameSides(l.zones) : [];
  // WPC composite or aluminium read as a different material in the 3D sketch; everything else
  // (pin tratat, larice…) is wood.
  const boardFinish: Finish = /wpc/i.test(look.deck_board?.name ?? "") ? { kind: "wpc" } : { kind: "wood" };
  const joistFinish: Finish = /aluminiu/i.test(look.deck_joist?.name ?? "") ? { kind: "metal" } : { kind: "wood" };

  l.zones.forEach((z, zi) => {
    const zd = zi * 0.6; // later zones build a little later
    if (l.base !== "concrete_slab") {
      parts.push({
        id: `${z.id}-membrane`,
        layer: "weed_membrane",
        pos: [z.x + z.w / 2, 0.003, z.z + z.d / 2],
        size: [z.w + 0.2, 0.006, z.d + 0.2],
        color: C.membrane,
        delay: zd,
        grow: "fade",
        finish: { kind: "membrane" },
      });
    }
    const run = alongX ? z.w : z.d;
    const across = alongX ? z.d : z.w;
    const grid = pedestalGrid(run, across, { pitchAlong: DECK_JOIST_SPACING[boards] });
    // The edge supports and joists sit just inside the outline, under the boards' ends — not
    // centred on it, half poking out past the deck (seen from above as bumps along the edge).
    const supR = 0.05;
    const inside = (t: number, len: number, r: number) => Math.min(Math.max(t, r), Math.max(r, len - r));
    grid.points.forEach(({ i, j, u: u0, v: v0 }, k) => {
      const u = inside(u0, run, supR);
      const v = inside(v0, across, supR);
      const [px, pz] = alongX ? [z.x + u, z.z + v] : [z.x + v, z.z + u];
      parts.push({
        id: `${z.id}-sup-${i}-${j}`,
        layer: "deck_support",
        pos: [px, supH / 2, pz],
        size: [0.1, supH, 0.1],
        color: supColor,
        delay: zd + 0.3 + (k * 0.8) / grid.points.length,
        grow: "rise",
        finish: { kind: "metal" },
      });
    });
    const joistPart = (id: string, u0: number, delay: number): Part => {
      const u = inside(u0, run, joistW / 2);
      const jp: Vec3 = alongX ? [z.x + u, supH + joistH / 2, z.z + across / 2] : [z.x + across / 2, supH + joistH / 2, z.z + u];
      return { id, layer: "deck_joist", pos: jp, size: alongX ? [joistW, joistH, across] : [across, joistH, joistW], color: joistColor, delay, grow: "drop", finish: joistFinish };
    };
    for (let i = 0; i < grid.J; i++) {
      const u = grid.J > 1 ? (i * run) / (grid.J - 1) : 0;
      parts.push(joistPart(`${z.id}-joist-${i}`, u, zd + 1.2 + i * (1 / grid.J)));
    }

    // Straight rows of boards in a rectangle (the whole zone, or the field inside a frame).
    const rowsIn = (x0: number, x1: number, z0: number, z1: number) => {
      const fAcross = alongX ? z1 - z0 : x1 - x0;
      const fRun = alongX ? x1 - x0 : z1 - z0;
      const R = Math.ceil(fAcross / pitch);
      for (let r = 0; r < R; r++) {
        // The last board is ripped to the width that is left, not slid back over its neighbour.
        const w = Math.min(bw, fAcross - r * pitch);
        if (w < 0.02) continue;
        const v = r * pitch + w / 2;
        const bp: Vec3 = alongX ? [x0 + fRun / 2, top - boardT / 2, z0 + v] : [x0 + v, top - boardT / 2, z0 + fRun / 2];
        parts.push({
          id: `${z.id}-board-${r}`,
          layer: "deck_board",
          pos: bp,
          size: alongX ? [fRun, boardT, w] : [w, boardT, fRun],
          color: boardColors[r % boardColors.length],
          delay: zd + 2.4 + r * (2 / R),
          grow: "slide",
          finish: boardFinish,
        });
      }
    };
    const frame = boards === "frame" ? deckFrameFor(z, frameSides[zi], pitch) : null;
    if (boards === "diagonal") {
      // Boards at 45°, cut flush at the edge of the deck. "Across" flips the diagonal.
      const strips = diagonalBoards(z, !alongX, pitch, bw);
      strips.forEach((st, n) => {
        parts.push(prismBoard(`${z.id}-dboard-${st.index}`, st.poly, st.grain, top - boardT / 2, boardT, boardColors[st.index % boardColors.length], zd + 2.4 + n * (2 / strips.length), boardFinish));
      });
    } else if (frame) {
      rowsIn(frame.field.x0, frame.field.x1, frame.field.z0, frame.field.z1);
      // The border: one board on each open side, mitred where two open sides meet.
      frameBoards(z, frame.sides, bw).forEach((fb, n) => {
        parts.push(prismBoard(`${z.id}-frame-${fb.side}`, fb.poly, fb.grain, top - boardT / 2, boardT, boardColors[(n + 1) % boardColors.length], zd + 4.4 + n * 0.12, boardFinish));
      });
      // A border board that runs with the joists needs a joist of its own beneath it.
      const rim: [boolean, number][] = alongX ? [[frame.sides.w, pitch / 2], [frame.sides.e, z.w - pitch / 2]] : [[frame.sides.n, pitch / 2], [frame.sides.s, z.d - pitch / 2]];
      rim.forEach(([open, u], n) => {
        if (open) parts.push(joistPart(`${z.id}-rim-${alongX ? (n ? "e" : "w") : n ? "s" : "n"}`, u, zd + 1.2 + n * 0.1));
      });
    } else {
      rowsIn(z.x, z.x + z.w, z.z, z.z + z.d);
    }
  });

  // Steps: descend outward from the chosen edge of the zone, centred on it.
  for (const st of l.steps) {
    const z = l.zones.find((x) => x.id === st.zone) ?? l.zones[0];
    const rise = top / (st.count + 1);
    for (let k = 0; k < st.count; k++) {
      const y = top - (k + 1) * rise;
      const out = 0.15 + k * 0.3;
      let cx: number, cz: number, size: Vec3;
      if (st.side === "s" || st.side === "n") {
        cx = z.x + z.w / 2;
        cz = st.side === "s" ? z.z + z.d + out : z.z - out;
        size = [st.width, boardT, 0.29];
      } else {
        cz = z.z + z.d / 2;
        cx = st.side === "e" ? z.x + z.w + out : z.x - out;
        size = [0.29, boardT, st.width];
      }
      parts.push({ id: `${st.id}-tread-${k}`, layer: "deck_board", pos: [cx, y - boardT / 2, cz], size, color: boardColors[k % boardColors.length], delay: 0.3 + k * 0.25, grow: "drop", finish: boardFinish });
      const riserH = Math.max(0.02, y - boardT);
      const stringers = 2 + Math.floor(st.width / 0.6);
      for (let s = 0; s < stringers; s++) {
        const off = -st.width / 2 + (s * st.width) / (stringers - 1);
        const p: Vec3 = st.side === "s" || st.side === "n" ? [cx + off, riserH / 2, cz] : [cx, riserH / 2, cz + off];
        parts.push({ id: `${st.id}-str-${k}-${s}`, layer: "deck_joist", pos: p, size: [0.045, riserH, 0.045], color: joistColor, delay: 0.15 + k * 0.25, grow: "rise", finish: joistFinish });
      }
    }
  }

  return {
    parts,
    dims: zoneDims(l.zones, lang),
    extent: extentOf(l.zones, top + 0.2),
    center: centerOf(l.zones),
    layers: [
      { id: "weed_membrane", label: lang === "en" ? "Weed membrane" : "Geotextil", color: C.membrane },
      { id: "deck_support", label: lang === "en" ? "Adjustable supports" : "Suporturi reglabile", color: supColor },
      { id: "deck_joist", label: lang === "en" ? "Joists" : "Grinzi", color: joistColor },
      { id: "deck_board", label: lang === "en" ? "Deck boards" : "Deck", color: boardColors[0] },
    ],
    duration: 5,
    outdoor: true,
  };
}

// ───────────────────────────── fence ─────────────────────────────
function fence(l: Extract<Layout, { type: "fence" }>, lang: Lang, look: Look): Build {
  const H = l.heightM;
  const parts: Part[] = [];
  const panelColors = shades(look.fence_panel?.color ?? C.fence, 2, 0.05);
  const postColor = look.fence_post?.color ? shades(look.fence_post.color, 1, 0)[0] : C.post;
  const gateColor = look.fence_gate?.color ?? C.gate;
  const segs = fenceSegments(l.points);
  const section = 1.89;
  const postFinish: Finish = /aluminiu/i.test(look.fence_post?.name ?? "") ? { kind: "metal" } : { kind: "wood", axes: "xy" };
  let postIdx = 0;
  let panelIdx = 0;
  const placePost = (x: number, z: number, id: string, gatePost = false) => {
    const i = postIdx++;
    parts.push({ id: `foot-${id}`, layer: "post_concrete", pos: [x, -0.3, z], size: [0.28, 0.6, 0.28], color: C.concrete, delay: i * 0.05, grow: "pop", finish: { kind: "concrete" } });
    parts.push({
      id: `post-${id}`,
      layer: "fence_post",
      pos: [x, (H + 0.1) / 2, z],
      size: [gatePost ? 0.11 : 0.09, H + 0.1, gatePost ? 0.11 : 0.09],
      color: postColor,
      delay: 0.5 + i * 0.07,
      grow: "rise",
      finish: postFinish,
    });
    parts.push({ id: `cap-${id}`, layer: "post_cap", pos: [x, H + 0.12, z], size: [0.12, 0.03, 0.12], color: "#3b3b3b", delay: 3.2 + i * 0.03, grow: "drop", finish: { kind: "metal" } });
  };

  segs.forEach((seg, si) => {
    const dx = (seg.b.x - seg.a.x) / seg.length;
    const dz = (seg.b.z - seg.a.z) / seg.length;
    const alongX = Math.abs(dx) >= Math.abs(dz);
    const at = (t: number) => ({ x: seg.a.x + dx * t, z: seg.a.z + dz * t });
    // Gate intervals on this segment, then fill the gaps with panels.
    const gates = l.gates
      .filter((g) => Number(g.wall) === si)
      .map((g) => ({ g, c: g.pos * seg.length }))
      .sort((a, b) => a.c - b.c);
    const blocks: [number, number][] = [];
    let cursor = 0;
    for (const { g, c } of gates) {
      const a = Math.max(cursor, c - g.width / 2 - 0.045);
      blocks.push([cursor, a]);
      const mid = at(c);
      parts.push({
        id: `gate-${g.id}`,
        layer: "fence_gate",
        pos: [mid.x, (H * 0.95) / 2 + 0.05, mid.z],
        size: alongX ? [g.width - 0.04, H * 0.95, 0.05] : [0.05, H * 0.95, g.width - 0.04],
        color: gateColor,
        delay: 2.2,
        grow: "slide",
        // Real boards in the REAL view (see detail/shapes.ts "slats"); grain runs along the panel's own face.
        finish: { kind: "fenceBoard", axes: alongX ? "xy" : "zy" },
      });
      // The hinge-side post is the previous run's last post (or the corner); add the latch post.
      const p2 = at(Math.min(seg.length, c + g.width / 2 + 0.045));
      placePost(p2.x, p2.z, `g-${g.id}`, true);
      cursor = c + g.width / 2 + 0.045;
    }
    blocks.push([cursor, seg.length]);
    if (si === 0) placePost(seg.a.x, seg.a.z, `s${si}-start`);
    for (const [from, to] of blocks) {
      const len = to - from;
      if (len < 0.05) continue;
      const n = Math.ceil(len / section - 1e-9);
      for (let i = 0; i < n; i++) {
        const t0 = from + i * section;
        const t1 = Math.min(to, t0 + section);
        const mid = at((t0 + t1) / 2);
        const w = t1 - t0 - 0.09;
        if (w > 0.05) {
          const idx = panelIdx++;
          parts.push({
            id: `panel-${si}-${Math.round(t0 * 100)}`,
            layer: "fence_panel",
            pos: [mid.x, H / 2 + 0.05, mid.z],
            size: alongX ? [w, H * 0.97, 0.035] : [0.035, H * 0.97, w],
            color: panelColors[idx % panelColors.length],
            delay: 1.4 + idx * 0.08,
            grow: "slide",
            finish: { kind: "fenceBoard", axes: alongX ? "xy" : "zy" },
          });
        }
        const end = at(t1);
        // The segment's last post is the next segment's first (shared corner).
        placePost(end.x, end.z, `s${si}-${Math.round(t1 * 100)}`);
      }
    }
  });

  const xs = l.points.map((p) => p.x);
  const zs = l.points.map((p) => p.z);
  const w = Math.max(...xs) - Math.min(...xs);
  const d = Math.max(...zs) - Math.min(...zs);
  parts.push({ id: "ground", layer: "structure", pos: [(Math.max(...xs) + Math.min(...xs)) / 2, -0.005, (Math.max(...zs) + Math.min(...zs)) / 2], size: [w + 1.5, 0.01, d + 2.4], color: "#6d8b58", delay: 0, grow: "fade", context: true, opacity: 0.5 });

  const dims: DimLine[] = segs.slice(0, 4).map((s) => {
    const alongX = Math.abs(s.b.x - s.a.x) >= Math.abs(s.b.z - s.a.z);
    const off: Vec3 = alongX ? [0, 0, 0.8] : [0.8, 0, 0];
    return { from: [s.a.x + off[0], 0, s.a.z + off[2]], to: [s.b.x + off[0], 0, s.b.z + off[2]], label: m(s.length, lang) };
  });
  dims.push({ from: [l.points[0].x - 0.4, 0, l.points[0].z], to: [l.points[0].x - 0.4, H, l.points[0].z], label: m(H, lang) });

  return {
    parts,
    dims,
    extent: [Math.max(w, 2), H, Math.max(d, 2)],
    center: [(Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...zs) + Math.min(...zs)) / 2],
    layers: [
      { id: "post_concrete", label: lang === "en" ? "Concrete footings" : "Fundații beton", color: C.concrete },
      { id: "fence_post", label: lang === "en" ? "Posts" : "Stâlpi", color: postColor },
      { id: "fence_panel", label: lang === "en" ? "Panels" : "Panouri", color: panelColors[0] },
      ...(l.gates.length ? [{ id: "fence_gate", label: lang === "en" ? "Gates" : "Porți", color: gateColor }] : []),
      { id: "post_cap", label: lang === "en" ? "Post caps" : "Capace", color: "#3b3b3b" },
    ],
    duration: 4.5,
    outdoor: true,
  };
}

// ───────────────────────────── paint ─────────────────────────────
function paintRoom(l: Extract<Layout, { type: "paint_room" }>, lang: Lang, look: Look): Build {
  const { w: L, d: W, h: H } = l;
  const paint = look.interior_paint?.color ?? C.paint;
  const low = 0.4;
  const parts: Part[] = [];
  roomShell(L, W, H, low, parts);
  parts.push({ id: "foil", layer: "protective_foil", pos: [0, 0.004, 0], size: [L - 0.1, 0.006, W - 0.1], color: C.foil, delay: 0.4, grow: "fade", opacity: 0.7 });
  parts.push({ id: "tape-back", layer: "painters_tape", pos: [0, H - 0.015, -W / 2 + 0.006], size: [L, 0.03, 0.01], color: C.tape, delay: 0.8, grow: "slide" });
  parts.push({ id: "tape-left", layer: "painters_tape", pos: [-L / 2 + 0.006, H - 0.015, 0], size: [0.01, 0.03, W], color: C.tape, delay: 0.9, grow: "slide" });
  parts.push({ id: "paint-back", layer: "interior_paint", pos: [0, H / 2, -W / 2 + 0.004], size: [L, H - 0.04, 0.008], color: paint, delay: 1.3, grow: "rise", finish: { kind: "plaster" } });
  parts.push({ id: "paint-left", layer: "interior_paint", pos: [-L / 2 + 0.004, H / 2, 0], size: [0.008, H - 0.04, W], color: paint, delay: 2.0, grow: "rise", finish: { kind: "plaster" } });
  l.openings.forEach((o, i) => parts.push(openingPart(o, L, W, drawnHeight(o.wall as Side, H, low), 0.3 + i * 0.05)));
  if (l.ceiling) parts.push({ id: "ceiling", layer: "interior_paint", pos: [0, H + 0.01, 0], size: [L, 0.01, W], color: paint, delay: 2.8, grow: "fade", opacity: 0.22, finish: { kind: "plaster" } });
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
      { id: "interior_paint", label: lang === "en" ? "Paint" : "Vopsea", color: paint },
    ],
    duration: 4,
    interior: true,
  };
}

// ─────────────────────────── laminate ────────────────────────────
function laminate(l: Extract<Layout, { type: "laminate_floor" }>, lang: Lang, look: Look): Build {
  const parts: Part[] = [];
  const pw = (look.laminate?.w ?? 0.19) + 0.003;
  const pl = look.laminate?.l ?? 1.285;
  const plankColors = look.laminate ? shades(look.laminate.color, 4, 0.06) : C.laminate;
  const skirtColor = look.skirting_board?.color ?? "#f4f1ea";
  const totalArea = l.zones.reduce((s, z) => s + z.w * z.d, 0);
  const scale = totalArea / (pw * pl) > 420 ? Math.ceil(totalArea / (pw * pl) / 420) : 1;
  const plankL = pl * scale;

  outlineWalls(l.zones, 0.5, parts);
  l.zones.forEach((z, zi) => {
    const zd = zi * 0.5;
    const c: Vec3 = [z.x + z.w / 2, 0, z.z + z.d / 2];
    parts.push({ id: `${z.id}-slab`, layer: "structure", pos: [c[0], -0.03, c[2]], size: [z.w, 0.06, z.d], color: C.slab, delay: zd, grow: "fade", context: true, finish: { kind: "concrete" } });
    if (l.subfloor !== "wood") parts.push({ id: `${z.id}-vapor`, layer: "vapor_barrier", pos: [c[0], 0.002, c[2]], size: [z.w, 0.003, z.d], color: C.vapor, delay: zd + 0.3, grow: "fade", opacity: 0.8 });
    parts.push({ id: `${z.id}-underlay`, layer: "underlay", pos: [c[0], 0.006, c[2]], size: [z.w, 0.004, z.d], color: C.underlay, delay: zd + 0.7, grow: "slide" });
    const rows = Math.ceil(z.d / pw);
    for (let r = 0; r < rows; r++) {
      const zc = Math.min(z.z + pw / 2 + r * pw, z.z + z.d - pw / 2);
      let x = z.x - ((r * 0.43 * scale) % plankL);
      let k = 0;
      while (x < z.x + z.w) {
        const a = Math.max(x, z.x);
        const b = Math.min(x + plankL, z.x + z.w);
        if (b - a > 0.05) {
          parts.push({
            id: `${z.id}-plank-${r}-${k}`,
            layer: "laminate",
            pos: [(a + b) / 2, 0.013, zc],
            size: [b - a - 0.004, 0.009, pw - 0.003],
            color: plankColors[(r * 3 + k) % plankColors.length],
            delay: zd + 1.2 + r * (2.4 / rows) + k * 0.04,
            grow: "drop",
            // `plankL` may be a multiple of the real plank length `pl` (drawn bigger for very
            // large rooms); the grain still repeats at the real length.
            finish: { kind: "wood", unit: [pl, pw] },
          });
        }
        x += plankL;
        k++;
      }
    }
  });
  // Skirting along the outline, transition profiles at doorways.
  const edges = exposedEdges(l.zones);
  edges.forEach((e, i) => {
    const horizontal = e.side === "n" || e.side === "s";
    const len = horizontal ? Math.abs(e.x2 - e.x1) : Math.abs(e.z2 - e.z1);
    const inset = e.side === "n" || e.side === "w" ? 0.008 : -0.008;
    parts.push({
      id: `sk-${e.side}-${i}`,
      layer: "skirting_board",
      pos: horizontal ? [(e.x1 + e.x2) / 2, 0.048, e.z1 + inset] : [e.x1 + inset, 0.048, (e.z1 + e.z2) / 2],
      size: horizontal ? [len, 0.06, 0.015] : [0.015, 0.06, len],
      color: skirtColor,
      delay: 3.8 + i * 0.05,
      grow: "slide",
      finish: { kind: "wood", axes: "xy" },
    });
  });
  l.openings.forEach((o, i) => {
    const z = l.zones.find((x) => x.id === o.zone) ?? l.zones[0];
    const side = o.wall as Side;
    const horizontal = side === "n" || side === "s";
    const px = horizontal ? z.x + o.pos * z.w : side === "w" ? z.x : z.x + z.w;
    const pz = horizontal ? (side === "n" ? z.z : z.z + z.d) : z.z + o.pos * z.d;
    parts.push({
      id: `tp-${o.id}`,
      layer: "transition_profile",
      pos: [px, 0.02, pz],
      size: horizontal ? [o.width, 0.012, 0.05] : [0.05, 0.012, o.width],
      color: C.profile,
      delay: 4 + i * 0.1,
      grow: "pop",
      finish: { kind: "metal" },
    });
  });
  return {
    parts,
    dims: zoneDims(l.zones, lang),
    extent: extentOf(l.zones, 1),
    center: centerOf(l.zones),
    layers: [
      ...(l.subfloor !== "wood" ? [{ id: "vapor_barrier", label: lang === "en" ? "Vapour barrier" : "Barieră vapori", color: C.vapor }] : []),
      { id: "underlay", label: lang === "en" ? "Underlay" : "Folie parchet", color: C.underlay },
      { id: "laminate", label: lang === "en" ? "Laminate" : "Parchet", color: plankColors[0] },
      { id: "skirting_board", label: lang === "en" ? "Skirting" : "Plintă", color: skirtColor },
    ],
    duration: 4.8,
  };
}

// ──────────────────────────── tiling ─────────────────────────────
function tiling(l: Extract<Layout, { type: "tiling" }>, lang: Lang, look: Look): Build {
  const { w: L, d: W } = l;
  const H = 2.6;
  const low = 0.45;
  const parts: Part[] = [];
  roomShell(L, W, H, low, parts);
  l.openings.forEach((o, i) => parts.push(openingPart(o, L, W, drawnHeight(o.wall as Side, H, low), 0.3 + i * 0.05)));
  if (l.roomType === "bathroom") {
    parts.push({ id: "wp", layer: "waterproofing", pos: [0, 0.003, 0], size: [L, 0.005, W], color: C.waterproof, delay: 0.3, grow: "fade", finish: { kind: "membrane" } });
    parts.push({ id: "wp-back", layer: "waterproofing", pos: [0, 0.1, -W / 2 + 0.003], size: [L, 0.2, 0.005], color: C.waterproof, delay: 0.4, grow: "rise", finish: { kind: "membrane", axes: "xy" } });
  }
  // The tiles actually chosen: 33 × 33, 60 × 60, 20 × 120 wood-look planks… (long side along the room).
  const ft = look.floor_tiles;
  let [sx, sz] = ft?.w && ft.l ? [Math.max(ft.w, ft.l), Math.min(ft.w, ft.l)] : l.largeFormat ? [0.6, 0.6] : [0.3, 0.3];
  const floorTileUnit: [number, number] = [sx, sz];
  const floorColors = ft ? shades(ft.color, 2, 0.04) : C.tileFloor;
  // Very small formats would mean thousands of parts: draw them larger, same proportions — the
  // grout pattern below still repeats at the real (pre-scale) tile format.
  const fScale = Math.max(1, Math.sqrt((L * W) / (sx * sz) / 500));
  sx *= fScale;
  sz *= fScale;
  if (l.floor) {
    // A dark grout bed just under the tiles' own bottom face: it only peeks through the
    // few-mm gaps between them, reading as a recessed grout line instead of the slab colour.
    parts.push({ id: "floor-grout", layer: "structure", pos: [0, 0.004, 0], size: [L - 0.01, 0.004, W - 0.01], color: "#726d63", delay: 0.75, grow: "fade", context: true, finish: { kind: "concrete" } });
    const nx = Math.ceil(L / sx - 1e-9);
    const nz = Math.ceil(W / sz - 1e-9);
    for (let j = 0; j < nz; j++) {
      // Plank formats are laid in a running bond.
      const shift = sx > 1.9 * sz && j % 2 ? sx / 2 : 0;
      for (let i = 0; i <= nx; i++) {
        const a = Math.max(-L / 2, -L / 2 + i * sx - shift);
        const b = Math.min(-L / 2 + (i + 1) * sx - shift, L / 2);
        if (b - a < 0.02) continue;
        const c = -W / 2 + j * sz;
        const d = Math.min(c + sz, W / 2);
        parts.push({
          id: `ft-${i}-${j}`,
          layer: "floor_tiles",
          pos: [(a + b) / 2, 0.011, (c + d) / 2],
          size: [b - a - 0.004, 0.01, d - c - 0.004],
          color: floorColors[(i + j) % floorColors.length],
          delay: 0.9 + (i + j) * (1.6 / (nx + nz)),
          grow: "drop",
          finish: { kind: "tile", unit: floorTileUnit },
        });
      }
    }
  }
  const wt = look.wall_tiles;
  // Elongated wall tiles (metro 10 × 20, 30 × 60) are laid horizontally, others as listed (w × h).
  let [tw, th] = wt?.w && wt.l ? (wt.l >= 1.9 * wt.w ? [wt.l, wt.w] : [wt.w, wt.l]) : [0.6, 0.3];
  const wallTileUnit: [number, number] = [tw, th];
  const wallColors = wt ? shades(wt.color, 2, 0.03) : C.tileWall;
  const perimeter = 2 * (L + W);
  // A whole number of real tiles per drawn tile, so the texture's grout lines run on across
  // drawn-tile seams instead of breaking (a fractional scale offset them at every seam).
  const wScale = Math.max(1, Math.ceil(Math.sqrt((perimeter * 2.1) / (tw * th) / 700) - 1e-9));
  tw *= wScale;
  th *= wScale;
  for (const side of SIDES) {
    const wallH = Math.min(l.wallHeights[side], drawnHeight(side, H, low));
    if (wallH <= 0) continue;
    const horizontal = side === "n" || side === "s";
    const len = horizontal ? L : W;
    // Same grout-bed trick as the floor, tucked a hair behind the tile face so only the
    // joints between tiles read as a dark recess.
    const groutOff = side === "n" ? -W / 2 + 0.004 : side === "s" ? W / 2 - 0.004 : side === "w" ? -L / 2 + 0.004 : L / 2 - 0.004;
    parts.push({
      id: `wt-grout-${side}`,
      layer: "structure",
      pos: horizontal ? [0, wallH / 2, groutOff] : [groutOff, wallH / 2, 0],
      size: horizontal ? [len - 0.01, wallH - 0.01, 0.006] : [0.006, wallH - 0.01, len - 0.01],
      color: "#726d63",
      delay: 2.2,
      grow: "fade",
      context: true,
      finish: { kind: "concrete" },
    });
    const rows = Math.ceil(wallH / th - 1e-9);
    for (let r = 0; r < rows; r++) {
      const y0 = r * th;
      const h = Math.min(th, wallH - y0);
      for (let c = 0; c < Math.ceil(len / tw); c++) {
        const a = -len / 2 + c * tw;
        const b = Math.min(a + tw, len / 2);
        const off = side === "n" ? -W / 2 + 0.008 : side === "s" ? W / 2 - 0.008 : side === "w" ? -L / 2 + 0.008 : L / 2 - 0.008;
        parts.push({
          id: `wt-${side}-${r}-${c}`,
          layer: "wall_tiles",
          pos: horizontal ? [(a + b) / 2, y0 + h / 2, off] : [off, y0 + h / 2, (a + b) / 2],
          // Butted together: the grout comes from the texture (see wScale), not from gaps that
          // showed the dark bed behind as uneven spindles.
          size: horizontal ? [b - a, h, 0.008] : [0.008, h, b - a],
          // One shade per wall: alternating shades per drawn tile (a block of real tiles) read as a checkerboard.
          color: wallColors[0],
          delay: 2.4 + r * 0.16 + c * 0.02,
          grow: "pop",
          // The wall's long span is along x for the n/s walls but along z for e/w ones.
          finish: { kind: "tileWall", unit: wallTileUnit, axes: horizontal ? "xy" : "zy" },
        });
      }
    }
  }
  const maxH = Math.max(...SIDES.map((x) => l.wallHeights[x]));
  return {
    parts,
    dims: [
      { from: [-L / 2, 0, W / 2 + 0.5], to: [L / 2, 0, W / 2 + 0.5], label: m(L, lang) },
      { from: [L / 2 + 0.5, 0, -W / 2], to: [L / 2 + 0.5, 0, W / 2], label: m(W, lang) },
      ...(maxH > 0 ? [{ from: [-L / 2 - 0.35, 0, -W / 2] as Vec3, to: [-L / 2 - 0.35, Math.min(maxH, H), -W / 2] as Vec3, label: m(maxH, lang) }] : []),
    ],
    extent: [L, H, W],
    layers: [
      ...(l.roomType === "bathroom" ? [{ id: "waterproofing", label: lang === "en" ? "Waterproofing" : "Hidroizolație", color: C.waterproof }] : []),
      ...(l.floor ? [{ id: "floor_tiles", label: lang === "en" ? "Floor tiles" : "Gresie", color: floorColors[0] }] : []),
      ...(maxH > 0 ? [{ id: "wall_tiles", label: lang === "en" ? "Wall tiles" : "Faianță", color: wallColors[0] }] : []),
    ],
    duration: 4.5,
    interior: true,
  };
}

// ────────────────────────── drywall wall ─────────────────────────
function drywall(l: Extract<Layout, { type: "drywall_partition" }>, lang: Lang, look: Look): Build {
  const L = l.length;
  const H = l.heightM;
  const parts: Part[] = [];
  const boardColor = look.drywall_board?.color ?? C.board;
  const woolColor = look.mineral_wool?.color ?? C.wool;
  parts.push({ id: "floor", layer: "structure", pos: [0, -0.03, 0], size: [L + 1.2, 0.06, 2.4], color: C.slab, delay: 0, grow: "fade", context: true, finish: { kind: "concrete" } });
  parts.push({ id: "uw-bottom", layer: "uw_profile", pos: [0, 0.02, 0], size: [L, 0.04, 0.075], color: C.stud, delay: 0.2, grow: "slide", finish: { kind: "metal" } });
  parts.push({ id: "uw-top", layer: "uw_profile", pos: [0, H - 0.02, 0], size: [L, 0.04, 0.075], color: C.stud, delay: 0.4, grow: "slide", finish: { kind: "metal" } });
  const doors = l.openings.map((o) => ({ id: o.id, x: -L / 2 + o.pos * L, w: o.width }));
  const inDoor = (x: number, pad = 0) => doors.some((d) => x > d.x - d.w / 2 - pad && x < d.x + d.w / 2 + pad);
  const xs: number[] = [];
  for (let i = 0; i <= Math.ceil(L / 0.6); i++) xs.push(-L / 2 + Math.min(i * 0.6, L));
  for (const d of doors) xs.push(d.x - d.w / 2, d.x + d.w / 2);
  xs.sort((a, b) => a - b);
  // A door edge can land on a regular stud position: one stud there, not two.
  const studs = xs.filter((x, i) => i === 0 || Math.abs(x - xs[i - 1]) > 0.005);
  studs.forEach((x, i) => {
    if (inDoor(x, -0.01)) return;
    parts.push({ id: `cw-${Math.round(x * 100)}`, layer: "cw_profile", pos: [x, H / 2, 0], size: [0.05, H - 0.08, 0.075], color: C.stud, delay: 0.7 + i * 0.08, grow: "rise", finish: { kind: "metal" } });
  });
  for (const d of doors)
    parts.push({ id: `header-${d.id}`, layer: "uw_profile", pos: [d.x, 2.05, 0], size: [d.w, 0.04, 0.075], color: C.stud, delay: 1.6, grow: "slide", finish: { kind: "metal" } });
  if (l.insulation) {
    for (let i = 0; i < xs.length - 1; i++) {
      const a = xs[i] + 0.03;
      const b = xs[i + 1] - 0.03;
      const mid = (a + b) / 2;
      if (b - a < 0.1 || inDoor(mid)) continue;
      parts.push({ id: `wool-${Math.round(mid * 100)}`, layer: "mineral_wool", pos: [mid, H / 2, 0], size: [b - a, H - 0.1, 0.05], color: woolColor, delay: 2.0 + i * 0.07, grow: "fade" });
    }
  }
  const sheets = Math.ceil(L / 1.2);
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i < sheets; i++) {
      const a = -L / 2 + i * 1.2;
      const b = Math.min(a + 1.2, L / 2);
      const z = side === 0 ? 0.045 : -0.045;
      const mid = (a + b) / 2;
      const overDoor = doors.find((d) => mid > d.x - 0.6 && mid < d.x + 0.6);
      const boardH = overDoor ? H - 2.1 : H;
      const y = overDoor ? H - boardH / 2 : H / 2;
      parts.push({
        id: `gk-${side}-${i}`,
        layer: "drywall_board",
        pos: [mid, y, z],
        size: [b - a - 0.004, boardH, 0.0125],
        color: boardColor,
        delay: 3.0 + side * 0.9 + i * 0.12,
        grow: "slide",
        opacity: side === 0 ? 0.92 : 1,
        finish: { kind: "plaster", axes: "xy" },
      });
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
      ...(l.insulation ? [{ id: "mineral_wool", label: lang === "en" ? "Mineral wool" : "Vată minerală", color: woolColor }] : []),
      { id: "drywall_board", label: lang === "en" ? "Plasterboard" : "Gips-carton", color: boardColor },
    ],
    duration: 5,
  };
}

// ───────────────────────────── lawn ──────────────────────────────
function lawn(l: Extract<Layout, { type: "lawn" }>, lang: Lang): Build {
  const parts: Part[] = [];
  l.zones.forEach((z, i) => {
    const c: Vec3 = [z.x + z.w / 2, 0, z.z + z.d / 2];
    parts.push({ id: `${z.id}-soil`, layer: "structure", pos: [c[0], -0.1, c[2]], size: [z.w, 0.2, z.d], color: C.soil, delay: i * 0.4, grow: "rise", context: true, finish: { kind: "soil" } });
    parts.push({ id: `${z.id}-topsoil`, layer: "topsoil", pos: [c[0], 0.01, c[2]], size: [z.w, 0.02, z.d], color: C.topsoil, delay: 0.6 + i * 0.4, grow: "slide", finish: { kind: "soil" } });
    // A grass-textured ground under the instanced blades (Scene.tsx's `Grass`): dense turf even
    // where the blade count alone would read thin — the lawn settles as a lush lawn, not a bare
    // brown slab with a few sparse sticks on top.
    parts.push({ id: `${z.id}-turf`, layer: "grass_seed", pos: [c[0], 0.021, c[2]], size: [z.w - 0.01, 0.006, z.d - 0.01], color: "#5a9b47", delay: 1.0 + i * 0.4, grow: "fade", finish: { kind: "grass" } });
  });
  const area = l.zones.reduce((s, z) => s + z.w * z.d, 0);
  return {
    parts,
    dims: zoneDims(l.zones, lang),
    extent: extentOf(l.zones, 0.4),
    center: centerOf(l.zones),
    layers: [
      { id: "topsoil", label: lang === "en" ? "Lawn soil" : "Pământ gazon", color: C.topsoil },
      { id: "grass_seed", label: lang === "en" ? "Grass" : "Gazon", color: "#5fa04a" },
    ],
    // Dense enough to read as a lawn, not sparse sticks — the turf ground above carries most of
    // the density/colour, the blades add the close-up fringe; still capped for a big lawn.
    grass: { zones: l.zones, count: Math.min(9000, Math.round(area * 110)), delay: 1.3 },
    duration: 4.5,
    outdoor: true,
  };
}

// ──────────────────────────── paving ─────────────────────────────
/**
 * A cut-away section of the paved surface, bottom-up: geotextile, compacted stone,
 * sand bed, the pavers in the chosen format and colour, kerbs on their concrete bed
 * along the outline, and the ground it's dug into. Ids are per zone and per paver
 * row/column, so an edit or a product swap morphs instead of rebuilding.
 */
function paving(l: Extract<Layout, { type: "paving" }>, lang: Lang, look: Look): Build {
  const en = lang === "en";
  const parts: Part[] = [];
  const top = pavingDepth(l.use);
  const spec = PAVING_BUILDUP[l.use];
  // The pavers actually in the basket: format (long side along x), thickness and colour.
  const pv = look.pavers;
  const [realL, realW] = pv?.w && pv.l ? [Math.max(pv.w, pv.l), Math.min(pv.w, pv.l)] : [0.2, 0.1];
  // The herringbone and the basketweave need a 2:1 paver; the other bonds use the product's own format.
  const unit = bondUnit(l.bond, realL, realW);
  const t = Math.min(0.12, pv?.t ?? spec.paver);
  const paverColors = shades(pv?.color ?? C.paver, 3, 0.05);
  const baseColor = look.paving_base?.color ?? C.gravel;
  const sandColor = look.paving_sand?.color ?? C.sand;
  const jointColor = look.joint_sand?.color ?? C.sand;
  const kerbColor = look.paving_edging?.color ?? C.kerb;
  const kerbT = Math.min(0.2, look.paving_edging?.t ?? 0.05);
  const kerbH = Math.min(0.4, look.paving_edging?.h ?? 0.2);
  const sandTop = top - t;
  const sandBottom = Math.max(0.03, sandTop - spec.sand);
  // Small formats over a big area would mean thousands of parts: draw them larger, same
  // proportions — the joint pattern below still repeats at the real (pre-scale) paver format.
  const area = l.zones.reduce((sum, z) => sum + z.w * z.d, 0);
  const k = Math.max(1, Math.sqrt(area / (unit.l * unit.w) / 600));
  const drawnL = unit.l * k;
  const drawnW = unit.w * k;

  l.zones.forEach((z, zi) => {
    const zd = zi * 0.6;
    const cx = z.x + z.w / 2;
    const cz = z.z + z.d / 2;
    parts.push({ id: `${z.id}-membrane`, layer: "weed_membrane", pos: [cx, 0.003, cz], size: [z.w + 0.1, 0.006, z.d + 0.1], color: C.membrane, delay: zd + 0.2, grow: "fade", finish: { kind: "membrane" } });
    parts.push({ id: `${z.id}-base`, layer: "paving_base", pos: [cx, (0.006 + sandBottom) / 2, cz], size: [z.w, sandBottom - 0.006, z.d], color: baseColor, delay: zd + 0.5, grow: "rise", finish: { kind: "gravel" } });
    parts.push({ id: `${z.id}-sand`, layer: "paving_sand", pos: [cx, (sandBottom + sandTop) / 2, cz], size: [z.w, sandTop - sandBottom, z.d], color: sandColor, delay: zd + 1.1, grow: "slide", finish: { kind: "sand" } });
    const pieces = paverPieces(z, drawnL, drawnW, l.bond);
    const rows = Math.max(1, ...pieces.map((pc) => pc.r + 1));
    for (const pc of pieces) {
      parts.push({
        id: `${z.id}-${pc.key}`,
        layer: "pavers",
        pos: [(pc.x0 + pc.x1) / 2, top - t / 2, (pc.z0 + pc.z1) / 2],
        size: [pc.x1 - pc.x0 - 0.004, t, pc.z1 - pc.z0 - 0.004],
        color: paverColors[(pc.r * 2 + pc.c) % paverColors.length],
        delay: zd + 1.6 + pc.r * (2 / rows) + Math.min(0.6, pc.c * 0.01),
        grow: "drop",
        // The texture's joint pattern runs along the paver's long side, whichever way it lies.
        finish: { kind: "paver", unit: pc.orient === "v" ? [unit.w, unit.l] : [unit.l, unit.w] },
      });
    }
    // Swept into the joints: seen between the pavers, and as its own sheet when exploded.
    parts.push({ id: `${z.id}-joints`, layer: "joint_sand", pos: [cx, top - 0.015, cz], size: [z.w - 0.01, 0.01, z.d - 0.01], color: jointColor, delay: zd + 4.2, grow: "fade", finish: { kind: "sand" } });
  });

  // Kerbs just outside the outline on a concrete bed, and the ground the whole thing is dug into.
  const inside = (x: number, zz: number) => l.zones.some((z) => x > z.x + 1e-6 && x < z.x + z.w - 1e-6 && zz > z.z + 1e-6 && zz < z.z + z.d - 1e-6);
  const ring = l.edging ? kerbT + 0.05 : 0;
  const bedH = Math.max(0.05, top + 0.01 - kerbH);
  const edges = exposedEdges(l.zones);
  edges.forEach((e, i) => {
    const horizontal = e.side === "n" || e.side === "s";
    const out = e.side === "n" || e.side === "w" ? -1 : 1;
    const [lo, hi] = horizontal ? [Math.min(e.x1, e.x2), Math.max(e.x1, e.x2)] : [Math.min(e.z1, e.z2), Math.max(e.z1, e.z2)];
    const line = (horizontal ? e.z1 : e.x1) + (out * kerbT) / 2;
    // Close outer corners (the kerb runs on past the end); stop at inner corners of an L.
    const at = (u: number) => (horizontal ? inside(u, line) : inside(line, u));
    // Two zones flush on one side give two edges in a line: they just meet, end to end.
    const continued = (u: number) =>
      edges.some((o) => o !== e && o.side === e.side && Math.abs((horizontal ? o.z1 : o.x1) - (horizontal ? e.z1 : e.x1)) < 1e-6 && [o.x1, o.x2, o.z1, o.z2].some((v, k) => (horizontal ? k < 2 : k >= 2) && Math.abs(v - u) < 1e-6));
    const endOf = (u: number, dir: -1 | 1, reach: number, inner: number) => (continued(u) ? u : at(u + (dir * kerbT) / 2) ? u - dir * inner : u + dir * reach);
    // Corners: the n/s kerb fills the corner block, the e/w one butts against it — stopping short
    // of an outer corner, pulling back at an inner one (two kerbs in one block would z-fight).
    const a = endOf(lo, -1, horizontal ? kerbT : 0, horizontal ? 0 : kerbT);
    const b = endOf(hi, 1, horizontal ? kerbT : 0, horizontal ? 0 : kerbT);
    const len = b - a;
    const mid = (a + b) / 2;
    const key = `${e.side}-${Math.round(e.x1 * 100)}-${Math.round(e.z1 * 100)}`;
    const box = (off: number, w: number): [number, number, number, number] => (horizontal ? [mid, line + off, len, w] : [line + off, mid, w, len]);
    if (l.edging) {
      const [kx, kz, kw, kd] = box(0, kerbT);
      parts.push({ id: `kerb-${key}`, layer: "paving_edging", pos: [kx, bedH + kerbH / 2, kz], size: [kw, kerbH, kd], color: kerbColor, delay: 3.4 + i * 0.06, grow: "rise", finish: { kind: "concrete" } });
      const [bx, bz, bw, bd] = box((out * 0.03), kerbT + 0.08);
      parts.push({ id: `bed-${key}`, layer: "kerb_concrete", pos: [bx, (0.006 + bedH) / 2, bz], size: [bw, bedH - 0.006, bd], color: C.concrete, delay: 3.1 + i * 0.06, grow: "rise", finish: { kind: "concrete" } });
    }
    // The lawn strip outside the kerb, 40 cm wide. At an outer corner the n/s strip runs on to
    // cover the corner square and the e/w strip stops where it begins; at an inner corner of an L
    // it's the other way round: both pull back by the same amount, so the e/w strip fills the
    // corner and neither lies over the other wing's kerb (two translucent strips overlapping
    // would z-fight).
    const reach = horizontal ? ring + 0.4 : ring;
    const sa = endOf(lo, -1, reach, reach);
    const sb = endOf(hi, 1, reach, reach);
    const [sx0, sz0, sw0, sd0] = box(out * (ring + 0.2 - kerbT / 2), 0.4);
    const [sxp, szp] = horizontal ? [(sa + sb) / 2, sz0] : [sx0, (sa + sb) / 2];
    const [sw, sd] = horizontal ? [sb - sa, sd0] : [sw0, sb - sa];
    parts.push({ id: `soil-${key}`, layer: "structure", pos: [sxp, top / 2 - 0.004, szp], size: [sw, top - 0.008, sd], color: C.soil, delay: 0, grow: "fade", context: true, opacity: 0.35, finish: { kind: "soil" } });
    parts.push({ id: `turf-${key}`, layer: "structure", pos: [sxp, top - 0.002, szp], size: [sw, 0.012, sd], color: C.lawnEdge, delay: 0, grow: "fade", context: true, opacity: 0.6 });
  });

  return {
    parts,
    dims: zoneDims(l.zones, lang, top),
    extent: extentOf(l.zones, top + 0.3),
    center: centerOf(l.zones),
    layers: [
      { id: "weed_membrane", label: en ? "Geotextile" : "Geotextil", color: C.membrane },
      { id: "paving_base", label: en ? "Crushed stone base" : "Piatră spartă", color: baseColor },
      ...(l.edging ? [{ id: "kerb_concrete", label: en ? "Kerb concrete" : "Beton borduri", color: C.concrete }] : []),
      { id: "paving_sand", label: en ? "Bedding sand" : "Nisip de pozare", color: sandColor },
      ...(l.edging ? [{ id: "paving_edging", label: en ? "Edging" : "Borduri", color: kerbColor }] : []),
      { id: "pavers", label: en ? "Pavers" : "Pavele", color: paverColors[0] },
      { id: "joint_sand", label: en ? "Jointing sand" : "Nisip de rosturi", color: jointColor },
    ],
    duration: 5,
    outdoor: true,
  };
}

/** Draw a layout, with the look of the products in the basket when known. */
export function buildLayout(l: Layout, lang: Lang, look: Look = {}): Build {
  const b = buildShape(l, lang, look);
  return l.items?.length ? withItems(b, l, lang, look) : b;
}

function buildShape(l: Layout, lang: Lang, look: Look): Build {
  switch (l.type) {
    case "deck":
      return deck(l, lang, look);
    case "fence":
      return fence(l, lang, look);
    case "paint_room":
      return paintRoom(l, lang, look);
    case "laminate_floor":
      return laminate(l, lang, look);
    case "tiling":
      return tiling(l, lang, look);
    case "drywall_partition":
      return drywall(l, lang, look);
    case "lawn":
      return lawn(l, lang);
    case "paving":
      return paving(l, lang, look);
  }
}

// ─────────────────────────── placed items ────────────────────────────
type Box = [x: number, y: number, z: number, w: number, h: number, d: number, color?: string, opacity?: number, shape?: Part["shape"]];

/**
 * Each item kind as a few boxes in local coordinates: x across, y up from its base,
 * z from back (−d/2, against the wall) to front (+d/2).
 */
function itemBoxes(kind: ItemKind, color: string, outdoorSet: boolean): Box[] {
  const s = ITEMS[kind];
  const { w, d, h } = s;
  const white = "#f4f4f2";
  const metal = "#9aa1a8";
  const dark = "#2b2d30";
  switch (kind) {
    case "toilet":
      return [
        [0, 0.18, 0.05, w * 0.55, 0.36, d * 0.5, white],
        [0, 0.33, 0.08, w, 0.12, d * 0.7, white],
        [0, 0.41, 0.08, w * 0.95, 0.03, d * 0.66, "#e6e6e2"],
        [0, 0.6, -d / 2 + 0.1, w, 0.4, 0.2, white],
      ];
    case "sink":
      return [
        [0, 0.36, -0.05, 0.18, 0.72, 0.18, white],
        [0, 0.78, 0, w, 0.14, d, white],
        [0, 0.86, -d / 2 + 0.06, 0.05, 0.12, 0.05, metal],
      ];
    case "shower":
      return [
        [0, 0.03, 0, w, 0.06, d, white],
        [0, h / 2, d / 2 - 0.01, w, h - 0.06, 0.012, "#bfe0f5", 0.35],
        [w / 2 - 0.01, h / 2, 0, 0.012, h - 0.06, d, "#bfe0f5", 0.35],
        [0, h - 0.15, -d / 2 + 0.08, 0.18, 0.02, 0.18, metal],
      ];
    case "bathtub":
      return [
        [0, h / 2, 0, w, h, d, white],
        [0, h - 0.005, 0, w - 0.12, 0.012, d - 0.12, "#cfe4f2"],
      ];
    case "mirror":
      return [[0, h / 2, -d / 2 + 0.01, w, h, 0.02, "#c9dbe6"]];
    case "towel_radiator": {
      const rails: Box[] = [];
      for (let i = 0; i < 6; i++) rails.push([0, 0.08 + (i * (h - 0.16)) / 5, -d / 2 + 0.04, w, 0.025, 0.025, "#e9e9e6"]);
      return [[-w / 2 + 0.02, h / 2, -d / 2 + 0.04, 0.03, h, 0.03, "#e9e9e6"], [w / 2 - 0.02, h / 2, -d / 2 + 0.04, 0.03, h, 0.03, "#e9e9e6"], ...rails];
    }
    case "washing_machine":
      return [
        [0, h / 2, 0, w, h, d, "#f1f1ee"],
        [0, h * 0.55, d / 2 + 0.005, 0.34, 0.34, 0.01, "#b8c6d1"],
      ];
    case "ceiling_lamp":
      return [[0, h / 2, 0, w, h, d, color, undefined, "sphere"]];
    case "wall_lamp":
      return [
        [0, h / 2, -d / 2 + 0.01, 0.08, h * 0.8, 0.02, dark],
        [0, h / 2, 0.01, w, h, d * 0.7, color, undefined, "cone"],
      ];
    case "floor_lamp":
      return [
        [0, 0.015, 0, 0.3, 0.03, 0.3, dark, undefined, "cylinder"],
        [0, 0.72, 0, 0.03, 1.4, 0.03, dark, undefined, "cylinder"],
        [0, 1.43, 0, w, 0.32, d, "#efe6d2", undefined, "cone"],
      ];
    case "garden_light":
      return [
        [0, 0.2, 0, 0.07, 0.4, 0.07, dark, undefined, "cylinder"],
        [0, 0.44, 0, w, 0.1, d, "#fff1c2", undefined, "sphere"],
      ];
    case "table": {
      const legs: Box[] = [
        [-w / 2 + 0.06, 0.36, -d / 2 + 0.06, 0.06, 0.72, 0.06, undefined, undefined, "cylinder"],
        [w / 2 - 0.06, 0.36, -d / 2 + 0.06, 0.06, 0.72, 0.06, undefined, undefined, "cylinder"],
        [-w / 2 + 0.06, 0.36, d / 2 - 0.06, 0.06, 0.72, 0.06, undefined, undefined, "cylinder"],
        [w / 2 - 0.06, 0.36, d / 2 - 0.06, 0.06, 0.72, 0.06, undefined, undefined, "cylinder"],
      ];
      const top: Box = [0, 0.74, 0, w, 0.04, d];
      if (!outdoorSet) return [top, ...legs];
      // The retailer's set comes with four chairs: two on each long side.
      const chairs: Box[] = [];
      for (const cx of [-w / 4, w / 4])
        for (const side of [-1, 1]) {
          const cz = side * (d / 2 + 0.3);
          chairs.push([cx, 0.45, cz, 0.44, 0.05, 0.42], [cx, 0.7, cz + side * 0.2, 0.44, 0.45, 0.04], [cx, 0.22, cz, 0.36, 0.44, 0.04]);
        }
      return [top, ...legs, ...chairs];
    }
    case "chair":
      return [
        [0, 0.45, 0.02, w, 0.05, d - 0.04],
        [0, 0.7, -d / 2 + 0.03, w, 0.45, 0.04],
        [-w / 2 + 0.04, 0.22, d / 2 - 0.06, 0.04, 0.44, 0.04, undefined, undefined, "cylinder"],
        [w / 2 - 0.04, 0.22, d / 2 - 0.06, 0.04, 0.44, 0.04, undefined, undefined, "cylinder"],
        [-w / 2 + 0.04, 0.22, -d / 2 + 0.06, 0.04, 0.44, 0.04, undefined, undefined, "cylinder"],
        [w / 2 - 0.04, 0.22, -d / 2 + 0.06, 0.04, 0.44, 0.04, undefined, undefined, "cylinder"],
      ];
    case "sofa":
      return [
        [0, 0.22, 0.05, w - 0.3, 0.44, d - 0.1],
        [0, 0.6, -d / 2 + 0.12, w, 0.5, 0.24],
        [-w / 2 + 0.1, 0.32, 0, 0.2, 0.64, d],
        [w / 2 - 0.1, 0.32, 0, 0.2, 0.64, d],
      ];
    case "bed":
      return [
        [0, 0.15, 0, w, 0.3, d],
        [0, 0.38, 0.03, w - 0.06, 0.18, d - 0.12, "#f3efe6"],
        [0, 0.55, -d / 2 + 0.03, w, 0.9, 0.06],
        [-w / 4, 0.5, -d / 2 + 0.25, w / 2 - 0.1, 0.1, 0.3, "#ffffff"],
        [w / 4, 0.5, -d / 2 + 0.25, w / 2 - 0.1, 0.1, 0.3, "#ffffff"],
      ];
    case "wardrobe":
      return [
        [-w / 4, h / 2, 0, w / 2 - 0.005, h, d],
        [w / 4, h / 2, 0, w / 2 - 0.005, h, d, "#c2ad8f"],
      ];
    case "tv":
      return [[0, h / 2, -d / 2 + 0.03, w, h, 0.05, dark]];
    case "radiator":
      return [[0, h / 2, -d / 2 + 0.05, w, h, 0.08, "#ededea"]];
    case "plant":
      return [
        [0, 0.15, 0, 0.3, 0.3, 0.3, "#b86b45"],
        [0, 0.62, 0, w, 0.64, d, "#5d8f4e"],
      ];
    case "planter":
      return [
        [0, h / 2, 0, w, h, d],
        [0, h + 0.12, 0, w - 0.1, 0.24, d - 0.08, "#5d8f4e"],
      ];
    case "bbq":
      return [
        [-0.18, 0.3, 0.1, 0.03, 0.6, 0.03, dark, undefined, "cylinder"],
        [0.18, 0.3, 0.1, 0.03, 0.6, 0.03, dark, undefined, "cylinder"],
        [0, 0.3, -0.18, 0.03, 0.6, 0.03, dark, undefined, "cylinder"],
        [0, 0.75, 0, 0.56, 0.3, 0.56, undefined, undefined, "cylinder"],
        [0, 0.98, 0, 0.5, 0.16, 0.5, undefined, undefined, "sphere"],
        [w / 2 - 0.12, 0.62, 0, 0.22, 0.03, 0.4, metal],
      ];
    case "lounger":
      return [
        [0, 0.18, 0.2, w, 0.1, d - 0.6],
        [0, 0.38, -d / 2 + 0.3, w, 0.5, 0.12],
        [-w / 2 + 0.04, 0.1, 0, 0.04, 0.2, d - 0.1, "#8a6a4a"],
        [w / 2 - 0.04, 0.1, 0, 0.04, 0.2, d - 0.1, "#8a6a4a"],
      ];
    case "parasol":
      return [
        [0, 0.04, 0, 0.4, 0.08, 0.4, dark, undefined, "cylinder"],
        [0, h / 2, 0, 0.04, h, 0.04, "#8a8f94", undefined, "cylinder"],
        [0, h - 0.02, 0, 2.4, 0.3, 2.4, color, 0.92, "cone"],
      ];
  }
}

function withItems(b: Build, l: Layout, lang: Lang, look: Look): Build {
  const parts = [...b.parts];
  const outdoor = isOutdoor(l.type);
  const layers = new Map<string, { label: string; color: string }>();
  (l.items ?? []).forEach((it, i) => {
    const spec = ITEMS[it.kind];
    const role = itemRole(it.kind, l.type);
    const layer = role ?? "items";
    const color = (role && look[role]?.color) || spec.color;
    if (!layers.has(layer)) {
      layers.set(layer, role ? { label: lang === "en" ? MATERIAL_ROLES[role].labelEn : MATERIAL_ROLES[role].label, color } : { label: lang === "en" ? "Other items" : "Alte obiecte", color: "#9aa3ad" });
    }
    const c = itemContainer(l, it.zone, { x: it.x, z: it.z });
    const base = spec.mount === "ceiling" ? (c.ceilingY ?? 2.6) - spec.h : spec.mount === "wall" ? c.floorY + (spec.elevation ?? 1) : c.floorY;
    itemBoxes(it.kind, color, outdoor && it.kind === "table").forEach(([x, y, z, w, h, d, col, op, shape], k) => {
      const [rx, rz] = rotXZ(x, z, it.rot);
      const sideways = it.rot % 180 !== 0;
      parts.push({
        id: `item-${it.id}-${k}`,
        layer,
        pos: [it.x + rx, base + y, it.z + rz],
        size: sideways ? [d, h, w] : [w, h, d],
        color: col ?? color,
        opacity: op,
        delay: b.duration * 0.85 + i * 0.15 + k * 0.04,
        grow: "pop",
        shape,
      });
    });
  });
  return { ...b, parts, layers: [...b.layers, ...[...layers].map(([id, v]) => ({ id, ...v }))], duration: b.duration + 0.6 };
}

/** Draw a project from plain calculator inputs (landing hero, projects without a stored layout). */
export function buildScene(type: ProjectType, inputs: Record<string, unknown>, lang: Lang, layout?: Layout, look?: Look): Build {
  return buildLayout(layout ?? defaultLayout(type, inputs ?? {}), lang, look);
}
