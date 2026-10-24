import { describe, expect, it } from "vitest";
import { computeCaptureSize } from "../capture";

describe("computeCaptureSize", () => {
  it("doubles the current pixel resolution", () => {
    const { width, height } = computeCaptureSize(400, 225, 2);
    expect(width).toBe(400 * 2 * 2);
    expect(height).toBe(Math.round(width * (225 / 400)));
  });

  it("caps the width at the given maximum", () => {
    const { width } = computeCaptureSize(2000, 1000, 2, 3000);
    expect(width).toBe(3000);
  });

  it("keeps the on-screen aspect ratio", () => {
    const { width, height } = computeCaptureSize(1024, 576, 1.5);
    expect(width / height).toBeCloseTo(1024 / 576, 2);
  });

  it("never returns a zero or negative size for a degenerate input", () => {
    const { width, height } = computeCaptureSize(0, 0, 0);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
  });
});
