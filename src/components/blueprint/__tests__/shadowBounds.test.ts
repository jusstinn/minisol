import { describe, expect, it } from "vitest";
import type { Vec3 } from "../builders";
import { shadowBoundsFor } from "../shadowBounds";

const deck: Vec3 = [4, 0.4, 3]; // "Terasă 4 × 3 m"
const bathroom: Vec3 = [2.5, 2.6, 2];
const bigFence: Vec3 = [30, 1.8, 2];

describe("shadowBoundsFor", () => {
  it("fits a small deck far tighter than the old fixed ±12 m frustum", () => {
    const b = shadowBoundsFor(deck);
    expect(b.half).toBeLessThan(6);
    expect(b.half).toBeGreaterThan(0);
  });

  it("grows the frustum for a bigger build", () => {
    const small = shadowBoundsFor(bathroom);
    const big = shadowBoundsFor(bigFence);
    expect(big.half).toBeGreaterThan(small.half);
    expect(big.far).toBeGreaterThan(small.far);
  });

  it("keeps the far plane comfortably beyond the build's own height and span", () => {
    for (const extent of [deck, bathroom, bigFence]) {
      const b = shadowBoundsFor(extent);
      const [L, H, W] = extent;
      expect(b.far).toBeGreaterThan(Math.max(L, W));
      expect(b.far).toBeGreaterThan(H);
    }
  });

  it("returns a power-of-two map size within [512, 2048] for the live view", () => {
    for (const extent of [deck, bathroom, bigFence]) {
      const { mapSize } = shadowBoundsFor(extent);
      expect(mapSize).toBeGreaterThanOrEqual(512);
      expect(mapSize).toBeLessThanOrEqual(2048);
      expect(Math.log2(mapSize) % 1).toBe(0);
    }
  });

  it("allows a bigger map size for a capture than for the live view, same build", () => {
    const live = shadowBoundsFor(bigFence);
    const capture = shadowBoundsFor(bigFence, { capture: true });
    expect(capture.mapSize).toBeGreaterThanOrEqual(live.mapSize);
    expect(capture.mapSize).toBeLessThanOrEqual(4096);
  });

  it("never collapses to a degenerate frustum for a tiny build", () => {
    const tiny: Vec3 = [0.3, 0.2, 0.3];
    const b = shadowBoundsFor(tiny);
    expect(b.half).toBeGreaterThan(0.5);
    expect(b.mapSize).toBeGreaterThanOrEqual(512);
  });
});
