import type { ProjectType } from "./calculators";
import { ITEMS, ITEM_KINDS, ROT_FOR_WALL, footprint, itemRect, lowerFirst, overlaps as rectsOverlap, verticalRange } from "./items";
import type { Item, ItemKind, Rect } from "./items";
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

/** Every layout can hold placed items (fixtures, lights, furniture). */
export type Layout = LayoutShape & { items?: Item[] };

type LayoutShape =
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
      const h = num(i.heightM, 1.8);
      const heightM = [0.9, 1.2, 1.8].reduce((a, c) => (Math.abs(c - h) < Math.abs(a - h) ? c : a), 1.8);
      return { type, points: [{ x: -len / 2, z: 0 }, { x: len / 2, z: 0 }], heightM, gates: [] };
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

/** Calculator params for a layout (the calculators understand zones, openings, gates, steps, items). */
export function layoutParams(l: Layout): Record<string, unknown> {
  const p = shapeParams(l);
  return l.items?.length ? { ...p, items: l.items } : p;
}

function shapeParams(l: Layout): Record<string, unknown> {
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
    | "set_option"
    | "add_item"
    | "move_item"
    | "rotate_item"
    | "remove_item";
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
  /** add_item / move_item / rotate_item / remove_item: what to place (kind). */
  item?: ItemKind | string | null;
  /** Place next to: "door", "window", "gate", "steps" or another item kind. */
  near?: string | null;
  /** Place in a corner: ne / nw / se / sw (n = back, e = right as seen in the sketch). */
  corner?: "ne" | "nw" | "se" | "sw" | null;
  /** Exact plan position (plan editor drag). */
  x?: number | null;
  z?: number | null;
}

/**
 * A refused edit. `message` is technical English (what the model reads, and a stable
 * code for the UI); `ro` is the same thing said to a Romanian-speaking customer.
 */
export class SketchEditError extends Error {
  constructor(
    message: string,
    public ro?: string,
  ) {
    super(message);
  }
}

function fail(ro: string, en: string): never {
  throw new SketchEditError(en, ro);
}

const SIDE_NAMES: Record<Side, { ro: string; en: string }> = {
  n: { ro: "nord", en: "north" },
  e: { ro: "est", en: "east" },
  s: { ro: "sud", en: "south" },
  w: { ro: "vest", en: "west" },
};
const fmt = (n: number, lang: Lang) => n.toLocaleString(lang === "en" ? "en-GB" : "ro-RO", { maximumFractionDigits: 2 });

function need<T>(v: T | null | undefined, name: string): T {
  if (v === null || v === undefined) fail(`Lipsește „${name}” pentru această modificare`, `"${name}" is required for this edit`);
  return v;
}

function dim(v: number | null | undefined, name: string, lo: number, hi: number): number {
  const n = Number(need(v, name));
  if (!Number.isFinite(n) || n < lo || n > hi) fail(`dimensiunea trebuie să fie între ${fmt(lo, "ro")} și ${fmt(hi, "ro")} m`, `"${name}" must be between ${lo} and ${hi} m`);
  return r2(n);
}

