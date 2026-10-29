import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { SLAT_GAP, slatLayout, slatsGeometryFor } from "../geometries";

describe("slatted fence panels", () => {
  it("divides a panel into ~9 cm boards with ~1.2 cm gaps that fill it exactly", () => {
    const { count, width } = slatLayout(1.8);
    expect(count).toBe(18);
    expect(width).toBeGreaterThan(0.08);
    expect(width).toBeLessThan(0.1);
    expect(count * width + (count - 1) * SLAT_GAP).toBeCloseTo(1.8, 9);
    expect(slatLayout(0.05).count).toBe(1);
  });

  it("is built at the panel's real size, along whichever axis it's longer on", () => {
    const along = slatsGeometryFor([1.8, 1.75, 0.035]);
    along.computeBoundingBox();
    const a = along.boundingBox!.getSize(new THREE.Vector3());
    expect(a.x).toBeCloseTo(1.8, 2);
    expect(a.y).toBeCloseTo(1.75, 2);
    expect(a.z).toBeCloseTo(0.035, 3);

    const across = slatsGeometryFor([0.035, 1.75, 1.8]);
    across.computeBoundingBox();
    const b = across.boundingBox!.getSize(new THREE.Vector3());
    expect(b.z).toBeCloseTo(1.8, 2);
    expect(b.x).toBeCloseTo(0.035, 3);
  });

  it("maps texture coordinates over the panel's face, 0..1 like a plain box's front", () => {
    const g = slatsGeometryFor([1.2, 1.8, 0.035]);
    const uv = g.getAttribute("uv");
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (let i = 0; i < uv.count; i++) {
      minU = Math.min(minU, uv.getX(i));
      maxU = Math.max(maxU, uv.getX(i));
      minV = Math.min(minV, uv.getY(i));
      maxV = Math.max(maxV, uv.getY(i));
    }
    expect(minU).toBeGreaterThanOrEqual(-1e-6);
    expect(maxU).toBeLessThanOrEqual(1 + 1e-6);
    expect(minV).toBeCloseTo(0, 6);
    expect(maxV).toBeCloseTo(1, 6);
  });

  it("is cached per size", () => {
    expect(slatsGeometryFor([1.8, 1.75, 0.035])).toBe(slatsGeometryFor([1.8, 1.75, 0.035]));
  });
});
