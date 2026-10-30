import { describe, expect, it } from "vitest";
import { buildScene } from "../builders";
import type { Build } from "../builders";
import { partVariation } from "../partVariation";
import { foliageFor } from "../surroundings/foliage";
import { circleClear, distToRect, MARGIN, planSurroundings } from "../surroundings/plan";
import { wallPieces } from "../surroundings/wallPieces";

const OUTDOOR: [string, Build][] = [
  ["deck 4x3", buildScene("deck", { lengthM: 4, widthM: 3 }, "ro")],
  ["deck 7x2.5 raised", buildScene("deck", { lengthM: 7, widthM: 2.5, heightM: 0.6 }, "ro")],
  ["deck 2x2", buildScene("deck", { lengthM: 2, widthM: 2 }, "ro")],
  ["paving 4.5x3.5", buildScene("paving", { lengthM: 4.5, widthM: 3.5 }, "ro")],
  ["paving path 6x1.2", buildScene("paving", {}, "ro")],
  ["fence 11", buildScene("fence", { lengthM: 11 }, "ro")],
  ["fence 3", buildScene("fence", { lengthM: 3 }, "ro")],
  ["lawn 24", buildScene("lawn", { areaM2: 24 }, "ro")],
  ["lawn 120", buildScene("lawn", { areaM2: 120 }, "ro")],
];

describe("surroundings plan (REAL view dressing)", () => {
  it("plans a garden for every outdoor project and a room for cut-away interiors", () => {
    for (const [name, b] of OUTDOOR) expect(planSurroundings(b), name).not.toBeNull();
    expect(planSurroundings(buildScene("tiling", { roomType: "bathroom" }, "ro"))?.room).toBeTruthy();
    expect(planSurroundings(buildScene("paint_room", {}, "ro"))?.room).toBeTruthy();
  });

  it("never plants anything inside the build's footprint plus the margin", () => {
    for (const [name, b] of OUTDOOR) {
      const plan = planSurroundings(b)!;
      const fp = plan.footprint;
      // The keep-out zone really is the footprint grown by MARGIN on every side.
      expect(plan.keepOut.minX, name).toBeCloseTo(fp.minX - MARGIN);
      expect(plan.keepOut.maxZ, name).toBeCloseTo(fp.maxZ + MARGIN);
      for (const s of plan.shrubs) expect(circleClear(s.x, s.z, s.r, plan.keepOut), `${name} shrub at ${s.x},${s.z}`).toBe(true);
      for (const t of plan.trees) expect(circleClear(t.x, t.z, t.crown, plan.keepOut), `${name} tree`).toBe(true);
      for (const p of plan.planters) expect(circleClear(p.x, p.z, Math.hypot(p.w, p.d) / 2, plan.keepOut), `${name} planter`).toBe(true);
    }
  });

  it("keeps every leaf, flower and planter of the expanded foliage off the project", () => {
    for (const [name, b] of OUTDOOR) {
      const plan = planSurroundings(b)!;
      const fol = foliageFor(plan);
      // Nothing green may land on (or hang over) the project's footprint.
      const solid = plan.footprint;
      for (const c of fol.cards) expect(distToRect(c.x, c.z, solid), `${name} card`).toBeGreaterThan(0);
      for (const d of fol.dots) expect(distToRect(d.x, d.z, solid), `${name} flower`).toBeGreaterThan(0);
      for (const p of fol.planters) expect(distToRect(p.x, p.z, solid), `${name} planter`).toBeGreaterThan(Math.hypot(p.w, p.d) / 2 - 1e-9);
    }
  });

  it("keeps the camera's side clear: nothing planted in front of a deck, patio or lawn (the sketch's UI corners)", () => {
    for (const [name, b] of OUTDOOR.filter(([n]) => !n.startsWith("fence"))) {
      const plan = planSurroundings(b)!;
      const items = [...plan.shrubs.map((x) => ({ z: x.z, r: x.r })), ...plan.trees.map((t) => ({ z: t.z, r: t.crown })), ...plan.planters.map((p) => ({ z: p.z, r: Math.hypot(p.w, p.d) / 2 }))];
      for (const it of items) expect(it.z + it.r, name).toBeLessThanOrEqual(plan.footprint.maxZ + 0.6);
    }
  });

  it("stands the house wall behind a deck or patio, against it but never over it", () => {
    for (const [name, b] of OUTDOOR.filter(([n]) => n.startsWith("deck") || n.startsWith("paving"))) {
      const plan = planSurroundings(b)!;
      const h = plan.house!;
      expect(h, name).toBeTruthy();
      expect(h.zFront, name).toBeCloseTo(plan.footprint.minZ);
      expect(h.x0, name).toBeLessThan(plan.footprint.minX);
      expect(h.x1, name).toBeGreaterThan(plan.footprint.maxX);
      // The door opens onto the project, at its own surface height.
      expect(h.door.cx - h.door.w / 2, name).toBeGreaterThanOrEqual(plan.footprint.minX);
      expect(h.door.cx + h.door.w / 2, name).toBeLessThanOrEqual(plan.footprint.maxX + 1e-9);
    }
    expect(planSurroundings(buildScene("fence", { lengthM: 11 }, "ro"))!.house).toBeNull();
    expect(planSurroundings(buildScene("lawn", { areaM2: 24 }, "ro"))!.house).toBeNull();
  });

  it("is deterministic: the same build gives the same garden", () => {
    for (const [name, b] of OUTDOOR) expect(JSON.stringify(planSurroundings(b)), name).toBe(JSON.stringify(planSurroundings(b)));
  });

  it("never touches build.parts (quote, counts and exports are unchanged)", () => {
    const b = buildScene("deck", { lengthM: 4, widthM: 3 }, "ro");
    const before = JSON.stringify(b);
    foliageFor(planSurroundings(b)!);
    expect(JSON.stringify(b)).toBe(before);
  });

  it("keeps a room's dressing on the tall walls and inside the room", () => {
    const plan = planSurroundings(buildScene("tiling", { roomType: "bathroom", lengthM: 2.5, widthM: 2 }, "ro"))!;
    const r = plan.room!;
    for (const o of r.openings) {
      const [a, z] = o.wall === "n" || o.wall === "s" ? [r.x0, r.x1] : [r.z0, r.z1];
      expect(o.u0).toBeGreaterThanOrEqual(a - 1e-6);
      expect(o.u1).toBeLessThanOrEqual(z + 1e-6);
      expect(o.y1).toBeLessThanOrEqual(r.height);
    }
    expect(r.window.wall).toBe("n");
  });
});