function findZone(zones: Zone[], id: string | null | undefined): Zone {
  const z = id ? zones.find((x) => x.id === id) : zones[0];
  if (!z) fail(`Zona „${id}” nu există. Zone: ${zones.map((x) => x.id).join(", ")}`, `Unknown zone "${id}". Zones: ${zones.map((x) => x.id).join(", ")}`);
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
          if (l.zones.some((x) => x !== z && overlaps(x, z))) fail("Zona redimensionată s-ar suprapune peste alta", "Resized zone would overlap another zone");
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
        if (l.type !== "deck" && l.type !== "laminate_floor" && l.type !== "lawn") fail("Proiectul nu are zone", "This project has no zones");
        if (l.zones.length >= 6) fail("Maximum 6 zone", "Maximum 6 zones");
        const to = findZone(l.zones, o.zone);
        const side = need(o.side, "side");
        const nz = attachZone(l.zones, to, side, dim(o.w, "w", 0.5, 30), dim(o.d, "d", 0.5, 30), o.align ?? "start");
        if (l.zones.some((x) => overlaps(x, nz))) fail("Zona nouă s-ar suprapune peste una existentă — încearcă altă latură sau aliniere", "The new zone would overlap an existing one — try another side or alignment");
        l.zones.push(nz);
        say(
          `Adăugată zona ${nz.id} de ${fmt(nz.w, lang)} × ${fmt(nz.d, lang)} m pe latura de ${SIDE_NAMES[side].ro} a zonei ${to.id}`,
          `Added zone ${nz.id}, ${fmt(nz.w, lang)} × ${fmt(nz.d, lang)} m, on the ${SIDE_NAMES[side].en} side of zone ${to.id}`,
        );
        break;
      }
      case "remove_zone": {
        if (l.type !== "deck" && l.type !== "laminate_floor" && l.type !== "lawn") fail("Proiectul nu are zone", "This project has no zones");
        if (l.zones.length <= 1) fail("Nu poți elimina singura zonă", "Can't remove the only zone");
        const z = findZone(l.zones, need(o.zone, "zone"));
        l.zones = l.zones.filter((x) => x !== z);
        if (l.type === "deck") l.steps = l.steps.filter((s) => s.zone !== z.id);
        if (l.type === "laminate_floor") l.openings = l.openings.filter((x) => x.zone !== z.id);
        say(`Eliminată zona ${z.id}`, `Removed zone ${z.id}`);
        break;
      }
      case "add_steps": {
        if (l.type !== "deck") fail("Treptele sunt doar pentru terase", "Steps are only for decks");
        if (l.steps.length >= 4) fail("Maximum 4 seturi de trepte", "Maximum 4 flights of steps");
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
        if (l.type !== "deck") fail("Treptele sunt doar pentru terase", "Steps are only for decks");
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
        } else fail("Proiectul nu are o înălțime de setat", "This project has no height to set");
        break;
      }
      case "add_opening": {
        const kind = need(o.kind, "kind");
        if (l.type === "fence") {
          if (kind !== "gate") fail("La gard se pun porți", "Fences take gates");
          if (l.gates.length >= 4) fail("Maximum 4 porți", "Maximum 4 gates");
          const segs = fenceSegments(l.points);
          const segment = clamp(Math.round(Number(o.segment ?? 0)), 0, segs.length - 1);
          const width = Number(o.width ?? 1) >= 2 ? 3 : 1;
          if (segs[segment].length < width + 0.5) fail("Segmentul de gard e prea scurt pentru poarta asta", "That fence segment is too short for this gate");
          l.gates.push({ id: nid("g"), kind: "gate", wall: String(segment), pos: clamp(Number(o.pos ?? 0.5), 0.1, 0.9), width, height: l.heightM });
          say(
            width === 3 ? `Poartă dublă de 3 m pe segmentul ${segment + 1}` : `Poartă pietonală de 1 m pe segmentul ${segment + 1}`,
            width === 3 ? `3 m double gate on segment ${segment + 1}` : `1 m pedestrian gate on segment ${segment + 1}`,
          );
        } else if (l.type === "paint_room" || l.type === "tiling" || l.type === "drywall_partition" || l.type === "laminate_floor") {
          if (kind === "gate") fail("Porțile sunt doar pentru garduri", "Gates are only for fences");
          if (kind === "window" && l.type !== "paint_room") fail("Ferestrele contează doar la zugrăvit", "Windows only affect painting projects here");
          const list = l.openings;
          if (list.length >= 8) fail("Maximum 8 goluri", "Maximum 8 openings");
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
        } else fail("Proiectul nu are uși sau ferestre", "This project has no openings");
        break;
      }
      case "remove_opening":
      case "move_opening": {
        const list = l.type === "fence" ? l.gates : "openings" in l ? l.openings : null;
        if (!list) fail("Proiectul nu are uși sau ferestre", "This project has no openings");
        const target = o.id ? list.find((x) => x.id === o.id) : [...list].reverse().find((x) => !o.kind || x.kind === o.kind);
        if (!target) fail("Nu există acest gol", "No such opening");
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
        if (l.type !== "tiling") fail("Faianța e doar pentru proiectele de placare", "Wall tiles are only for tiling projects");
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
        if (l.type !== "fence") fail("Segmentele sunt doar pentru garduri", "Segments are only for fences");
        if (l.points.length >= 7) fail("Maximum 6 segmente", "Maximum 6 segments");
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
        if (l.type !== "fence") fail("Segmentele sunt doar pentru garduri", "Segments are only for fences");
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
        if (l.type !== "fence") fail("Segmentele sunt doar pentru garduri", "Segments are only for fences");
        if (l.points.length <= 2) fail("Nu poți elimina singurul segment", "Can't remove the only segment");
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
        else fail(`Opțiunea „${key}” = ${JSON.stringify(v)} nu e validă pentru acest proiect`, `Option "${key}" = ${JSON.stringify(v)} is not valid for this project`);
        say(`Setare actualizată: ${key}`, `Updated setting: ${key}`);
        break;
      }
      case "add_item": {
        const kind = asKind(need(o.item, "item"));
        const items = (l.items ??= []);
        if (items.length >= 24) fail("Maximum 24 de obiecte într-o schiță", "Maximum 24 items in one sketch");
        const placed = placeItem(l, kind, o, items);
        const it: Item = { id: nid("it"), kind, ...placed };
        items.push(it);
        say(`Adăugat: ${lowerFirst(ITEMS[kind].label)} ${placed.where.ro}`, `Added: ${lowerFirst(ITEMS[kind].labelEn)} ${placed.where.en}`);
        delete (it as Partial<Item & { where: unknown }>).where;
        break;
      }
      case "move_item":
      case "rotate_item":
      case "remove_item": {
        const items = l.items ?? [];
        const target = o.id ? items.find((x) => x.id === o.id) : [...items].reverse().find((x) => !o.item || x.kind === asKind(o.item));
        if (!target) fail(o.item ? `Nu există ${String(o.item)} în schiță` : "Nu există acest obiect", o.item ? `There is no ${String(o.item)} in the sketch` : "No such item");
        const name = { ro: lowerFirst(ITEMS[target.kind].label), en: lowerFirst(ITEMS[target.kind].labelEn) };
        if (o.op === "remove_item") {
          l.items = items.filter((x) => x !== target);
          say(`Eliminat: ${name.ro}`, `Removed: ${name.en}`);
        } else if (o.op === "rotate_item") {
          const others = items.filter((x) => x !== target);
          const rot = (((target.rot + 90) % 360) as Item["rot"]);
          const placed = placeItem(l, target.kind, { x: target.x, z: target.z, zone: target.zone, rot }, others);
          Object.assign(target, { x: placed.x, z: placed.z, rot: placed.rot, zone: placed.zone });
          say(`Rotit: ${name.ro}`, `Rotated: ${name.en}`);
        } else {
          const others = items.filter((x) => x !== target);
          const placed = placeItem(l, target.kind, { ...o, rot: o.x != null ? target.rot : undefined }, others);
          Object.assign(target, { x: placed.x, z: placed.z, rot: placed.rot, zone: placed.zone });
          say(`Mutat: ${name.ro} ${placed.where.ro}`, `Moved: ${name.en} ${placed.where.en}`);
        }
        break;
      }
      default:
        fail(`Modificare necunoscută „${(o as SketchOp).op}”`, `Unknown edit "${(o as SketchOp).op}"`);
    }
  }

  reconcileItems(l, say);
  // Coordinates stay put across edits (the scene centres the drawing itself), so
  // unchanged parts keep their exact position and only real changes animate.
  return { layout: l, changes };
}

