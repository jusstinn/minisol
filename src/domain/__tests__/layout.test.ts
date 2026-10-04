import { describe, expect, it } from "vitest";
import { buildLayout } from "../../components/blueprint/builders";
import { calculateProject } from "../calculators";
import { applyOps, defaultLayout, exposedEdges, fenceSegments, layoutParams, SketchEditError, unionPerimeter } from "../layout";
import type { Layout, Zone } from "../layout";

const req = (r: ReturnType<typeof calculateProject>, role: string) => r.requirements.find((x) => x.role === role);
const calc = (l: Layout) => calculateProject(l.type, layoutParams(l));
const zonesOf = (l: Layout) => ("zones" in l ? l.zones : []);

describe("plan geometry", () => {
  const A: Zone = { id: "A", x: 0, z: 0, w: 4, d: 3 };
  const B: Zone = { id: "B", x: 4, z: 0, w: 2, d: 2 };

  it("measures the outline of an L, not two boxes", () => {
    expect(unionPerimeter([A])).toBeCloseTo(14, 1);
    expect(unionPerimeter([A, B])).toBeCloseTo(18, 1); // 2 × (6 + 3)
  });

  it("drops the shared edge between zones", () => {
    const edges = exposedEdges([A, B]);
    const total = edges.reduce((s, e) => s + Math.abs(e.x2 - e.x1) + Math.abs(e.z2 - e.z1), 0);
    expect(total).toBeCloseTo(18, 1);
    // nothing is left on x = 4 between z = 0 and z = 2 (the seam)
    expect(edges.some((e) => e.x1 === 4 && e.x2 === 4 && Math.min(e.z1, e.z2) < 2 - 1e-6)).toBe(false);
  });

  it("measures fence runs", () => {
    const segs = fenceSegments([{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 4 }]);
    expect(segs.map((s) => s.length)).toEqual([10, 4]);
  });
});

