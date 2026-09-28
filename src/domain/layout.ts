import type { ProjectType } from "./calculators";
import type { Lang } from "./types";

/**
 * The editable project sketch ("layout"). It is the single source of truth for a
 * project: the 3D sketch is drawn from it and the calculators compute quantities
 * from it, so what the customer sees and what they buy can never disagree.
 *
 * Plan coordinates are metres: x grows east, z grows south (three.js axes).
 * Zones are axis-aligned rectangles; openings sit on a wall (or fence segment)
 * at a relative position 0..1 along it.
 */

export type Side = "n" | "e" | "s" | "w";
export const SIDES: Side[] = ["n", "e", "s", "w"];

export interface Zone {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface Opening {
  id: string;
  kind: "door" | "window" | "gate";
  /** Wall of the room/zone for rooms; for fences the segment index as string ("0", "1"…). */
  wall: string;
  /** Zone the wall belongs to (zone-based layouts). */
  zone?: string;
  /** Centre along the wall, 0..1. */
  pos: number;
  width: number;
  height: number;
}

export interface Steps {
  id: string;
  zone: string;
  side: Side;
  width: number;
  count: number;
}

export interface Point {
  x: number;
  z: number;
}

export type Layout =
  | { type: "deck"; zones: Zone[]; heightM: number; steps: Steps[]; direction: "x" | "z"; base: "soil" | "gravel" | "concrete_slab" }
  | { type: "laminate_floor"; zones: Zone[]; openings: Opening[]; pattern: "straight" | "diagonal"; subfloor: "concrete" | "wood" | "old_tiles" }
  | { type: "lawn"; zones: Zone[]; mode: "new" | "overseed" }
  | {
      type: "paint_room";
      w: number;
      d: number;
      h: number;
      openings: Opening[];
      ceiling: boolean;
      coats: number;
      surface: "fresh_plaster" | "repaint" | "dark_to_light";
    }
  | {
      type: "tiling";
      w: number;
      d: number;
      roomType: "bathroom" | "kitchen" | "other";
      floor: boolean;
      wallHeights: Record<Side, number>;
      openings: Opening[];
      largeFormat: boolean;
    }
  | { type: "fence"; points: Point[]; heightM: number; gates: Opening[] }
  | { type: "drywall_partition"; length: number; heightM: number; openings: Opening[]; insulation: boolean; doubleLayer: boolean; wetRoom: boolean };

// ───────────────────────────── helpers ─────────────────────────────

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : d);
const r2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
let seq = 0;
const nid = (p: string) => `${p}${(++seq).toString(36)}${Date.now().toString(36).slice(-3)}`;

export function zoneArea(zones: Zone[]): number {
  return r2(zones.reduce((s, z) => s + z.w * z.d, 0));
}

export function bbox(zones: Zone[]) {
  const minX = Math.min(...zones.map((z) => z.x));
  const minZ = Math.min(...zones.map((z) => z.z));
  const maxX = Math.max(...zones.map((z) => z.x + z.w));
  const maxZ = Math.max(...zones.map((z) => z.z + z.d));
  return { minX, minZ, maxX, maxZ, w: maxX - minX, d: maxZ - minZ };
}

/**
 * Perimeter of the union of axis-aligned rectangles (edges shared by two zones
 * don't count — an L-shaped room has one skirting run, not two boxes' worth).
 * Rasterises on a 5 cm grid, which is plenty for skirting/edge quantities.
 */
export function unionPerimeter(zones: Zone[]): number {
  if (zones.length === 0) return 0;
  if (zones.length === 1) return r2(2 * (zones[0].w + zones[0].d));
  const cell = 0.05;
  const b = bbox(zones);
  const nx = Math.round(b.w / cell);
  const nz = Math.round(b.d / cell);
  const grid = new Uint8Array(nx * nz);
  for (const z of zones) {
    const x0 = Math.round((z.x - b.minX) / cell);
    const z0 = Math.round((z.z - b.minZ) / cell);
    const x1 = Math.round((z.x + z.w - b.minX) / cell);
    const z1 = Math.round((z.z + z.d - b.minZ) / cell);
    for (let i = x0; i < x1; i++) for (let j = z0; j < z1; j++) grid[j * nx + i] = 1;
  }
  let edges = 0;
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= nx || j >= nz ? 0 : grid[j * nx + i]);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      if (!at(i, j)) continue;
      edges += Number(!at(i - 1, j)) + Number(!at(i + 1, j)) + Number(!at(i, j - 1)) + Number(!at(i, j + 1));
    }
  return r2(edges * cell);
}

