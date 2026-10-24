import { describe, expect, it } from "vitest";
import { applyOps, defaultLayout } from "@/domain/layout";
import { buildScene } from "../../blueprint/builders";
import { planDrawing } from "../planDrawing";

describe("planDrawing (the sketch from above, for the store sheet)", () => {
  it("draws a 4 × 3 m deck to scale, top layer last, with its plan dimensions", () => {
    const d = planDrawing(buildScene("deck", { lengthM: 4, widthM: 3 }, "ro"));
    expect(d.rects.length).toBeGreaterThan(10);
    // The footprint of everything drawn is the deck (± the board overhang).
    const minX = Math.min(...d.rects.map((r) => r.x));
    const maxX = Math.max(...d.rects.map((r) => r.x + r.w));
    const minY = Math.min(...d.rects.map((r) => r.y));
    const maxY = Math.max(...d.rects.map((r) => r.y + r.h));
    expect(maxX - minX).toBeGreaterThan(3.9);
    expect(maxX - minX).toBeLessThan(4.3);
    expect(maxY - minY).toBeGreaterThan(2.9);
    expect(maxY - minY).toBeLessThan(3.3);
    // Plan dimensions only (no vertical height lines), with their labels.
    expect(d.dims.length).toBeGreaterThanOrEqual(2);
    expect(d.dims.map((x) => x.label).join(" ")).toMatch(/4 m/);
    // The view box holds everything, with room for the labels.
    const [vx, vy, vw, vh] = d.viewBox;
    expect(vx).toBeLessThan(minX);
    expect(vy).toBeLessThan(minY);
    expect(vx + vw).toBeGreaterThan(maxX);
    expect(vy + vh).toBeGreaterThan(maxY);
  });

  it("works for every kind of project, including an L-shape and a fence with a corner", () => {
    const l = applyOps(defaultLayout("deck", { lengthM: 4, widthM: 3 }), [{ op: "add_zone", zone: "A", side: "e", w: 2, d: 2 }]).layout;
    const builds = [
      buildScene("deck", { lengthM: 4, widthM: 3 }, "ro", l),
      buildScene("tiling", { lengthM: 2.5, widthM: 2, roomType: "bathroom" }, "en"),
      buildScene("fence", { lengthM: 11, heightM: 1.8 }, "ro"),
      buildScene("paving", { lengthM: 6, widthM: 1.2, use: "path", edging: true }, "ro"),
      buildScene("paint_room", { lengthM: 4, widthM: 3.5, heightM: 2.6 }, "ro"),
    ];
    for (const b of builds) {
      const d = planDrawing(b);
      expect(d.rects.length).toBeGreaterThan(0);
      expect(d.viewBox.every(Number.isFinite)).toBe(true);
      expect(d.viewBox[2]).toBeGreaterThan(0);
    }
  });

  it("an empty build gives an empty drawing, not NaN", () => {
    expect(planDrawing({ parts: [], dims: [], extent: [0, 0, 0], layers: [], duration: 0 })).toEqual({ viewBox: [0, 0, 1, 1], rects: [], dims: [] });
  });
});
