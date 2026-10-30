import { describe, expect, it } from "vitest";
import { applyOps, defaultLayout } from "@/domain/layout";
import type { Layout, SketchOp } from "@/domain/layout";
import { PAVING_BONDS } from "@/domain/patterns";
import type { Look } from "@/domain/look";
import { buildLayout } from "../builders";
import type { Part } from "../builders";
import { deckScrewInstances } from "../detail/deckScrews";
import { insideConvex, parsePrism, polygonArea, prismOutline } from "../detail/prism";
import type { Pt } from "../detail/prism";

const paving = (inputs: Record<string, unknown> = {}) => defaultLayout("paving", { lengthM: 6, widthM: 1.2, ...inputs });
const deck = (inputs: Record<string, unknown> = {}) => defaultLayout("deck", { lengthM: 5, widthM: 4, ...inputs });
const set = (l: Layout, key: string, value: string) => applyOps(l, [{ op: "set_option", key, value }]).layout;
const partsOf = (l: Layout, layer: string, look: Look = {}) => buildLayout(l, "ro", look).parts.filter((p) => p.layer === layer);

/** Axis-aligned footprint of a box part. */
const rectOf = (p: Part) => ({ x0: p.pos[0] - p.size[0] / 2, x1: p.pos[0] + p.size[0] / 2, z0: p.pos[2] - p.size[2] / 2, z1: p.pos[2] + p.size[2] / 2 });
const boxOverlap = (a: Part, b: Part) => {
  const [r, s] = [rectOf(a), rectOf(b)];
  const dx = Math.min(r.x1, s.x1) - Math.max(r.x0, s.x0);
  const dz = Math.min(r.z1, s.z1) - Math.max(r.z0, s.z0);
  return dx > 1e-9 && dz > 1e-9 ? dx * dz : 0;
};
const zoneRects = (l: Layout) => ("zones" in l ? l.zones : []).map((z) => ({ x0: z.x, x1: z.x + z.w, z0: z.z, z1: z.z + z.d }));
const within = (r: { x0: number; x1: number; z0: number; z1: number }, zones: ReturnType<typeof zoneRects>) =>
  zones.some((z) => r.x0 >= z.x0 - 1e-6 && r.x1 <= z.x1 + 1e-6 && r.z0 >= z.z0 - 1e-6 && r.z1 <= z.z1 + 1e-6);