/**
 * Outline edges of a set of touching rectangles: every zone side minus the parts
 * shared with a neighbouring zone. Used to draw walls/skirting around an L-shape.
 */
export function exposedEdges(zones: Zone[]): { side: Side; x1: number; z1: number; x2: number; z2: number }[] {
  const eps = 0.02;
  const out: { side: Side; x1: number; z1: number; x2: number; z2: number }[] = [];
  const subtract = (iv: [number, number][], cut: [number, number]) =>
    iv.flatMap(([a, b]) => {
      if (cut[1] <= a + eps || cut[0] >= b - eps) return [[a, b] as [number, number]];
      const res: [number, number][] = [];
      if (cut[0] > a + eps) res.push([a, cut[0]]);
      if (cut[1] < b - eps) res.push([cut[1], b]);
      return res;
    });
  for (const z of zones) {
    const sides: [Side, number, [number, number]][] = [
      ["n", z.z, [z.x, z.x + z.w]],
      ["s", z.z + z.d, [z.x, z.x + z.w]],
      ["w", z.x, [z.z, z.z + z.d]],
      ["e", z.x + z.w, [z.z, z.z + z.d]],
    ];
    for (const [side, at, span] of sides) {
      let iv: [number, number][] = [span];
      for (const o of zones) {
        if (o === z) continue;
        if (side === "n" && Math.abs(o.z + o.d - at) < eps) iv = subtract(iv, [o.x, o.x + o.w]);
        if (side === "s" && Math.abs(o.z - at) < eps) iv = subtract(iv, [o.x, o.x + o.w]);
        if (side === "w" && Math.abs(o.x + o.w - at) < eps) iv = subtract(iv, [o.z, o.z + o.d]);
        if (side === "e" && Math.abs(o.x - at) < eps) iv = subtract(iv, [o.z, o.z + o.d]);
      }
      for (const [a, b] of iv) {
        if (side === "n" || side === "s") out.push({ side, x1: a, z1: at, x2: b, z2: at });
        else out.push({ side, x1: at, z1: a, x2: at, z2: b });
      }
    }
  }
  return out;
}

/** Wall length of a rectangular room side. */
export function wallLength(w: number, d: number, side: string): number {
  return side === "n" || side === "s" ? w : d;
}

export function fenceSegments(points: Point[]): { a: Point; b: Point; length: number }[] {
  const out: { a: Point; b: Point; length: number }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    out.push({ a, b, length: r2(Math.hypot(b.x - a.x, b.z - a.z)) });
  }
  return out;
}

function spreadOpenings(n: number, kind: Opening["kind"], wall: string, width: number, height: number, zone?: string): Opening[] {
  // Deterministic ids for defaults so re-deriving a layout never looks like an edit.
  return Array.from({ length: n }, (_, i) => ({ id: `${kind[0]}${wall}${i + 1}`, kind, wall, zone, pos: r2((i + 1) / (n + 1)), width, height }));
}

// ───────────────────────── defaults from calculator inputs ─────────────────────────

