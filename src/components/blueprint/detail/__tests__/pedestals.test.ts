import { describe, expect, it } from "vitest";
import { pedestalGrid } from "../pedestals";

describe("pedestalGrid", () => {
  it("places a grid point roughly every 0.4 m along the run and 0.6 m across it", () => {
    const g = pedestalGrid(4, 3);
    expect(g.J).toBe(Math.ceil(4 / 0.4) + 1);
    expect(g.S).toBe(Math.ceil(3 / 0.6) + 1);
  });

  it("keeps every grid cell when it's under the cap", () => {
    const g = pedestalGrid(2, 1.5, { maxCount: 1000 });
    expect(g.stepS).toBe(1);
    expect(g.points.length).toBe(g.J * g.S);
  });

  it("thins the grid once it would exceed maxCount, but never drops below one point", () => {
    const g = pedestalGrid(20, 15, { maxCount: 100 });
    expect(g.points.length).toBeLessThanOrEqual(100);
    expect(g.points.length).toBeGreaterThan(0);
    expect(g.stepS).toBeGreaterThan(1);
  });

  it("spans the full run/across range at its first and last grid line", () => {
    const g = pedestalGrid(5, 2.4, { maxCount: 1000 });
    const us = g.points.map((p) => p.u);
    const vs = g.points.map((p) => p.v);
    expect(Math.min(...us)).toBeCloseTo(0, 6);
    expect(Math.max(...us)).toBeCloseTo(5, 6);
    expect(Math.min(...vs)).toBeCloseTo(0, 6);
    expect(Math.max(...vs)).toBeCloseTo(2.4, 6);
  });

  it("never divides by zero for a single grid line (a tiny run/across)", () => {
    const g = pedestalGrid(0.01, 0.01);
    expect(Number.isFinite(g.points[0]?.u ?? 0)).toBe(true);
    expect(Number.isFinite(g.points[0]?.v ?? 0)).toBe(true);
  });

  it("scales up with a bigger deck (more grid lines before thinning)", () => {
    const small = pedestalGrid(2, 2, { maxCount: 100000 });
    const big = pedestalGrid(10, 8, { maxCount: 100000 });
    expect(big.points.length).toBeGreaterThan(small.points.length);
  });
});