describe("wallPieces", () => {
  it("covers the wall minus its holes exactly", () => {
    const holes = [
      { u0: 1, u1: 2, v0: 0, v1: 2 },
      { u0: 3, u1: 4, v0: 1, v1: 2 },
    ];
    const pieces = wallPieces(0, 5, 0, 3, holes);
    const area = pieces.reduce((s, p) => s + (p.u1 - p.u0) * (p.v1 - p.v0), 0);
    expect(area).toBeCloseTo(15 - 2 - 1);
    for (const p of pieces) for (const h of holes) expect(p.u1 <= h.u0 || p.u0 >= h.u1 || p.v1 <= h.v0 || p.v0 >= h.v1).toBe(true);
  });
});

describe("partVariation (per-part tone and grain offset)", () => {
  const board = { id: "board-3-1", finish: { kind: "wood" as const }, context: false };
  it("is deterministic per id and differs between ids", () => {
    expect(partVariation(board)).toEqual(partVariation({ ...board }));
    expect(partVariation(board)).not.toEqual(partVariation({ ...board, id: "board-3-2" }));
  });

  it("stays subtle: a few per cent of hue, saturation and lightness", () => {
    for (let i = 0; i < 400; i++) {
      for (const kind of ["wood", "wpc", "paver", "tile", "tileWall", "fenceBoard"] as const) {
        const v = partVariation({ id: `p-${i}`, finish: { kind }, context: false });
        expect(Math.abs(v.dh)).toBeLessThanOrEqual(0.01);
        expect(Math.abs(v.ds)).toBeLessThanOrEqual(0.05);
        expect(Math.abs(v.dl)).toBeLessThanOrEqual(0.05);
        expect(v.du).toBeGreaterThanOrEqual(0);
        expect(v.du).toBeLessThan(1);
      }
    }
  });

  it("never slides a grout-lined texture, and leaves context parts and plain finishes alone", () => {
    for (let i = 0; i < 50; i++) {
      for (const kind of ["tile", "tileWall", "paver", "fence"] as const) {
        const v = partVariation({ id: `t-${i}`, finish: { kind }, context: false });
        expect(v.du).toBe(0);
        expect(v.dv).toBe(0);
      }
    }
    expect(partVariation({ id: "wall-back", finish: { kind: "plaster" }, context: true })).toEqual({ dh: 0, ds: 0, dl: 0, du: 0, dv: 0 });
    expect(partVariation({ id: "x", finish: { kind: "concrete" }, context: false })).toEqual({ dh: 0, ds: 0, dl: 0, du: 0, dv: 0 });
  });

  it("works with laying patterns: only wood slides its grain, along the board, never pavers", () => {
    const builds = [
      buildScene("deck", { lengthM: 4, widthM: 3, boards: "diagonal" }, "ro"),
      buildScene("deck", { lengthM: 4, widthM: 3, boards: "frame" }, "ro"),
      buildScene("paving", { lengthM: 4.5, widthM: 3.5, bond: "herringbone" }, "ro"),
      buildScene("paving", { lengthM: 4.5, widthM: 3.5, bond: "basketweave" }, "ro"),
    ];
    let boards = 0;
    let pavers = 0;
    for (const b of builds) {
      for (const p of b.parts) {
        const v = partVariation(p);
        expect(v.dv, p.id).toBe(0);
        if (p.finish?.kind === "paver") {
          pavers++;
          expect(v.du, p.id).toBe(0);
        }
        if (p.layer === "deck_board") boards++;
      }
    }
    expect(boards).toBeGreaterThan(10);
    expect(pavers).toBeGreaterThan(10);
  });
});