/** Build the initial layout from the (defaulted) calculator inputs. */
export function defaultLayout(type: ProjectType, i: Record<string, unknown>): Layout {
  switch (type) {
    case "deck": {
      const L = num(i.lengthM, 4);
      const W = num(i.widthM, 3);
      return { type, zones: [{ id: "A", x: -L / 2, z: -W / 2, w: L, d: W }], heightM: 0.18, steps: [], direction: "x", base: (i.base as "soil") ?? "soil" };
    }
    case "laminate_floor": {
      const L = num(i.lengthM, 5);
      const W = num(i.widthM, 4);
      const doorways = typeof i.doorways === "number" ? i.doorways : 1;
      return {
        type,
        zones: [{ id: "A", x: -L / 2, z: -W / 2, w: L, d: W }],
        openings: spreadOpenings(doorways, "door", "s", 0.9, 2.05, "A"),
        pattern: i.pattern === "diagonal" ? "diagonal" : "straight",
        subfloor: (i.subfloor as "concrete") ?? "concrete",
      };
    }
    case "lawn": {
      const area = num(i.areaM2, 80);
      const w = r2(Math.sqrt(area * 1.4));
      const d = r2(area / w);
      return { type, zones: [{ id: "A", x: -w / 2, z: -d / 2, w, d }], mode: i.mode === "overseed" ? "overseed" : "new" };
    }
    case "paint_room": {
      const doors = typeof i.doors === "number" ? i.doors : 1;
      const windows = typeof i.windows === "number" ? i.windows : 1;
      return {
        type,
        w: num(i.lengthM, 4),
        d: num(i.widthM, 3.5),
        h: num(i.heightM, 2.6),
        openings: [...spreadOpenings(doors, "door", "w", 0.9, 2.1), ...spreadOpenings(windows, "window", "n", 1.2, 1.5)],
        ceiling: i.paintCeiling !== false,
        coats: num(i.coats, 2),
        surface: (i.surface as "repaint") ?? "repaint",
      };
    }
    case "tiling": {
      const h = typeof i.wallTileHeightM === "number" ? i.wallTileHeightM : i.roomType === "bathroom" ? 2.1 : 0;
      const doors = typeof i.doors === "number" ? i.doors : 1;
      return {
        type,
        w: num(i.lengthM, 2.5),
        d: num(i.widthM, 2),
        roomType: (i.roomType as "bathroom") ?? "bathroom",
        floor: i.tileFloor !== false,
        wallHeights: { n: h, e: h, s: h, w: h },
        openings: spreadOpenings(doors, "door", "s", 0.8, 2.05),
        largeFormat: i.largeFormat !== false,
      };
    }
    case "fence": {
      const len = num(i.lengthM, 20);
      return { type, points: [{ x: -len / 2, z: 0 }, { x: len / 2, z: 0 }], heightM: num(i.heightM, 1.8), gates: [] };
    }
    case "drywall_partition": {
      const doors = typeof i.doors === "number" ? i.doors : 0;
      return {
        type,
        length: num(i.lengthM, 3.5),
        heightM: num(i.heightM, 2.6),
        openings: spreadOpenings(doors, "door", "s", 0.9, 2.05),
        insulation: i.insulation !== false,
        doubleLayer: i.doubleLayer === true,
        wetRoom: i.wetRoom === true,
      };
    }
  }
}

/** Calculator params for a layout (the calculators understand zones, openings, gates, steps). */
export function layoutParams(l: Layout): Record<string, unknown> {
  switch (l.type) {
    case "deck": {
      const b = bbox(l.zones);
      return { lengthM: r2(b.w), widthM: r2(b.d), zones: l.zones, heightM: l.heightM, steps: l.steps, direction: l.direction, base: l.base };
    }
    case "laminate_floor": {
      const b = bbox(l.zones);
      return { lengthM: r2(b.w), widthM: r2(b.d), zones: l.zones, doorways: l.openings.length, pattern: l.pattern, subfloor: l.subfloor };
    }
    case "lawn":
      return { areaM2: zoneArea(l.zones), zones: l.zones, mode: l.mode };
    case "paint_room":
      return {
        lengthM: l.w,
        widthM: l.d,
        heightM: l.h,
        doors: l.openings.filter((o) => o.kind === "door").length,
        windows: l.openings.filter((o) => o.kind === "window").length,
        openings: l.openings,
        paintCeiling: l.ceiling,
        coats: l.coats,
        surface: l.surface,
      };
    case "tiling":
      return {
        lengthM: l.w,
        widthM: l.d,
        roomType: l.roomType,
        tileFloor: l.floor,
        wallTileHeightM: Math.max(...SIDES.map((s) => l.wallHeights[s])),
        wallHeights: l.wallHeights,
        doors: l.openings.length,
        openings: l.openings,
        largeFormat: l.largeFormat,
      };
    case "fence": {
      const segs = fenceSegments(l.points);
      return { lengthM: r2(segs.reduce((s, x) => s + x.length, 0)), heightM: l.heightM, segments: segs.map((s) => s.length), gates: l.gates };
    }
    case "drywall_partition":
      return { lengthM: l.length, heightM: l.heightM, doors: l.openings.length, insulation: l.insulation, doubleLayer: l.doubleLayer, wetRoom: l.wetRoom };
  }
}