describe("paving(): every bond draws pavers that fill the outline without overlapping", () => {
  it.each(PAVING_BONDS)("%s: inside the outline, no overlaps, unique ids", (bond) => {
    const l = set(paving(), "bond", bond);
    const pavers = partsOf(l, "pavers");
    expect(pavers.length).toBeGreaterThan(300);
    const zones = zoneRects(l);
    for (const p of pavers) expect(within(rectOf(p), zones)).toBe(true);
    let overlapping = 0;
    for (let i = 0; i < pavers.length; i++) for (let j = i + 1; j < pavers.length; j++) overlapping += boxOverlap(pavers[i], pavers[j]);
    expect(overlapping).toBe(0);
    expect(new Set(pavers.map((p) => p.id)).size).toBe(pavers.length);
    // 7,2 m² of pavers: the drawn area is the zone less the 4 mm joints
    const drawn = pavers.reduce((s, p) => s + p.size[0] * p.size[2], 0);
    expect(drawn).toBeGreaterThan(7.2 * 0.9);
    expect(drawn).toBeLessThan(7.2);
  });

  it("a 20 × 10 paver draws the same count in every bond, give or take the cut ones at the edge", () => {
    const counts = PAVING_BONDS.map((b) => partsOf(set(paving(), "bond", b), "pavers").length);
    for (const c of counts) expect(Math.abs(c - 360)).toBeLessThan(45);
  });

  it("is deterministic: the same layout draws the same parts (ids, positions, order)", () => {
    for (const bond of PAVING_BONDS) {
      const l = set(paving(), "bond", bond);
      expect(buildLayout(l, "ro").parts).toEqual(buildLayout(l, "ro").parts);
    }
  });

  it("running bond is drawn exactly as before the option existed (same ids, same positions)", () => {
    const none = partsOf(paving(), "pavers");
    const explicit = partsOf(set(paving(), "bond", "running"), "pavers");
    expect(none[0].id).toBe("A-paver-0-0");
    expect(explicit).toEqual(none);
  });

  it("the patterns look different: herringbone and basketweave lay pavers both ways, the others only flat", () => {
    const upright = (b: string) => partsOf(set(paving(), "bond", b), "pavers").filter((p) => p.size[2] > p.size[0] * 1.5).length;
    expect(upright("running")).toBe(0);
    expect(upright("stack")).toBe(0);
    expect(upright("herringbone")).toBeGreaterThan(100);
    expect(upright("basketweave")).toBeGreaterThan(60);
  });

  it("an upright paver's texture is turned with it", () => {
    const hb = partsOf(set(paving(), "bond", "herringbone"), "pavers");
    const flat = hb.find((p) => p.size[0] > p.size[2] * 1.5)!;
    const up = hb.find((p) => p.size[2] > p.size[0] * 1.5)!;
    expect(flat.finish!.unit).toEqual([expect.closeTo(0.2, 6), expect.closeTo(0.1, 6)]);
    expect(up.finish!.unit).toEqual([expect.closeTo(0.1, 6), expect.closeTo(0.2, 6)]);
  });

  it("follows the product's paver format, drawing a 30 × 20 as a 2:1 area-equivalent in the patterns that need one", () => {
    const look: Look = { pavers: { color: "#a19d96", name: "Nova", w: 0.3, l: 0.2, t: 0.06 } };
    const run = partsOf(paving(), "pavers", look)[0];
    expect(run.size[0]).toBeCloseTo(0.3 - 0.004, 6);
    const hb = partsOf(set(paving(), "bond", "herringbone"), "pavers", look);
    const whole = hb.find((p) => p.size[0] > p.size[2] * 1.5)!;
    expect(whole.size[0] / whole.size[2]).toBeGreaterThan(1.8);
  });

  it("an L-shaped path stays inside its outline in every bond", () => {
    for (const bond of PAVING_BONDS) {
      const l = applyOps(set(paving(), "bond", bond), [{ op: "add_zone", zone: "A", side: "e", w: 1.2, d: 3, align: "end" }]).layout;
      const zones = zoneRects(l);
      for (const p of partsOf(l, "pavers")) expect(within(rectOf(p), zones)).toBe(true);
    }
  });

  it("stays light on a big area: a 20 × 15 m yard is a few hundred parts, whatever the bond", () => {
    for (const bond of PAVING_BONDS) {
      const n = partsOf(set(paving({ lengthM: 20, widthM: 15 }), "bond", bond), "pavers").length;
      expect(n).toBeLessThan(900);
      expect(n).toBeGreaterThan(300);
    }
  });
});

describe("paving(): the lawn strips around the outline", () => {
  const strips = (l: Layout) => buildLayout(l, "ro").parts.filter((p) => p.id.startsWith("turf-"));
  const cases: [string, Layout][] = [
    ["path with edging", paving()],
    ["patio without edging", set(defaultLayout("paving", { lengthM: 4, widthM: 3 }), "edging", "false")],
    ["L-shaped path", applyOps(paving(), [{ op: "add_zone", side: "e", w: 1.2, d: 3, align: "end" } as SketchOp]).layout],
  ];
  it.each(cases)("%s: never laid over a paver, never overlapping each other", (_, l) => {
    const zones = zoneRects(l);
    const turf = strips(l);
    expect(turf.length).toBeGreaterThanOrEqual(4);
    for (const t of turf) {
      const r = rectOf(t);
      for (const z of zones) {
        const dx = Math.min(r.x1, z.x1) - Math.max(r.x0, z.x0);
        const dz = Math.min(r.z1, z.z1) - Math.max(r.z0, z.z0);
        expect(dx > 1e-6 && dz > 1e-6, `${t.id} over the paving`).toBe(false);
      }
    }
    for (let i = 0; i < turf.length; i++) for (let j = i + 1; j < turf.length; j++) expect(boxOverlap(turf[i], turf[j]), `${turf[i].id} × ${turf[j].id}`).toBeLessThan(1e-6);
    // The kerbs meet end to end (two zones flush on one side) or at a corner, never doubled up.
    const kerbs = partsOf(l, "paving_edging");
    for (let i = 0; i < kerbs.length; i++) for (let j = i + 1; j < kerbs.length; j++) expect(boxOverlap(kerbs[i], kerbs[j]), `${kerbs[i].id} × ${kerbs[j].id}`).toBeLessThan(1e-6);
  });
});