/**
 * After the shape changed (room shrunk, zone removed…), pull items that ended up
 * outside back in; if one no longer fits anywhere near, take it out and say so.
 */
function reconcileItems(l: Layout, say: (ro: string, en: string) => void) {
  if (!l.items?.length) return;
  const kept: Item[] = [];
  for (const it of l.items) {
    const zoneGone = it.zone && "zones" in l && !l.zones.some((z) => z.id === it.zone);
    const c = itemContainer(l, zoneGone ? undefined : it.zone, zoneGone ? undefined : { x: it.x, z: it.z });
    const r = itemRect(it);
    const inside = r.minX >= c.rect.minX - 0.01 && r.maxX <= c.rect.maxX + 0.01 && r.minZ >= c.rect.minZ - 0.01 && r.maxZ <= c.rect.maxZ + 0.01;
    if (inside && !zoneGone) {
      kept.push(it);
      continue;
    }
    try {
      const p = placeItem(l, it.kind, { x: it.x, z: it.z, rot: it.rot, zone: zoneGone ? null : it.zone }, kept);
      kept.push({ ...it, x: p.x, z: p.z, rot: p.rot, zone: p.zone });
    } catch {
      say(`Am scos ${lowerFirst(ITEMS[it.kind].label)} — nu mai încape`, `Removed the ${lowerFirst(ITEMS[it.kind].labelEn)} — it no longer fits`);
    }
  }
  l.items = kept;
}

const describeItems = (l: Layout) => (l.items?.length ? { items: l.items.map((i) => ({ id: i.id, item: i.kind, x: i.x, z: i.z, rot: i.rot })) } : {});