// ───────────────────────────── edit operations ─────────────────────────────

/**
 * One edit to the sketch. The agent (edit_sketch tool) and the plan editor
 * produce exactly these, so both paths share validation and the change log.
 */
export interface SketchOp {
  op:
    | "resize"
    | "add_zone"
    | "remove_zone"
    | "add_steps"
    | "remove_steps"
    | "set_height"
    | "add_opening"
    | "remove_opening"
    | "move_opening"
    | "set_wall_tiles"
    | "add_fence_segment"
    | "set_segment_length"
    | "remove_fence_segment"
    | "set_option";
  zone?: string | null;
  w?: number | null;
  d?: number | null;
  h?: number | null;
  side?: Side | null;
  align?: "start" | "center" | "end" | null;
  width?: number | null;
  count?: number | null;
  value?: number | string | boolean | null;
  kind?: "door" | "window" | "gate" | null;
  wall?: string | null;
  pos?: number | null;
  id?: string | null;
  segment?: number | null;
  length?: number | null;
  turn?: "left" | "right" | "straight" | null;
  key?: string | null;
}

export class SketchEditError extends Error {}

const SIDE_NAMES: Record<Side, { ro: string; en: string }> = {
  n: { ro: "nord", en: "north" },
  e: { ro: "est", en: "east" },
  s: { ro: "sud", en: "south" },
  w: { ro: "vest", en: "west" },
};
const fmt = (n: number, lang: Lang) => n.toLocaleString(lang === "en" ? "en-GB" : "ro-RO", { maximumFractionDigits: 2 });

function need<T>(v: T | null | undefined, name: string): T {
  if (v === null || v === undefined) throw new SketchEditError(`"${name}" is required for this edit`);
  return v;
}

function dim(v: number | null | undefined, name: string, lo: number, hi: number): number {
  const n = Number(need(v, name));
  if (!Number.isFinite(n) || n < lo || n > hi) throw new SketchEditError(`"${name}" must be between ${lo} and ${hi} m`);
  return r2(n);
}

function findZone(zones: Zone[], id: string | null | undefined): Zone {
  const z = id ? zones.find((x) => x.id === id) : zones[0];
  if (!z) throw new SketchEditError(`Unknown zone "${id}". Zones: ${zones.map((x) => x.id).join(", ")}`);
  return z;
}

/** Attach a new rectangle to a side of an existing zone. */
function attachZone(zones: Zone[], to: Zone, side: Side, w: number, d: number, align: "start" | "center" | "end"): Zone {
  let n = 0;
  while (zones.some((z) => z.id === String.fromCharCode(65 + n))) n++;
  const id = String.fromCharCode(65 + n); // first free letter: A, B, C…
  const along = (len: number, base: number, full: number) => (align === "start" ? base : align === "end" ? base + full - len : base + (full - len) / 2);
  let x: number;
  let z: number;
  if (side === "e" || side === "w") {
    x = side === "e" ? to.x + to.w : to.x - w;
    z = along(d, to.z, to.d);
  } else {
    z = side === "s" ? to.z + to.d : to.z - d;
    x = along(w, to.x, to.w);
  }
  return { id, x: r2(x), z: r2(z), w, d };
}

function overlaps(a: Zone, b: Zone): boolean {
  return a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 && a.z < b.z + b.d - 0.01 && b.z < a.z + a.d - 0.01;
}

/**
 * Apply edits, validating every one. Returns the new layout plus a readable
 * change log for the customer ("Added a 2 × 2 m wing on the east side").
 */
