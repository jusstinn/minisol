import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { bevelCacheSize, bevelGeometryFor, unitGeometryFor } from "../geometries";

function size(geo: THREE.BufferGeometry): THREE.Vector3 {
  geo.computeBoundingBox();
  const box = geo.boundingBox!;
  return box.getSize(new THREE.Vector3());
}

describe("unitGeometryFor", () => {
  it("every unit shape fits exactly in the -0.5..0.5 cube on every axis", () => {
    for (const shape of ["box", "pedestal", "postCap", "cylinder", "cone", "sphere"] as const) {
      const geo = unitGeometryFor(shape);
      const s = size(geo);
      expect(s.x).toBeLessThanOrEqual(1.001);
      expect(s.y).toBeLessThanOrEqual(1.001);
      expect(s.z).toBeLessThanOrEqual(1.001);
    }
  });

  it("box is the shared geometry for every bevel kind too (bevels are built to real size instead)", () => {
    expect(unitGeometryFor("bevelSoft")).toBe(unitGeometryFor("box"));
  });
});

describe("bevelGeometryFor", () => {
  it("builds a box at the part's own real size, not a scaled unit cube", () => {
    const geo = bevelGeometryFor("bevelSoft", [4, 0.028, 0.145]);
    const s = size(geo);
    expect(s.x).toBeCloseTo(4, 2);
    expect(s.y).toBeCloseTo(0.028, 3);
    expect(s.z).toBeCloseTo(0.145, 3);
  });

  it("caches by size: two parts of the same size share one geometry, a different size gets its own", () => {
    const before = bevelCacheSize();
    const a = bevelGeometryFor("bevelSoft", [1.285, 0.009, 0.19]);
    const b = bevelGeometryFor("bevelSoft", [1.285, 0.009, 0.19]);
    expect(a).toBe(b);
    expect(bevelCacheSize()).toBe(before + 1);
    const c = bevelGeometryFor("bevelSoft", [0.9, 0.009, 0.19]);
    expect(c).not.toBe(a);
    expect(bevelCacheSize()).toBe(before + 2);
  });

  it("never blows up on a hair-thin part (a membrane, a vapour barrier)", () => {
    expect(() => bevelGeometryFor("bevelFlat", [2.5, 0.003, 2])).not.toThrow();
    const s = size(bevelGeometryFor("bevelFlat", [2.5, 0.003, 2]));
    expect(s.y).toBeCloseTo(0.003, 3);
  });

  it("stays correct for a long, narrow member (a 4 m board) — not a giant diagonal chamfer at the ends", () => {
    const geo = bevelGeometryFor("bevelSoft", [4, 0.028, 0.145]);
    const pos = geo.attributes.position;
    let maxAbsX = 0;
    for (let i = 0; i < pos.count; i++) maxAbsX = Math.max(maxAbsX, Math.abs(pos.getX(i)));
    // the chamfer (a few mm) should barely eat into the board's own half-length (2 m)
    expect(maxAbsX).toBeGreaterThan(2 - 0.01);
    expect(maxAbsX).toBeLessThanOrEqual(2 + 1e-6);
  });
});
