import { describe, expect, it } from "vitest";
import { buildScene } from "../../builders";
import { SCREW_RADIUS, bladeGeometry, deckScrewPoints, grassBlades, mulberry32, screwGeometry, thinEvenly } from "../decor";

describe("thinEvenly", () => {
  it("returns everything when under the cap, and a copy", () => {
    const a = [1, 2, 3];
    const out = thinEvenly(a, 5);
    expect(out).toEqual(a);
    expect(out).not.toBe(a);
  });

  it("keeps exactly `cap` items spread across the whole list, not just the first ones", () => {
    const items = Array.from({ length: 1000 }, (_, i) => i);
    const out = thinEvenly(items, 10);
    expect(out).toHaveLength(10);
    expect(out[0]).toBe(0);
    expect(out[9]).toBeGreaterThan(880);
    expect(new Set(out).size).toBe(10);
    expect([...out].sort((a, b) => a - b)).toEqual(out);
  });

  it("handles a cap of zero", () => {
    expect(thinEvenly([1, 2, 3], 0)).toEqual([]);
  });
});

describe("deck screws", () => {
  const deck = buildScene("deck", { lengthM: 4, widthM: 3 }, "ro");

  it("sit on the boards, in export space (recentred)", () => {
    const pts = deckScrewPoints(deck.parts, [0, 0], 5000);
    expect(pts.length).toBeGreaterThan(100);
    // Heads are just above the top surface of the boards (0.18 m).
    for (const [x, y, z] of pts) {
      expect(y).toBeGreaterThan(0.17);
      expect(y).toBeLessThan(0.2);
      expect(Math.abs(x)).toBeLessThan(2.2);
      expect(Math.abs(z)).toBeLessThan(1.7);
    }
    const shifted = deckScrewPoints(deck.parts, [1, 2], 5000);
    expect(shifted[0][0]).toBeCloseTo(pts[0][0] - 1, 9);
    expect(shifted[0][2]).toBeCloseTo(pts[0][2] - 2, 9);
  });

  it("are capped", () => {
    expect(deckScrewPoints(deck.parts, [0, 0], 50)).toHaveLength(50);
  });

  it("are flat hexagons facing up: a fan of 6 triangles per head", () => {
    const g = screwGeometry([[0, 0.2, 0], [1, 0.2, 1]])!;
    expect(g.getAttribute("position").count).toBe(14);
    expect(g.index!.count).toBe(2 * 6 * 3);
    const n = g.getAttribute("normal");
    for (let i = 0; i < n.count; i++) expect([n.getX(i), n.getY(i), n.getZ(i)]).toEqual([0, 1, 0]);
    const p = g.getAttribute("position");
    expect(Math.hypot(p.getX(1), p.getZ(1))).toBeCloseTo(SCREW_RADIUS, 9);
  });

  it("make no geometry for none", () => {
    expect(screwGeometry([])).toBeNull();
  });
});

describe("lawn blades", () => {
  const grass = { zones: [{ x: -2, z: -1, w: 4, d: 2 }, { x: 3, z: 0, w: 1, d: 1 }], count: 900, delay: 1 };

  it("are deterministic, in the zones, and recentred", () => {
    const a = grassBlades(grass, [0, 0], 5000);
    const b = grassBlades(grass, [0, 0], 5000);
    expect(a).toEqual(b);
    expect(a.length).toBe(Math.round((900 * 8) / 9) + Math.round((900 * 1) / 9));
    for (const bl of a.slice(0, 700)) {
      expect(bl.x).toBeGreaterThanOrEqual(-2);
      expect(bl.x).toBeLessThanOrEqual(2);
      expect(bl.z).toBeGreaterThanOrEqual(-1);
      expect(bl.z).toBeLessThanOrEqual(1);
      expect(bl.h).toBeGreaterThanOrEqual(0.06);
      expect(bl.h).toBeLessThanOrEqual(0.15);
    }
    const moved = grassBlades(grass, [1, 1], 5000);
    expect(moved[0].x).toBeCloseTo(a[0].x - 1, 9);
    expect(moved[0].z).toBeCloseTo(a[0].z - 1, 9);
  });

  it("are capped, keeping the zones in proportion", () => {
    const some = grassBlades(grass, [0, 0], 90);
    expect(some.length).toBeLessThanOrEqual(92);
    expect(some.length).toBeGreaterThanOrEqual(88);
    expect(some.filter((b) => b.x > 2.5).length).toBeGreaterThan(5);
  });

  it("use the same random sequence as the live view's lawn (so the lawn looks the same)", () => {
    // The live view seeds zone i with mulberry32(42 + i * 7919) and draws x, z, h… in this order.
    const rnd = mulberry32(42);
    const x = -2 + rnd() * 4;
    const z = -1 + rnd() * 2;
    const [first] = grassBlades(grass, [0, 0], 5000);
    expect(first.x).toBeCloseTo(x, 12);
    expect(first.z).toBeCloseTo(z, 12);
  });

  it("make two crossed triangles each, with unit normals, and the tip at the blade's height", () => {
    const blades = grassBlades(grass, [0, 0], 20);
    const g = bladeGeometry(blades, { colors: true })!;
    expect(g.getAttribute("position").count).toBe(blades.length * 6);
    expect(g.getAttribute("color")).toBeDefined();
    const n = g.getAttribute("normal");
    for (let i = 0; i < n.count; i++) expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 5);
    const p = g.getAttribute("position");
    let top = 0;
    for (let i = 0; i < p.count; i++) top = Math.max(top, p.getY(i));
    expect(top).toBeGreaterThan(0.06);
    expect(top).toBeLessThan(0.2);
  });

  it("add reversed copies for formats with no double-sided material, and drop the vertex colours when not wanted", () => {
    const blades = grassBlades(grass, [0, 0], 10);
    const single = bladeGeometry(blades)!;
    const dbl = bladeGeometry(blades, { backfaces: true })!;
    expect(dbl.getAttribute("position").count).toBe(single.getAttribute("position").count * 2);
    expect(single.getAttribute("color")).toBeUndefined();
    // The first front triangle's normal is mirrored by its back triangle.
    const n = dbl.getAttribute("normal");
    expect(n.getX(3) + n.getX(0)).toBeCloseTo(0, 6);
    expect(n.getY(3) + n.getY(0)).toBeCloseTo(0, 6);
    expect(n.getZ(3) + n.getZ(0)).toBeCloseTo(0, 6);
    // The back triangle winds the other way: (a, b, c) front is (c, b, a) back.
    const p = dbl.getAttribute("position");
    expect([p.getX(3), p.getY(3), p.getZ(3)]).toEqual([p.getX(2), p.getY(2), p.getZ(2)]);
  });

  it("make no geometry for none", () => {
    expect(bladeGeometry([])).toBeNull();
  });
});
