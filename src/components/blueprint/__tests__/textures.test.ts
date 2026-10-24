import { describe, expect, it } from "vitest";
import type { Vec3 } from "../builders";
import { finishStyle, repeatFor } from "../textures";

describe("repeatFor", () => {
  it("repeats a 4 m deck board's grain many times along its length, once across its width", () => {
    const board: Vec3 = [4, 0.028, 0.145]; // run × thickness × width
    const [rx, ry] = repeatFor(board, { kind: "wood" });
    expect(rx).toBeCloseTo(4 / 0.9, 2); // DEFAULT_UNIT.wood[0] = 0.9 m
    expect(ry).toBeCloseTo(0.145 / 0.14, 2);
    expect(rx).toBeGreaterThan(3);
  });

  it("doubles the repeat when the board is twice as long, same width", () => {
    const short: Vec3 = [2, 0.028, 0.145];
    const long: Vec3 = [4, 0.028, 0.145];
    const [rxShort] = repeatFor(short, { kind: "wood" });
    const [rxLong] = repeatFor(long, { kind: "wood" });
    expect(rxLong).toBeCloseTo(rxShort * 2, 5);
  });

  it("uses the real (pre-scale-up) tile format, not the drawn box, when `unit` is given", () => {
    const drawnBox: Vec3 = [0.9, 0.01, 0.9]; // builders.ts drew 3× 0.3 m tiles as one 0.9 m box
    const [rx, ry] = repeatFor(drawnBox, { kind: "tile", unit: [0.3, 0.3] });
    expect(rx).toBeCloseTo(3, 5);
    expect(ry).toBeCloseTo(3, 5);
  });

  it("never asks for a near-zero repeat on a sliver-thin part", () => {
    const sliver: Vec3 = [0.01, 0.01, 0.01];
    const [rx, ry] = repeatFor(sliver, { kind: "metal" });
    expect(rx).toBeGreaterThanOrEqual(0.2);
    expect(ry).toBeGreaterThanOrEqual(0.2);
  });

  it("'xy' wraps width × height (a vertical panel); 'xz' wraps width × depth (the ground plane)", () => {
    const panel: Vec3 = [1.8, 1.8, 0.035]; // fence panel: width × height × thickness
    const [, vyXY] = repeatFor(panel, { kind: "fence", unit: [0.14, 1], axes: "xy" });
    const [, vyXZ] = repeatFor(panel, { kind: "fence", unit: [0.14, 1], axes: "xz" });
    // xy's second axis is the panel's real height (1.8 m); xz's is its tiny thickness.
    expect(vyXY).toBeGreaterThan(vyXZ);
  });

  it("'zy' wraps depth × height — an east/west wall's own long span, not its thin width", () => {
    const ewWallTile: Vec3 = [0.008, 0.3, 0.6]; // thickness × height × along-wall span
    const [u] = repeatFor(ewWallTile, { kind: "tile", unit: [0.6, 0.3], axes: "zy" });
    expect(u).toBeCloseTo(1, 2); // one 0.6 m tile exactly
  });
});

describe("finishStyle", () => {
  it("reads metal back as far more metallic than wood or plaster", () => {
    expect(finishStyle("metal").metalness).toBeGreaterThan(finishStyle("wood").metalness);
    expect(finishStyle("metal").metalness).toBeGreaterThan(finishStyle("plaster").metalness);
  });

  it("reads ceramic tile back as smoother (lower roughness) than gravel or soil", () => {
    expect(finishStyle("tile").roughness).toBeLessThan(finishStyle("gravel").roughness);
    expect(finishStyle("tile").roughness).toBeLessThan(finishStyle("soil").roughness);
  });
});