describe("applyOps", () => {
  const deck = defaultLayout("deck", { lengthM: 4, widthM: 3 });

  it("attaches a wing to a side and reports it", () => {
    const { layout, changes } = applyOps(deck, [{ op: "add_zone", zone: "A", side: "e", w: 2, d: 2, align: "start" }], "en");
    const [a, b] = zonesOf(layout);
    expect(b.id).toBe("B");
    expect(b.x).toBeCloseTo(a.x + a.w);
    expect(b.z).toBeCloseTo(a.z);
    expect(changes[0]).toMatch(/east side of zone A/);
  });

  it("keeps coordinates stable so untouched parts don't move", () => {
    const { layout } = applyOps(deck, [{ op: "add_zone", zone: "A", side: "e", w: 2, d: 2 }]);
    expect(zonesOf(layout)[0]).toEqual(zonesOf(deck)[0]);
  });

  it("does not mutate the input layout", () => {
    const before = JSON.stringify(deck);
    applyOps(deck, [{ op: "resize", zone: "A", w: 6 }]);
    expect(JSON.stringify(deck)).toBe(before);
  });

  it("rejects overlapping zones and impossible sizes", () => {
    const withB = applyOps(deck, [{ op: "add_zone", zone: "A", side: "e", w: 2, d: 2 }]).layout;
    expect(() => applyOps(withB, [{ op: "add_zone", zone: "A", side: "e", w: 2, d: 2 }])).toThrow(SketchEditError);
    expect(() => applyOps(deck, [{ op: "resize", zone: "A", w: 90 }])).toThrow(SketchEditError);
    expect(() => applyOps(deck, [{ op: "add_opening", kind: "gate" }])).toThrow(SketchEditError);
  });

  it("reuses the first free zone letter after a removal", () => {
    let l = applyOps(deck, [
      { op: "add_zone", zone: "A", side: "e", w: 2, d: 2 },
      { op: "add_zone", zone: "A", side: "s", w: 2, d: 1 },
    ]).layout;
    l = applyOps(l, [{ op: "remove_zone", zone: "B" }]).layout;
    l = applyOps(l, [{ op: "add_zone", zone: "A", side: "w", w: 1, d: 1 }]).layout;
    const ids = zonesOf(l).map((z) => z.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("B");
  });

  it("snaps fence heights to real panel sizes", () => {
    const fence = defaultLayout("fence", { lengthM: 20 });
    const { layout } = applyOps(fence, [{ op: "set_height", value: 1.5 }]);
    expect(layout.type === "fence" && layout.heightM).toBe(1.8);
  });

  it("turns a fence corner at 90°", () => {
    const fence = defaultLayout("fence", { lengthM: 10 });
    const { layout } = applyOps(fence, [{ op: "add_fence_segment", length: 5, turn: "right" }]);
    if (layout.type !== "fence") throw new Error();
    const segs = fenceSegments(layout.points);
    expect(segs.map((s) => s.length)).toEqual([10, 5]);
    expect(layout.points[2].x).toBeCloseTo(layout.points[1].x);
  });
});

describe("calculators follow the sketch", () => {
  it("an L-shaped deck costs more than its main rectangle, and steps add treads", () => {
    const base = defaultLayout("deck", { lengthM: 4, widthM: 3 });
    const l = applyOps(base, [{ op: "add_zone", zone: "A", side: "e", w: 2, d: 2 }]).layout;
    const r0 = calc(base);
    const r1 = calc(l);
    expect(r1.measurements.find((m) => m.unit === "m²")!.value).toBeCloseTo(16);
    expect(req(r1, "deck_board")!.quantity).toBeGreaterThan(req(r0, "deck_board")!.quantity);
    expect(r1.title).toMatch(/în L/);

    const withSteps = applyOps(l, [{ op: "set_height", value: 0.5 }, { op: "add_steps", zone: "A", side: "s", width: 1.2 }]).layout;
    const r2 = calc(withSteps);
    expect(r2.measurements.find((m) => m.label.includes("Trepte"))!.value).toBe(3); // 0.5 m ÷ 17 cm
    expect(req(r2, "deck_board")!.quantity).toBeGreaterThan(req(r1, "deck_board")!.quantity);
    // taller deck → pedestals must reach ~400 mm
    expect(req(r2, "deck_support")!.fitRange?.value).toBe(402);
  });

  it("a fence corner shares its post; gates replace panels and add a latch post", () => {
    const fence = defaultLayout("fence", { lengthM: 18.9, heightM: 1.8 });
    const straight = calc(fence);
    expect(req(straight, "fence_panel")!.quantity).toBe(10);
    expect(req(straight, "fence_post")!.quantity).toBe(11);

    const corner = applyOps(fence, [{ op: "add_fence_segment", length: 3.78, turn: "right" }]).layout;
    const rc = calc(corner);
    expect(req(rc, "fence_panel")!.quantity).toBe(12);
    expect(req(rc, "fence_post")!.quantity).toBe(13);

    // A gate splits its run in two: each side is panelled on its own, plus one latch post.
    const gated = applyOps(corner, [{ op: "add_opening", kind: "gate", segment: 0, width: 3, pos: 0.1 }]).layout;
    const rg = calc(gated);
    expect(req(rg, "fence_gate")!.quantity).toBe(1);
    expect(req(rg, "fence_gate")!.match).toMatchObject({ widthM: 3, heightM: 1.8 });
    const panels = req(rg, "fence_panel")!.quantity;
    expect(panels).toBe(12); // 0.35 m + 15.47 m runs → 1 + 9 panels (cut panels can't cross the gate)
    expect(req(rg, "fence_post")!.quantity).toBe(panels + 1 + 1);
    // and the 3D sketch shows exactly what is bought
    expect(buildLayout(gated, "ro").parts.filter((p) => p.layer === "fence_panel")).toHaveLength(panels);
  });

  it("per-wall tile heights change the tile area", () => {
    const t = defaultLayout("tiling", { lengthM: 2.5, widthM: 2, roomType: "bathroom" });
    const full = calc(t);
    const half = calc(applyOps(t, [{ op: "set_wall_tiles", wall: "n", value: 1.2 }]).layout);
    expect(req(half, "wall_tiles")!.quantity).toBeLessThan(req(full, "wall_tiles")!.quantity);
  });

  it("adding a window reduces the painted area", () => {
    const p = defaultLayout("paint_room", { lengthM: 4, widthM: 3.5 });
    const more = applyOps(p, [{ op: "add_opening", kind: "window", wall: "e", width: 1.2 }]).layout;
    expect(req(calc(more), "interior_paint")!.areaToCover!).toBeLessThan(req(calc(p), "interior_paint")!.areaToCover!);
  });
});

describe("3D sketch follows the layout", () => {
  it("draws every zone and keeps part ids stable across an edit", () => {
    const base = defaultLayout("deck", { lengthM: 4, widthM: 3 });
    const edited = applyOps(base, [{ op: "add_zone", zone: "A", side: "e", w: 2, d: 2 }]).layout;
    const b0 = buildLayout(base, "ro");
    const b1 = buildLayout(edited, "ro");
    const ids0 = new Map(b0.parts.map((p) => [p.id, JSON.stringify([p.pos, p.size])]));
    const unchanged = b1.parts.filter((p) => ids0.get(p.id) === JSON.stringify([p.pos, p.size]));
    // zone A is untouched → all of its parts are identical; zone B is new
    expect(unchanged.length).toBe(b0.parts.length);
    expect(b1.parts.some((p) => p.id.startsWith("B-board"))).toBe(true);
    expect(new Set(b1.parts.map((p) => p.id)).size).toBe(b1.parts.length);
  });

  it("has unique part ids for every project type", () => {
    const layouts: Layout[] = [
      applyOps(defaultLayout("fence", { lengthM: 20 }), [
        { op: "add_fence_segment", length: 6, turn: "left" },
        { op: "add_opening", kind: "gate", segment: 0, width: 3 },
      ]).layout,
      defaultLayout("laminate_floor", { lengthM: 5, widthM: 4, doorways: 2 }),
      defaultLayout("paint_room", { lengthM: 4, widthM: 3.5 }),
      defaultLayout("tiling", { lengthM: 2.5, widthM: 2 }),
      defaultLayout("drywall_partition", { lengthM: 3.5, doors: 1 }),
      defaultLayout("lawn", { areaM2: 80 }),
    ];
    for (const l of layouts) {
      const b = buildLayout(l, "en");
      expect(new Set(b.parts.map((p) => p.id)).size, l.type).toBe(b.parts.length);
    }
  });

  it("draws a gate and no doubled posts on a gated fence", () => {
    const l = applyOps(defaultLayout("fence", { lengthM: 18.9 }), [{ op: "add_opening", kind: "gate", segment: 0, width: 1 }]).layout;
    const b = buildLayout(l, "ro");
    expect(b.parts.filter((p) => p.layer === "fence_gate")).toHaveLength(1);
    const posts = b.parts.filter((p) => p.layer === "fence_post").map((p) => `${p.pos[0].toFixed(2)},${p.pos[2].toFixed(2)}`);
    expect(new Set(posts).size).toBe(posts.length);
    const r = calc(l);
    expect(posts.length).toBe(req(r, "fence_post")!.quantity);
  });
});

describe("the sketch shows the products actually chosen", () => {
  it("derives colour and dimensions from catalogue specs", async () => {
    const { lookOf, parseSizeCm } = await import("../look");
    const catalog = (await import("../../data/catalog.json")).default as unknown as import("../types").Product[];
    const larch = catalog.find((p) => p.sku === "11432893")!;
    const wpc = catalog.find((p) => p.sku === "11018655")!;
    const pine120 = catalog.find((p) => p.sku === "11427417")!;
    expect(lookOf(larch).color).not.toBe(lookOf(wpc).color);
    expect(lookOf(pine120).w).toBeCloseTo(0.12);
    expect(parseSizeCm("20x120")).toEqual([0.2, 1.2]);
    const joist = catalog.find((p) => p.roles.includes("deck_joist") && p.specs.sectionMm === "45x70")!;
    expect(lookOf(joist).w).toBeCloseTo(0.045);
    expect(lookOf(joist).t).toBeCloseTo(0.07);
  });

  it("narrower boards → more rows; bigger tiles → fewer tiles; colours follow the product", () => {
    const deck = defaultLayout("deck", { lengthM: 4, widthM: 3 });
    const rows = (w: number) => buildLayout(deck, "ro", { deck_board: { color: "#8a8c8f", name: "x", w } }).parts.filter((p) => p.layer === "deck_board");
    expect(rows(0.12).length).toBeGreaterThan(rows(0.145).length);
    expect(rows(0.12)[0].color).not.toBe(buildLayout(deck, "ro").parts.find((p) => p.layer === "deck_board")!.color);

    const bath = defaultLayout("tiling", { lengthM: 2.5, widthM: 2, roomType: "bathroom" });
    const floor = (w: number, l: number) => buildLayout(bath, "ro", { floor_tiles: { color: "#9c9fa3", name: "t", w, l } }).parts.filter((p) => p.layer === "floor_tiles").length;
    expect(floor(0.6, 0.6)).toBeLessThan(floor(0.33, 0.33));
    // same ids for the parts that stay → swapping a product morphs instead of rebuilding
    const a = buildLayout(deck, "ro", { deck_board: { color: "#b9774a", name: "larch", w: 0.143 } }).parts.map((p) => p.id);
    const b = buildLayout(deck, "ro", { deck_board: { color: "#8a8c8f", name: "wpc", w: 0.14 } }).parts.map((p) => p.id);
    expect(b.filter((id) => a.includes(id)).length / b.length).toBeGreaterThan(0.9);
  });
});

describe("QA follow-ups", () => {
  it("a raised deck requested up front gets its height (and tall supports)", () => {
    const l = defaultLayout("deck", { lengthM: 4, widthM: 3, heightM: 0.5 });
    expect(l.type === "deck" && l.heightM).toBe(0.5);
  });
  it("80 m² of lawn stays 80 m²", () => {
    const r = calc(defaultLayout("lawn", { areaM2: 80 }));
    expect(r.measurements.find((m) => m.unit === "m²")!.value).toBe(80);
  });
  it("steps can't go on a side covered by another zone; no phantom step removal", () => {
    const l = applyOps(defaultLayout("deck", { lengthM: 4, widthM: 3 }), [{ op: "add_zone", zone: "A", side: "e", w: 2, d: 3 }]).layout;
    expect(() => applyOps(l, [{ op: "add_steps", zone: "A", side: "e" }])).toThrow(SketchEditError);
    expect(() => applyOps(l, [{ op: "remove_steps" }])).toThrow(SketchEditError);
  });
  it("a second door goes into a free spot instead of on top of the first", () => {
    const l0 = defaultLayout("drywall_partition", { lengthM: 3.5, doors: 1 });
    const l = applyOps(l0, [{ op: "add_opening", kind: "door" }]).layout;
    if (l.type !== "drywall_partition") throw new Error();
    const [a, b] = l.openings.map((o) => o.pos * 3.5);
    expect(Math.abs(a - b)).toBeGreaterThanOrEqual(0.9);
    expect(() => applyOps(defaultLayout("drywall_partition", { lengthM: 1.2, doors: 1 }), [{ op: "add_opening", kind: "door" }])).toThrow(SketchEditError);
    const b3 = buildLayout(l, "ro");
    expect(new Set(b3.parts.map((p) => p.id)).size).toBe(b3.parts.length);
  });
  it("option changes are described in words", () => {
    const { changes } = applyOps(defaultLayout("paint_room", { lengthM: 4, widthM: 3 }), [{ op: "set_option", key: "ceiling", value: false }], "ro");
    expect(changes[0]).toBe("Fără tavan");
  });
});

describe("fence gates", () => {
  it("never stack: a second gate goes to the nearest free spot", () => {
    const fence = defaultLayout("fence", { lengthM: 20, heightM: 1.8 });
    const two = applyOps(fence, [{ op: "add_opening", kind: "gate", segment: 0 }, { op: "add_opening", kind: "gate", segment: 0 }], "ro").layout;
    if (two.type !== "fence") throw new Error("not a fence");
    const [a, b] = two.gates.map((g) => g.pos * 20);
    // Two 1 m gates: at least their width plus a post (30 cm) between them.
    expect(Math.abs(a - b)).toBeGreaterThanOrEqual(1 + 0.3 - 1e-9);
  });

  it("refuses a gate when a short segment is full", () => {
    const short = defaultLayout("fence", { lengthM: 4, heightM: 1.2 });
    const one = applyOps(short, [{ op: "add_opening", kind: "gate", segment: 0, width: 3 }], "ro").layout;
    expect(() => applyOps(one, [{ op: "add_opening", kind: "gate", segment: 0, width: 1 }], "ro")).toThrow(SketchEditError);
  });
});