/** Compact description of the layout for the model (ids it can reference in edits). */
export function describeLayout(l: Layout): unknown {
  switch (l.type) {
    case "deck":
    case "laminate_floor":
    case "lawn":
      return {
        type: l.type,
        zones: l.zones.map((z) => ({ id: z.id, w: z.w, d: z.d, x: z.x, z: z.z })),
        ...("steps" in l ? { steps: l.steps, heightM: l.heightM } : {}),
        ...("openings" in l ? { openings: l.openings } : {}),
        ...describeItems(l),
      };
    case "fence":
      return { type: l.type, segments: fenceSegments(l.points).map((s, i) => ({ segment: i, length: s.length })), heightM: l.heightM, gates: l.gates, ...describeItems(l) };
    default:
      return l;
  }
}

// ───────────────────────────── placed items ─────────────────────────────

const ITEM_WORDS: [ItemKind, RegExp][] = [
  ["toilet", /toilet|wc|vas/],
  ["sink", /sink|washbasin|lavoar|chiuvet/],
  ["shower", /shower|dus/],
  ["bathtub", /bath|cada/],
  ["towel_radiator", /towel/],
  ["mirror", /mirror|oglind/],
  ["washing_machine", /washing|masina de spalat/],
  ["ceiling_lamp", /ceiling|plafon|lustr/],
  ["wall_lamp", /wall.?(lamp|light)|aplic/],
  ["floor_lamp", /floor.?lamp|lampadar/],
  ["garden_light", /garden.?light|solar|felinar/],
  ["lounger", /lounger|sezlong/],
  ["parasol", /parasol|umbrel/],
  ["bbq", /bbq|grill|gratar/],
  ["planter", /planter|jardinier/],
  ["plant", /plant/],
];

/** Accept exact kinds and forgiving names ("wc", "lamp", "BBQ"). */
function asKind(v: unknown): ItemKind {
  const k = String(v ?? "").toLowerCase().trim().replace(/\s+/g, "_") as ItemKind;
  if (ITEM_KINDS.includes(k)) return k;
  const hit = ITEM_WORDS.find(([, re]) => re.test(String(v).toLowerCase()))?.[0];
  if (hit) return hit;
  fail(`Obiect necunoscut „${String(v)}”`, `Unknown item "${String(v)}". Items: ${ITEM_KINDS.join(", ")}`);
}

interface Container {
  rect: Rect;
  floorY: number;
  ceilingY: number | null;
  walls: boolean;
  zone?: string;
}

/** Where items can stand for this project (room, deck zone, the yard in front of a fence…). */
export function itemContainer(l: Layout, zoneId?: string | null, at?: { x: number; z: number }): Container {
  switch (l.type) {
    case "paint_room":
      return { rect: { minX: -l.w / 2, maxX: l.w / 2, minZ: -l.d / 2, maxZ: l.d / 2 }, floorY: 0, ceilingY: l.h, walls: true };
    case "tiling":
      return { rect: { minX: -l.w / 2, maxX: l.w / 2, minZ: -l.d / 2, maxZ: l.d / 2 }, floorY: 0.012, ceilingY: 2.6, walls: true };
    case "drywall_partition":
      return { rect: { minX: -l.length / 2, maxX: l.length / 2, minZ: -1.6, maxZ: 1.6 }, floorY: 0, ceilingY: l.heightM, walls: true };
    case "fence": {
      const xs = l.points.map((p) => p.x);
      const zs = l.points.map((p) => p.z);
      return { rect: { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs) + 0.1, maxZ: Math.max(...zs) + 4 }, floorY: 0, ceilingY: null, walls: false };
    }
    case "deck":
    case "laminate_floor":
    case "lawn": {
      const byPoint = at && l.zones.find((z) => at.x >= z.x - 0.01 && at.x <= z.x + z.w + 0.01 && at.z >= z.z - 0.01 && at.z <= z.z + z.d + 0.01);
      const z = byPoint ?? l.zones.find((x) => x.id === zoneId) ?? l.zones[0];
      const floorY = l.type === "deck" ? l.heightM : l.type === "laminate_floor" ? 0.022 : 0.02;
      return { rect: { minX: z.x, maxX: z.x + z.w, minZ: z.z, maxZ: z.z + z.d }, floorY, ceilingY: l.type === "laminate_floor" ? 2.6 : null, walls: l.type === "laminate_floor", zone: z.id };
    }
  }
}

type Where = { ro: string; en: string };
const SIDE_WHERE: Record<Side, Where> = {
  n: { ro: "pe peretele din spate", en: "on the back wall" },
  s: { ro: "pe peretele din față", en: "on the front wall" },
  w: { ro: "pe peretele din stânga", en: "on the left wall" },
  e: { ro: "pe peretele din dreapta", en: "on the right wall" },
};

