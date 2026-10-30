import { describe, expect, it } from "vitest";
import { isPowerOfTwo, normalFromHeight, normalStrength, potSize, toMetalRough } from "../pixels";

describe("potSize", () => {
  it("rounds to the nearest power of two (in log space) and caps it", () => {
    expect(potSize(256)).toBe(256);
    expect(potSize(160)).toBe(128);
    expect(potSize(200)).toBe(256);
    expect(potSize(64)).toBe(64);
    expect(potSize(1000)).toBe(256);
    expect(potSize(1000, 1024)).toBe(1024);
    expect(potSize(1)).toBe(4);
    expect(potSize(Number.NaN)).toBe(4);
  });

  it("always yields a power of two within the cap", () => {
    for (let n = 1; n < 600; n += 7) {
      const s = potSize(n, 512);
      expect(isPowerOfTwo(s)).toBe(true);
      expect(s).toBeLessThanOrEqual(512);
    }
    expect(isPowerOfTwo(160)).toBe(false);
  });
});

describe("toMetalRough", () => {
  it("puts the roughness in green and leaves the factors on the material (red and blue full)", () => {
    const out = toMetalRough(new Uint8ClampedArray([10, 10, 10, 255, 200, 200, 200, 255]));
    expect([...out]).toEqual([255, 10, 255, 255, 255, 200, 255, 255]);
  });
});

describe("normalStrength", () => {
  it("grows with the finish's bump scale, within limits", () => {
    expect(normalStrength(0.004)).toBeGreaterThan(normalStrength(0.0022));
    expect(normalStrength(0.0022)).toBeGreaterThan(normalStrength(0.0003));
    expect(normalStrength(0)).toBeGreaterThan(0);
    expect(normalStrength(1)).toBeLessThanOrEqual(2.6);
  });
});

describe("normalFromHeight", () => {
  const grey = (w: number, h: number, f: (x: number, y: number) => number) => {
    const a = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) a.set([f(x, y), f(x, y), f(x, y), 255], (y * w + x) * 4);
    return a;
  };
  const px = (a: Uint8ClampedArray, w: number, x: number, y: number) => [...a.subarray((y * w + x) * 4, (y * w + x) * 4 + 3)];

  it("a flat surface is the flat normal (0.5, 0.5, 1)", () => {
    const n = normalFromHeight(grey(8, 8, () => 120), 8, 8, 1);
    expect(px(n, 8, 3, 3)).toEqual([128, 128, 255]);
  });

  it("tilts away from higher ground: a rise toward +x leans the normal toward -x (red below half)", () => {
    // Height grows with x, wrapping at the edge — look at an interior pixel.
    const n = normalFromHeight(grey(16, 16, (x) => x * 10), 16, 16, 1);
    const [r, g, b] = px(n, 16, 8, 8);
    expect(r).toBeLessThan(128);
    expect(g).toBe(128);
    expect(b).toBeGreaterThan(r);
  });

  it("in glTF's convention green points toward the TOP of the stored image: a rise toward the top leans the normal down (green below half)", () => {
    // Rows grow downward; height is largest at the top row, falling toward the bottom.
    const n = normalFromHeight(grey(16, 16, (_x, y) => 200 - y * 10), 16, 16, 1);
    const [r, g] = px(n, 16, 8, 8);
    expect(r).toBe(128);
    expect(g).toBeLessThan(128);
    // ...and the mirror image leans the other way.
    const m = normalFromHeight(grey(16, 16, (_x, y) => 50 + y * 10), 16, 16, 1);
    expect(px(m, 16, 8, 8)[1]).toBeGreaterThan(128);
  });

  it("stronger relief tilts more", () => {
    const h = grey(16, 16, (x) => x * 10);
    const soft = px(normalFromHeight(h, 16, 16, 0.5), 16, 8, 8)[0];
    const hard = px(normalFromHeight(h, 16, 16, 2), 16, 8, 8)[0];
    expect(hard).toBeLessThan(soft);
  });

  it("every normal is a unit vector, and the map wraps (a tileable height stays tileable)", () => {
    const w = 16;
    const n = normalFromHeight(grey(w, w, (x, y) => ((x * 37 + y * 91) % 255)), w, w, 1.3);
    for (let i = 0; i < w * w; i++) {
      const v = [n[i * 4], n[i * 4 + 1], n[i * 4 + 2]].map((c) => (c / 255) * 2 - 1);
      expect(Math.hypot(...v)).toBeGreaterThan(0.97);
      expect(Math.hypot(...v)).toBeLessThan(1.03);
    }
    // The left edge sees the right edge as its neighbour: a ramp that wraps at the seam isn't treated as a cliff-free flat.
    const ramp = normalFromHeight(grey(w, w, (x) => x * 15), w, w, 1);
    expect(px(ramp, w, 0, 0)[0]).not.toBe(px(ramp, w, 8, 0)[0]);
  });
});