export function applyOps(layout: Layout, ops: SketchOp[], lang: Lang = "ro"): { layout: Layout; changes: string[] } {
  const en = lang === "en";
  const l: Layout = structuredClone(layout);
  const changes: string[] = [];
  const say = (ro: string, e: string) => changes.push(en ? e : ro);

  for (const o of ops.slice(0, 12)) {
    switch (o.op) {
      case "resize": {
        if (l.type === "deck" || l.type === "laminate_floor" || l.type === "lawn") {
          const z = findZone(l.zones, o.zone);
          if (o.w != null) z.w = dim(o.w, "w", 0.5, 30);
          if (o.d != null) z.d = dim(o.d, "d", 0.5, 30);
          if (l.zones.some((x) => x !== z && overlaps(x, z))) throw new SketchEditError("Resized zone would overlap another zone");
          say(`Zona ${z.id} are acum ${fmt(z.w, lang)} × ${fmt(z.d, lang)} m`, `Zone ${z.id} is now ${fmt(z.w, lang)} × ${fmt(z.d, lang)} m`);
        } else if (l.type === "paint_room" || l.type === "tiling") {
          if (o.w != null) l.w = dim(o.w, "w", 0.8, 20);
          if (o.d != null) l.d = dim(o.d, "d", 0.8, 20);
          if (o.h != null && l.type === "paint_room") l.h = dim(o.h, "h", 2, 5);
          say(`Camera are acum ${fmt(l.w, lang)} × ${fmt(l.d, lang)} m`, `The room is now ${fmt(l.w, lang)} × ${fmt(l.d, lang)} m`);
        } else if (l.type === "drywall_partition") {
          if (o.w != null) l.length = dim(o.w, "w", 0.6, 20);
          if (o.h != null) l.heightM = dim(o.h, "h", 2, 5);
          say(`Peretele are acum ${fmt(l.length, lang)} × ${fmt(l.heightM, lang)} m`, `The wall is now ${fmt(l.length, lang)} × ${fmt(l.heightM, lang)} m`);
        } else if (l.type === "fence") {
          const total = dim(o.w ?? o.length, "length", 1, 300);
          const segs = fenceSegments(l.points);
          const cur = segs.reduce((s, x) => s + x.length, 0);
          const k = total / cur;
          const p0 = l.points[0];
          l.points = l.points.map((p) => ({ x: r2(p0.x + (p.x - p0.x) * k), z: r2(p0.z + (p.z - p0.z) * k) }));
          say(`Gardul are acum ${fmt(total, lang)} m`, `The fence is now ${fmt(total, lang)} m long`);
        }
        break;
      }
      case "add_zone": {
        if (l.type !== "deck" && l.type !== "laminate_floor" && l.type !== "lawn") throw new SketchEditError("This project has no zones");
        if (l.zones.length >= 6) throw new SketchEditError("Maximum 6 zones");
        const to = findZone(l.zones, o.zone);
        const side = need(o.side, "side");
        const nz = attachZone(l.zones, to, side, dim(o.w, "w", 0.5, 30), dim(o.d, "d", 0.5, 30), o.align ?? "start");
        if (l.zones.some((x) => overlaps(x, nz))) throw new SketchEditError("The new zone would overlap an existing one — try another side or alignment");
        l.zones.push(nz);
        say(
          `Adăugată zona ${nz.id} de ${fmt(nz.w, lang)} × ${fmt(nz.d, lang)} m pe latura de ${SIDE_NAMES[side].ro} a zonei ${to.id}`,
          `Added zone ${nz.id}, ${fmt(nz.w, lang)} × ${fmt(nz.d, lang)} m, on the ${SIDE_NAMES[side].en} side of zone ${to.id}`,
        );
        break;
      }
      case "remove_zone": {
        if (l.type !== "deck" && l.type !== "laminate_floor" && l.type !== "lawn") throw new SketchEditError("This project has no zones");
        if (l.zones.length <= 1) throw new SketchEditError("Can't remove the only zone");
        const z = findZone(l.zones, need(o.zone, "zone"));
        l.zones = l.zones.filter((x) => x !== z);
        if (l.type === "deck") l.steps = l.steps.filter((s) => s.zone !== z.id);
        if (l.type === "laminate_floor") l.openings = l.openings.filter((x) => x.zone !== z.id);
        say(`Eliminată zona ${z.id}`, `Removed zone ${z.id}`);
        break;
      }
      case "add_steps": {
        if (l.type !== "deck") throw new SketchEditError("Steps are only for decks");
        if (l.steps.length >= 4) throw new SketchEditError("Maximum 4 flights of steps");
        const z = findZone(l.zones, o.zone);
        const side = o.side ?? "s";
        const width = dim(o.width ?? Math.min(1.5, wallLength(z.w, z.d, side)), "width", 0.6, wallLength(z.w, z.d, side));
        const count = Math.round(clamp(Number(o.count ?? Math.max(1, Math.round(l.heightM / 0.17))), 1, 6));
        l.steps.push({ id: nid("st"), zone: z.id, side, width, count });
        say(
          `${count} ${count === 1 ? "treaptă" : "trepte"} de ${fmt(width, lang)} m pe latura de ${SIDE_NAMES[side].ro}`,
          `${count} step${count === 1 ? "" : "s"}, ${fmt(width, lang)} m wide, on the ${SIDE_NAMES[side].en} side`,
        );
        break;
      }
      case "remove_steps": {
        if (l.type !== "deck") throw new SketchEditError("Steps are only for decks");
        l.steps = [];
        say("Treptele au fost eliminate", "Removed the steps");
        break;
      }
      case "set_height": {
        const v = Number(need(o.value ?? o.h, "value"));
        if (l.type === "deck") {
          l.heightM = dim(v, "value", 0.1, 1.2);
          say(`Terasa e acum la ${fmt(l.heightM * 100, lang)} cm de sol`, `The deck now sits ${fmt(l.heightM * 100, lang)} cm above ground`);
        } else if (l.type === "fence") {
          const allowed = [0.9, 1.2, 1.8];
          l.heightM = allowed.reduce((a, c) => (Math.abs(c - v) < Math.abs(a - v) ? c : a), 1.8);
          say(`Înălțime gard: ${fmt(l.heightM, lang)} m (panou standard)`, `Fence height: ${fmt(l.heightM, lang)} m (standard panel)`);
        } else if (l.type === "paint_room") {
          l.h = dim(v, "value", 2, 5);
          say(`Înălțime cameră: ${fmt(l.h, lang)} m`, `Room height: ${fmt(l.h, lang)} m`);
        } else if (l.type === "drywall_partition") {
          l.heightM = dim(v, "value", 2, 5);
          say(`Înălțime perete: ${fmt(l.heightM, lang)} m`, `Wall height: ${fmt(l.heightM, lang)} m`);
        } else throw new SketchEditError("This project has no height to set");
        break;
      }
      case "add_opening": {
        const kind = need(o.kind, "kind");
        if (l.type === "fence") {
          if (kind !== "gate") throw new SketchEditError("Fences take gates");
          if (l.gates.length >= 4) throw new SketchEditError("Maximum 4 gates");
          const segs = fenceSegments(l.points);
          const segment = clamp(Math.round(Number(o.segment ?? 0)), 0, segs.length - 1);
          const width = Number(o.width ?? 1) >= 2 ? 3 : 1;
          if (segs[segment].length < width + 0.5) throw new SketchEditError("That fence segment is too short for this gate");
          l.gates.push({ id: nid("g"), kind: "gate", wall: String(segment), pos: clamp(Number(o.pos ?? 0.5), 0.1, 0.9), width, height: l.heightM });
          say(
            width === 3 ? `Poartă dublă de 3 m pe segmentul ${segment + 1}` : `Poartă pietonală de 1 m pe segmentul ${segment + 1}`,
            width === 3 ? `3 m double gate on segment ${segment + 1}` : `1 m pedestrian gate on segment ${segment + 1}`,
          );
        } else if (l.type === "paint_room" || l.type === "tiling" || l.type === "drywall_partition" || l.type === "laminate_floor") {
          if (kind === "gate") throw new SketchEditError("Gates are only for fences");
          if (kind === "window" && l.type !== "paint_room") throw new SketchEditError("Windows only affect painting projects here");
          const list = l.openings;
          if (list.length >= 8) throw new SketchEditError("Maximum 8 openings");
          const wall = (o.wall ?? o.side ?? (kind === "window" ? "n" : "s")) as Side;
          const width = dim(o.width ?? (kind === "window" ? 1.2 : 0.9), "width", 0.5, 3);
          list.push({
            id: nid(kind[0]),
            kind,
            wall,
            zone: l.type === "laminate_floor" ? (o.zone ?? l.zones[0].id) : undefined,
            pos: clamp(Number(o.pos ?? 0.5), 0.1, 0.9),
            width,
            height: kind === "window" ? 1.5 : 2.05,
          });
          const label = kind === "door" ? (en ? "door" : "ușă") : en ? "window" : "fereastră";
          say(`Adăugată ${label} (${fmt(width, lang)} m) pe peretele de ${SIDE_NAMES[wall]?.ro ?? wall}`, `Added a ${label} (${fmt(width, lang)} m) on the ${SIDE_NAMES[wall]?.en ?? wall} wall`);
        } else throw new SketchEditError("This project has no openings");
        break;
      }
      case "remove_opening":
      case "move_opening": {
        const list = l.type === "fence" ? l.gates : "openings" in l ? l.openings : null;
        if (!list) throw new SketchEditError("This project has no openings");
        const target = o.id ? list.find((x) => x.id === o.id) : [...list].reverse().find((x) => !o.kind || x.kind === o.kind);
        if (!target) throw new SketchEditError("No such opening");
        if (o.op === "remove_opening") {
          list.splice(list.indexOf(target), 1);
          say("Deschidere eliminată", "Removed the opening");
        } else {
          if (o.pos != null) target.pos = clamp(Number(o.pos), 0.1, 0.9);
          if (o.wall != null) target.wall = String(o.wall);
          say("Deschidere mutată", "Moved the opening");
        }
        break;
      }
      case "set_wall_tiles": {
        if (l.type !== "tiling") throw new SketchEditError("Wall tiles are only for tiling projects");
        const h = dim(Number(o.value ?? o.h ?? 0), "value", 0, 3);
        const walls = o.wall === "all" || !o.wall ? SIDES : [o.wall as Side];
        for (const s of walls) l.wallHeights[s] = h;
        say(
          h === 0 ? "Fără faianță pe peretele ales" : `Faianță până la ${fmt(h, lang)} m pe ${walls.length === 4 ? "toți pereții" : `peretele de ${SIDE_NAMES[walls[0]].ro}`}`,
          h === 0 ? "No wall tiles on that wall" : `Wall tiles up to ${fmt(h, lang)} m on ${walls.length === 4 ? "all walls" : `the ${SIDE_NAMES[walls[0]].en} wall`}`,
        );
        break;
      }
      case "add_fence_segment": {
        if (l.type !== "fence") throw new SketchEditError("Segments are only for fences");
        if (l.points.length >= 7) throw new SketchEditError("Maximum 6 segments");
        const len = dim(o.length ?? o.w, "length", 1, 100);
        const n = l.points.length;
        const a = l.points[n - 2];
        const b = l.points[n - 1];
        const ang = Math.atan2(b.z - a.z, b.x - a.x) + (o.turn === "left" ? -Math.PI / 2 : o.turn === "right" ? Math.PI / 2 : 0);
        l.points.push({ x: r2(b.x + Math.cos(ang) * len), z: r2(b.z + Math.sin(ang) * len) });
        say(
          `Gardul continuă ${o.turn === "left" ? "la stânga" : o.turn === "right" ? "la dreapta" : "drept"} cu ${fmt(len, lang)} m`,
          `The fence continues ${o.turn === "left" ? "left" : o.turn === "right" ? "right" : "straight"} for ${fmt(len, lang)} m`,
        );
        break;
      }
      case "set_segment_length": {
        if (l.type !== "fence") throw new SketchEditError("Segments are only for fences");
        const i = clamp(Math.round(Number(o.segment ?? 0)), 0, l.points.length - 2);
        const len = dim(o.length ?? o.w, "length", 1, 100);
        const a = l.points[i];
        const b = l.points[i + 1];
        const cur = Math.hypot(b.x - a.x, b.z - a.z);
        const dx = ((b.x - a.x) / cur) * (len - cur);
        const dz = ((b.z - a.z) / cur) * (len - cur);
        for (let k = i + 1; k < l.points.length; k++) l.points[k] = { x: r2(l.points[k].x + dx), z: r2(l.points[k].z + dz) };
        say(`Segmentul ${i + 1} are acum ${fmt(len, lang)} m`, `Segment ${i + 1} is now ${fmt(len, lang)} m`);
        break;
      }
      case "remove_fence_segment": {
        if (l.type !== "fence") throw new SketchEditError("Segments are only for fences");
        if (l.points.length <= 2) throw new SketchEditError("Can't remove the only segment");
        l.points.pop();
        const segCount = l.points.length - 1;
        l.gates = l.gates.filter((g) => Number(g.wall) < segCount);
        say("Ultimul segment de gard a fost eliminat", "Removed the last fence segment");
        break;
      }
      case "set_option": {
        const key = need(o.key, "key");
        const v = o.value;
        const bool = v === true || v === "true" || v === "da" || v === "yes";
        if (l.type === "deck" && key === "base" && ["soil", "gravel", "concrete_slab"].includes(String(v))) l.base = v as "soil";
        else if (l.type === "deck" && key === "direction" && ["x", "z"].includes(String(v))) l.direction = v as "x";
        else if (l.type === "laminate_floor" && key === "pattern" && ["straight", "diagonal"].includes(String(v))) l.pattern = v as "straight";
        else if (l.type === "laminate_floor" && key === "subfloor" && ["concrete", "wood", "old_tiles"].includes(String(v))) l.subfloor = v as "concrete";
        else if (l.type === "paint_room" && key === "ceiling") l.ceiling = bool;
        else if (l.type === "paint_room" && key === "coats") l.coats = clamp(Math.round(Number(v)), 1, 4);
        else if (l.type === "paint_room" && key === "surface" && ["fresh_plaster", "repaint", "dark_to_light"].includes(String(v))) l.surface = v as "repaint";
        else if (l.type === "tiling" && key === "floor") l.floor = bool;
        else if (l.type === "tiling" && key === "largeFormat") l.largeFormat = bool;
        else if (l.type === "drywall_partition" && key === "insulation") l.insulation = bool;
        else if (l.type === "drywall_partition" && key === "doubleLayer") l.doubleLayer = bool;
        else if (l.type === "lawn" && key === "mode" && ["new", "overseed"].includes(String(v))) l.mode = v as "new";
        else throw new SketchEditError(`Option "${key}" = ${JSON.stringify(v)} is not valid for this project`);
        say(`Setare actualizată: ${key}`, `Updated setting: ${key}`);
        break;
      }
      default:
        throw new SketchEditError(`Unknown edit "${(o as SketchOp).op}"`);
    }
  }

  // Coordinates stay put across edits (the scene centres the drawing itself), so
  // unchanged parts keep their exact position and only real changes animate.
  return { layout: l, changes };
}

/** Compact description of the layout for the model (ids it can reference in edits). */
export function describeLayout(l: Layout): unknown {
  switch (l.type) {
    case "deck":
    case "laminate_floor":
    case "lawn":
      return { type: l.type, zones: l.zones.map((z) => ({ id: z.id, w: z.w, d: z.d, x: z.x, z: z.z })), ...("steps" in l ? { steps: l.steps, heightM: l.heightM } : {}), ...("openings" in l ? { openings: l.openings } : {}) };
    case "fence":
      return { type: l.type, segments: fenceSegments(l.points).map((s, i) => ({ segment: i, length: s.length })), heightM: l.heightM, gates: l.gates };
    default:
      return l;
  }
}