/**
 * Resolve where an item goes from how the customer said it: against a wall (at a
 * position along it), in a corner, next to a door / window / gate / the steps /
 * another item, at an exact point (plan editor drag) or in the middle — then slide
 * it until it doesn't overlap anything. Throws SketchEditError when it can't fit.
 */
export function placeItem(
  l: Layout,
  kind: ItemKind,
  o: Pick<SketchOp, "wall" | "side" | "pos" | "near" | "corner" | "x" | "z" | "zone"> & { rot?: Item["rot"] },
  others: Item[],
): { x: number; z: number; rot: Item["rot"]; zone?: string; where: Where } {
  const spec = ITEMS[kind];
  const outdoorProject = l.type === "deck" || l.type === "lawn" || l.type === "fence";
  if (spec.indoor && outdoorProject) fail(`${spec.label} e pentru interior — proiectul e în exterior`, `${spec.labelEn} is for indoors — this is an outdoor project`);
  if (spec.outdoor && !outdoorProject) fail(`${spec.label} e pentru exterior — proiectul e în interior`, `${spec.labelEn} is for outdoors — this is an indoor project`);
  const c = itemContainer(l, o.zone, o.x != null && o.z != null ? { x: o.x, z: o.z } : undefined);
  if (spec.mount === "ceiling" && c.ceilingY == null) fail(`${spec.label} are nevoie de tavan — încearcă o lampă de grădină`, `${spec.labelEn} needs a ceiling — try a garden light`);
  if (spec.mount === "wall" && !c.walls) fail(`${spec.label} se montează pe perete — proiectul nu are pereți`, `${spec.labelEn} mounts on a wall — this project has none`);

  const r = c.rect;
  let rot: Item["rot"] = o.rot ?? 0;
  let x = (r.minX + r.maxX) / 2;
  let z = (r.minZ + r.maxZ) / 2;
  let where: Where = { ro: "în mijloc", en: "in the middle" };
  let slide: "x" | "z" | "both" = "both";

  const againstWall = (side: Side, pos: number) => {
    rot = ROT_FOR_WALL[side];
    const f = footprint(kind, rot);
    const along = (lo: number, hi: number, len: number) => clamp(lo + pos * (hi - lo), lo + len / 2, hi - len / 2);
    // Drywall: the partition runs along z = 0; items stand against its faces.
    const face = l.type === "drywall_partition" && (side === "n" || side === "s");
    if (side === "n" || side === "s") {
      x = along(r.minX, r.maxX, f.w);
      z = face ? (side === "s" ? 0.05 + f.d / 2 : -0.05 - f.d / 2) : side === "n" ? r.minZ + f.d / 2 : r.maxZ - f.d / 2;
      if (face) rot = side === "s" ? 0 : 180;
      slide = "x";
    } else {
      z = along(r.minZ, r.maxZ, f.d);
      x = side === "w" ? r.minX + f.w / 2 : r.maxX - f.w / 2;
      slide = "z";
    }
  };

  const near = o.near ? String(o.near).toLowerCase() : "";
  if (o.x != null && o.z != null) {
    x = Number(o.x);
    z = Number(o.z);
    where = { ro: "unde ai ales", en: "where you put it" };
    if (spec.mount === "wall") {
      // Snap to the nearest wall.
      const d = { n: Math.abs(z - r.minZ), s: Math.abs(r.maxZ - z), w: Math.abs(x - r.minX), e: Math.abs(r.maxX - x) };
      const side = (Object.entries(d).sort((a, b) => a[1] - b[1])[0][0]) as Side;
      const len = side === "n" || side === "s" ? r.maxX - r.minX : r.maxZ - r.minZ;
      againstWall(side, len > 0 ? (side === "n" || side === "s" ? (x - r.minX) / len : (z - r.minZ) / len) : 0.5);
    }
  } else if (near) {
    const anchor = findAnchor(l, near, others, c);
    if (!anchor) fail(`Nu există „${near}” lângă care să-l pun`, `There is no ${near} to place it next to`);
    where = anchor.where;
    const f0 = footprint(kind, anchor.side ? ROT_FOR_WALL[anchor.side] : 0);
    if (anchor.side && spec.mount !== "ceiling") {
      // Along the same wall, beside the anchor (whichever side has room) — or right above it
      // when a wall item goes by a floor item (mirror above the washbasin, TV above the sofa).
      againstWall(anchor.side, 0.5);
      const alongX = anchor.side === "n" || anchor.side === "s";
      const above = spec.mount === "wall" && anchor.item != null && ITEMS[anchor.item].mount === "floor";
      if (above) where = { ro: `deasupra ${ITEMS[anchor.item!].labelGen}`, en: `above the ${lowerFirst(ITEMS[anchor.item!].labelEn)}` };
      const off = above ? 0 : anchor.half + (alongX ? f0.w : f0.d) / 2 + 0.1;
      const lo = alongX ? r.minX + f0.w / 2 : r.minZ + f0.d / 2;
      const hi = alongX ? r.maxX - f0.w / 2 : r.maxZ - f0.d / 2;
      const a = anchor.along + off <= hi ? anchor.along + off : anchor.along - off;
      if (alongX) x = clamp(a, lo, hi);
      else z = clamp(a, lo, hi);
    } else {
      // Free-standing next to it (inside the container), or a ceiling light above the spot.
      x = clamp(anchor.x, r.minX + f0.w / 2, r.maxX - f0.w / 2);
      z = clamp(anchor.z, r.minZ + f0.d / 2, r.maxZ - f0.d / 2);
    }
  } else if (o.corner) {
    const cn = String(o.corner) as "ne" | "nw" | "se" | "sw";
    rot = cn[0] === "n" ? 0 : 180;
    const f = footprint(kind, rot);
    x = cn[1] === "e" ? r.maxX - f.w / 2 : r.minX + f.w / 2;
    z = cn[0] === "n" ? r.minZ + f.d / 2 : r.maxZ - f.d / 2;
    where = {
      ro: `în colțul din ${cn[0] === "n" ? "spate" : "față"}-${cn[1] === "e" ? "dreapta" : "stânga"}`,
      en: `in the ${cn[0] === "n" ? "back" : "front"}-${cn[1] === "e" ? "right" : "left"} corner`,
    };
    slide = cn[0] === "n" || cn[0] === "s" ? "x" : "z";
  } else if (o.wall || o.side) {
    const side = String(o.wall ?? o.side) as Side;
    if (!SIDES.includes(side)) fail(`Perete necunoscut „${String(o.wall ?? o.side)}”`, `Unknown wall "${String(o.wall ?? o.side)}" — use n, e, s or w`);
    if (!c.walls && spec.mount !== "floor") fail(`${spec.label} nu se poate pune pe o margine fără perete`, `${spec.labelEn} can't go on an edge without a wall`);
    againstWall(side, clamp(Number(o.pos ?? 0.5), 0, 1));
    where = c.walls ? SIDE_WHERE[side] : { ro: `pe latura de ${{ n: "spate", s: "față", w: "stânga", e: "dreapta" }[side]}`, en: `along the ${{ n: "back", s: "front", w: "left", e: "right" }[side]} edge` };
  } else if (spec.mount === "wall") {
    againstWall("n", 0.5);
    where = SIDE_WHERE.n;
  }

  // Keep inside, then slide until it doesn't overlap another item (or the partition).
  const f = footprint(kind, rot);
  const inside = (px: number, pz: number) => ({ x: clamp(px, r.minX + f.w / 2, r.maxX - f.w / 2), z: clamp(pz, r.minZ + f.d / 2, r.maxZ - f.d / 2) });
  const blocked = (px: number, pz: number) => {
    const me = itemRect({ kind, x: px, z: pz, rot });
    if (l.type === "drywall_partition" && rectsOverlap(me, { minX: -l.length / 2, maxX: l.length / 2, minZ: -0.06, maxZ: 0.06 })) return true;
    // Only things at the same height collide (a mirror above a washbasin is fine).
    const [lo, hi] = verticalRange(kind, c.ceilingY);
    return others.some((it) => {
      const [a, b] = verticalRange(it.kind, c.ceilingY);
      return a < hi - 0.01 && lo < b - 0.01 && rectsOverlap(me, itemRect(it));
    });
  };
  let p = inside(x, z);
  if (blocked(p.x, p.z)) {
    // Slide 10 cm at a time, alternating sides, along the wall (or in any direction when free-standing).
    const tries: [number, number][] = [];
    for (let k = 1; k <= 60; k++) {
      const step = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.1;
      if (slide !== "z") tries.push([p.x + step, p.z]);
      if (slide !== "x") tries.push([p.x, p.z + step]);
    }
    if (slide === "both") for (let k = 1; k <= 20; k++) for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) tries.push([p.x + dx * k * 0.1, p.z + dz * k * 0.1]);
    const free = tries.map(([a, b]) => inside(a, b)).find((q) => !blocked(q.x, q.z));
    if (!free) fail(`Nu mai e loc pentru ${lowerFirst(spec.label)} acolo — mută sau scoate ceva întâi`, `There's no free space for the ${spec.labelEn.toLowerCase()} there — move or remove something first`);
    p = free;
  }
  return { x: r2(p.x), z: r2(p.z), rot, zone: c.zone, where };
}