describe("deck(): the substructure stays under the boards", () => {
  it.each(["straight", "diagonal", "frame"])("%s: no support or joist pokes out past the deck", (boards) => {
    const l = set(deck(), "boards", boards);
    const zones = zoneRects(l);
    for (const layer of ["deck_support", "deck_joist"]) for (const p of partsOf(l, layer)) expect(within(rectOf(p), zones), `${p.id}`).toBe(true);
  });
});

describe("deck(): diagonal boards", () => {
  const d = () => set(deck(), "boards", "diagonal");
  const outlines = (l: Layout) => partsOf(l, "deck_board").map((p) => prismOutline(p.shape, p.pos)!);

  it("draws prism boards at 45° that stay inside the deck", () => {
    const boards = partsOf(d(), "deck_board");
    expect(boards.length).toBeGreaterThan(40);
    const zones = zoneRects(d());
    for (const p of boards) {
      expect(parsePrism(p.shape)!.grain).toBeCloseTo(Math.PI / 4, 3);
      expect(within(rectOf(p), zones)).toBe(true);
      for (const q of prismOutline(p.shape, p.pos)!) {
        expect(q[0]).toBeGreaterThanOrEqual(-2.5 - 1e-3);
        expect(q[0]).toBeLessThanOrEqual(2.5 + 1e-3);
        expect(q[1]).toBeGreaterThanOrEqual(-2 - 1e-3);
        expect(q[1]).toBeLessThanOrEqual(2 + 1e-3);
      }
    }
  });

  it("covers ~97% of the deck once — boards never overlap", () => {
    const polys = outlines(d());
    let covered = 0;
    let double = 0;
    let total = 0;
    for (let x = -2.5 + 0.0065; x < 2.5; x += 0.013) {
      for (let z = -2 + 0.0065; z < 2; z += 0.013) {
        total++;
        const n = polys.filter((p) => insideConvex(p, [x, z], -1e-9)).length;
        if (n) covered++;
        if (n > 1) double++;
      }
    }
    expect(double).toBe(0);
    expect(covered / total).toBeGreaterThan(0.95);
  });

  it("joists go in every 30 cm, closer than under straight boards", () => {
    const straight = partsOf(deck(), "deck_joist").length;
    const diag = partsOf(d(), "deck_joist").length;
    expect(straight).toBe(14);
    expect(diag).toBe(18);
  });

  it("the board colours alternate and every board has a unique, stable id", () => {
    const boards = partsOf(d(), "deck_board");
    expect(new Set(boards.map((b) => b.id)).size).toBe(boards.length);
    expect(new Set(boards.map((b) => b.color)).size).toBeGreaterThan(1);
    expect(buildLayout(d(), "ro").parts).toEqual(buildLayout(d(), "ro").parts);
  });

  it("a board's texture repeats at the real board length along its grain", () => {
    for (const b of partsOf(d(), "deck_board")) {
      const area = polygonArea(prismOutline(b.shape, b.pos) as Pt[]);
      expect(area).toBeGreaterThan(0);
      expect(b.finish!.unit![1]).toBeCloseTo(b.size[2], 9);
      expect(b.finish!.unit![0]).toBeGreaterThan(0);
    }
  });

  it("the other direction mirrors the diagonal", () => {
    const l = applyOps(d(), [{ op: "set_option", key: "direction", value: "z" }]).layout;
    const g = parsePrism(partsOf(l, "deck_board")[0].shape)!.grain; // an axis, so 135° is the same line as -45°
    expect(((g % Math.PI) + Math.PI) % Math.PI).toBeCloseTo((3 * Math.PI) / 4, 3);
  });
});