/** What "next to the door / window / gate / steps / sink" refers to. */
function findAnchor(
  l: Layout,
  near: string,
  items: Item[],
  c: Container,
): { x: number; z: number; along: number; half: number; side?: Side; item?: ItemKind; where: Where } | null {
  const r = c.rect;
  const onWall = (side: Side, pos: number, width: number, where: Where) => {
    const alongX = side === "n" || side === "s";
    const along = alongX ? r.minX + pos * (r.maxX - r.minX) : r.minZ + pos * (r.maxZ - r.minZ);
    const x = alongX ? along : side === "w" ? r.minX + 0.6 : r.maxX - 0.6;
    const z = alongX ? (side === "n" ? r.minZ + 0.6 : r.maxZ - 0.6) : along;
    return { x, z, along, half: width / 2, side: c.walls ? side : undefined, where };
  };
  if (/door|usa|usi/.test(near) || /window|fereastr|geam/.test(near)) {
    const kind = /window|fereastr|geam/.test(near) ? "window" : "door";
    const where: Where = kind === "door" ? { ro: "lângă ușă", en: "next to the door" } : { ro: "lângă fereastră", en: "by the window" };
    if (l.type === "paint_room" || l.type === "tiling" || l.type === "laminate_floor") {
      const o = [...l.openings].reverse().find((x) => x.kind === kind && (l.type !== "laminate_floor" || !c.zone || x.zone === c.zone));
      return o ? onWall(o.wall as Side, o.pos, o.width, where) : null;
    }
    if (l.type === "drywall_partition" && kind === "door") {
      const o = l.openings.at(-1);
      return o ? { x: -l.length / 2 + o.pos * l.length, z: 0.6, along: -l.length / 2 + o.pos * l.length, half: o.width / 2, side: "s", where } : null;
    }
    return null;
  }
  if (/gate|poart/.test(near) && l.type === "fence") {
    const g = l.gates.at(-1);
    const seg = g && fenceSegments(l.points)[Number(g.wall)];
    if (!g || !seg) return null;
    const t = g.pos;
    const gx = seg.a.x + (seg.b.x - seg.a.x) * t;
    const gz = seg.a.z + (seg.b.z - seg.a.z) * t;
    const alongX = Math.abs(seg.b.x - seg.a.x) >= Math.abs(seg.b.z - seg.a.z);
    const off = g.width / 2 + 0.6;
    return { x: alongX ? gx + off : gx + 0.6, z: alongX ? gz + 0.6 : gz + off, along: alongX ? gx : gz, half: g.width / 2, where: { ro: "lângă poartă", en: "by the gate" } };
  }
  if (/steps|trept|scar/.test(near) && l.type === "deck") {
    const st = l.steps.at(-1);
    const z = st && l.zones.find((q) => q.id === st.zone);
    if (!st || !z) return null;
    const alongX = st.side === "n" || st.side === "s";
    const along = alongX ? z.x + z.w / 2 : z.z + z.d / 2;
    const off = st.width / 2 + 0.5;
    const x = alongX ? along + off : st.side === "w" ? z.x + 0.5 : z.x + z.w - 0.5;
    const zz = alongX ? (st.side === "n" ? z.z + 0.5 : z.z + z.d - 0.5) : along + off;
    return { x, z: zz, along, half: st.width / 2, where: { ro: "lângă trepte", en: "by the steps" } };
  }
  let kind: ItemKind | undefined;
  try {
    kind = asKind(near);
  } catch {
    return null;
  }
  const it = [...items].reverse().find((x) => x.kind === kind);
  if (!it) return null;
  const f = footprint(it.kind, it.rot);
  // The wall the anchor stands against, from its rotation (its back faces that wall).
  const side = c.walls ? (({ 0: "n", 90: "w", 180: "s", 270: "e" }) as const)[it.rot] : undefined;
  const alongX = !side || side === "n" || side === "s";
  return {
    x: it.x + f.w / 2 + 0.5,
    z: it.z,
    along: alongX ? it.x : it.z,
    half: (alongX ? f.w : f.d) / 2,
    side,
    item: it.kind,
    where: { ro: `lângă ${lowerFirst(ITEMS[it.kind].label)}`, en: `next to the ${lowerFirst(ITEMS[it.kind].labelEn)}` },
  };
}

// ───────────────────────────── validation ─────────────────────────────

const fin = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const str = (v: unknown, max = 24) => typeof v === "string" && v.length > 0 && v.length <= max;

function okZones(v: unknown): v is Zone[] {
  return (
    Array.isArray(v) &&
    v.length >= 1 &&
    v.length <= 6 &&
    v.every((z) => z && str(z.id, 4) && fin(z.x, -200, 200) && fin(z.z, -200, 200) && fin(z.w, 0.5, 30) && fin(z.d, 0.5, 30))
  );
}

function okOpenings(v: unknown, max: number): v is Opening[] {
  return (
    Array.isArray(v) &&
    v.length <= max &&
    v.every(
      (o) =>
        o &&
        str(o.id) &&
        ["door", "window", "gate"].includes(o.kind) &&
        str(o.wall, 4) &&
        (o.zone === undefined || str(o.zone, 4)) &&
        fin(o.pos, 0, 1) &&
        fin(o.width, 0.3, 3.5) &&
        fin(o.height, 0.3, 3),
    )
  );
}

/**
 * Layouts round-trip through the browser, so treat them as untrusted: return the
 * layout only if it is well-formed and within the editor's limits, else null.
 */
export function checkLayout(raw: unknown, type: ProjectType): Layout | null {
  const l = raw as Record<string, unknown> | null;
  if (!l || typeof l !== "object" || l.type !== type) return null;
  const ok = (() => {
    switch (type) {
      case "deck":
        return (
          okZones(l.zones) &&
          fin(l.heightM, 0.1, 1.2) &&
          ["x", "z"].includes(l.direction as string) &&
          ["soil", "gravel", "concrete_slab"].includes(l.base as string) &&
          Array.isArray(l.steps) &&
          l.steps.length <= 4 &&
          (l.steps as Steps[]).every((s) => s && str(s.id) && str(s.zone, 4) && SIDES.includes(s.side) && fin(s.width, 0.5, 30) && fin(s.count, 1, 6))
        );
      case "laminate_floor":
        return okZones(l.zones) && okOpenings(l.openings, 8) && ["straight", "diagonal"].includes(l.pattern as string) && ["concrete", "wood", "old_tiles"].includes(l.subfloor as string);
      case "lawn":
        return okZones(l.zones) && ["new", "overseed"].includes(l.mode as string);
      case "paint_room":
        return (
          fin(l.w, 0.8, 20) &&
          fin(l.d, 0.8, 20) &&
          fin(l.h, 2, 5) &&
          okOpenings(l.openings, 8) &&
          typeof l.ceiling === "boolean" &&
          fin(l.coats, 1, 4) &&
          ["fresh_plaster", "repaint", "dark_to_light"].includes(l.surface as string)
        );
      case "tiling": {
        const wh = l.wallHeights as Record<string, unknown> | undefined;
        return (
          fin(l.w, 0.8, 20) &&
          fin(l.d, 0.8, 20) &&
          ["bathroom", "kitchen", "other"].includes(l.roomType as string) &&
          typeof l.floor === "boolean" &&
          typeof l.largeFormat === "boolean" &&
          !!wh &&
          SIDES.every((s) => fin(wh[s], 0, 3)) &&
          okOpenings(l.openings, 8)
        );
      }
      case "fence":
        return (
          Array.isArray(l.points) &&
          l.points.length >= 2 &&
          l.points.length <= 7 &&
          (l.points as Point[]).every((p) => p && fin(p.x, -400, 400) && fin(p.z, -400, 400)) &&
          fenceSegments(l.points as Point[]).every((s) => s.length >= 0.5) &&
          [0.9, 1.2, 1.8].includes(l.heightM as number) &&
          okOpenings(l.gates, 4)
        );
      case "drywall_partition":
        return (
          fin(l.length, 0.6, 20) &&
          fin(l.heightM, 2, 5) &&
          okOpenings(l.openings, 8) &&
          typeof l.insulation === "boolean" &&
          typeof l.doubleLayer === "boolean" &&
          typeof l.wetRoom === "boolean"
        );
    }
  })();
  return ok && okItems(l.items) ? (structuredClone(l) as unknown as Layout) : null;
}

function okItems(v: unknown): boolean {
  if (v === undefined) return true;
  return (
    Array.isArray(v) &&
    v.length <= 24 &&
    v.every(
      (it) =>
        it &&
        str(it.id) &&
        ITEM_KINDS.includes(it.kind) &&
        fin(it.x, -200, 200) &&
        fin(it.z, -200, 200) &&
        [0, 90, 180, 270].includes(it.rot) &&
        (it.zone === undefined || str(it.zone, 4)),
    )
  );
}