describe("deck(): picture frame", () => {
  const f = () => set(deck(), "boards", "frame");

  it("a mitred border board on each side and straight field boards inside, none overlapping", () => {
    const boards = partsOf(f(), "deck_board");
    const border = boards.filter((p) => p.id.includes("-frame-"));
    const field = boards.filter((p) => p.id.includes("-board-"));
    expect(border.map((p) => p.id.split("-").pop()).sort()).toEqual(["e", "n", "s", "w"]);
    for (const b of border) expect(parsePrism(b.shape)!.points).toHaveLength(4);
    // 4,7 × 3,7 m field → 25 rows of boards 4,7 m long
    expect(field).toHaveLength(25);
    for (const p of field) expect(p.size[0]).toBeCloseTo(4.7, 6);

    // nothing overlaps: sample the deck
    const polys = [...border.map((p) => prismOutline(p.shape, p.pos)!), ...field.map((p): Pt[] => {
      const r = rectOf(p);
      return [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]];
    })];
    let double = 0;
    let covered = 0;
    let total = 0;
    for (let x = -2.5 + 0.0065; x < 2.5; x += 0.0131) {
      for (let z = -2 + 0.0065; z < 2; z += 0.0131) {
        total++;
        const n = polys.filter((p) => insideConvex(p, [x, z], -1e-9)).length;
        if (n) covered++;
        if (n > 1) double++;
      }
    }
    expect(double).toBe(0);
    expect(covered / total).toBeGreaterThan(0.95);
  });

  it("the border sits inside the deck and is as high as the field boards", () => {
    const boards = partsOf(f(), "deck_board");
    const zones = zoneRects(f());
    const ys = new Set(boards.map((b) => b.pos[1].toFixed(6)));
    expect(ys.size).toBe(1);
    for (const b of boards) expect(within(rectOf(b), zones)).toBe(true);
  });

  it("two extra joists carry the border boards that run with them", () => {
    const joists = partsOf(f(), "deck_joist");
    expect(joists).toHaveLength(14 + 2);
    expect(joists.filter((j) => j.id.includes("-rim-")).map((j) => j.id.split("-").pop()).sort()).toEqual(["e", "w"]);
  });

  it("an L-shaped frame leaves the joint between the zones open", () => {
    const l = applyOps(f(), [{ op: "add_zone", zone: "A", side: "e", w: 2, d: 2, align: "end" }]).layout;
    const border = partsOf(l, "deck_board").filter((p) => p.id.includes("-frame-"));
    expect(border.filter((p) => p.id.startsWith("A-"))).toHaveLength(3);
    expect(border.filter((p) => p.id.startsWith("B-"))).toHaveLength(3);
    const zones = zoneRects(l);
    for (const b of partsOf(l, "deck_board")) expect(within(rectOf(b), zones)).toBe(true);
  });

  it("straight boards keep their old ids and sizes", () => {
    const boards = partsOf(deck(), "deck_board");
    expect(boards).toHaveLength(27);
    expect(boards[0].id).toBe("A-board-0");
    expect(boards[0].size[0]).toBeCloseTo(5, 9);
    expect(boards.every((b) => !b.shape)).toBe(true);
  });
});

describe("deck screws follow the boards", () => {
  it("straight: two screws at every board × joist crossing, as before", () => {
    const n = deckScrewInstances(buildLayout(deck(), "ro").parts).length;
    expect(n).toBe(27 * 14 * 2);
  });

  it("diagonal: every screw sits on a joist, inside a board", () => {
    const l = set(deck(), "boards", "diagonal");
    const parts = buildLayout(l, "ro").parts;
    const joists = parts.filter((p) => p.layer === "deck_joist");
    const boards = parts.filter((p) => p.layer === "deck_board").map((p) => prismOutline(p.shape, p.pos)!);
    const screws = deckScrewInstances(parts);
    expect(screws.length).toBeGreaterThan(500);
    for (const s of screws) {
      const [x, , z] = s.pos;
      expect(joists.some((j) => Math.abs(j.pos[0] - x) < 1e-6 && z >= j.pos[2] - j.size[2] / 2 - 1e-6 && z <= j.pos[2] + j.size[2] / 2 + 1e-6)).toBe(true);
      expect(boards.some((b) => insideConvex(b, [x, z], 0.005))).toBe(true);
    }
  });

  it("frame: the field boards stop short of the end joists, so no screw floats past them", () => {
    const l = set(deck(), "boards", "frame");
    const parts = buildLayout(l, "ro").parts;
    const field = parts.filter((p) => p.layer === "deck_board" && p.id.includes("-board-"));
    for (const s of deckScrewInstances(parts)) {
      const [x, , z] = s.pos;
      const onBorder = parts.some((p) => p.id.includes("-frame-") && insideConvex(prismOutline(p.shape, p.pos)!, [x, z], 0.005));
      const onField = field.some((p) => {
        const r = rectOf(p);
        return x >= r.x0 - 1e-6 && x <= r.x1 + 1e-6 && z >= r.z0 - 1e-6 && z <= r.z1 + 1e-6;
      });
      expect(onBorder || onField).toBe(true);
    }
  });
});
