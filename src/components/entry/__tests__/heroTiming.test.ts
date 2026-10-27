import { describe, expect, it } from "vitest";
import { heroCycle } from "../heroTiming";

describe("heroCycle", () => {
  it("materialises well after the cycle starts but well before it crossfades away", () => {
    const c = heroCycle(5, false);
    expect(c.materializeAtMs).toBeGreaterThan(0);
    expect(c.materializeAtMs).toBeLessThan(c.crossfadeAtMs);
  });

  it("the crossfade finishes exactly at the end of the cycle", () => {
    const c = heroCycle(5, false);
    expect(c.crossfadeAtMs + c.crossfadeDurationMs).toBeCloseTo(c.totalMs, 6);
  });

  it("gives a longer build a longer cycle, so it's never cut off mid-assembly", () => {
    const short = heroCycle(4, false);
    const long = heroCycle(5.5, false);
    expect(long.totalMs).toBeGreaterThan(short.totalMs);
  });

  it("never lets a very quick build collapse the cycle below a sensible floor", () => {
    const c = heroCycle(0.1, false);
    expect(c.totalMs).toBeGreaterThanOrEqual(6200);
  });

  it("holds, fully settled, for a while before the handoff even starts", () => {
    const c = heroCycle(5, false);
    const buildMs = 5000;
    expect(c.crossfadeAtMs).toBeGreaterThan(buildMs + c.materializeAtMs);
  });

  it("reduced motion: no blueprint phase, no camera flight — just a calm, shorter static hold", () => {
    const normal = heroCycle(5, false);
    const reduced = heroCycle(5, true);
    expect(reduced.materializeAtMs).toBe(0);
    expect(reduced.totalMs).toBeLessThan(normal.totalMs);
    expect(reduced.totalMs).toBeGreaterThan(reduced.crossfadeDurationMs);
  });

  it("reduced motion ignores the build's own duration (always the same calm cadence)", () => {
    const a = heroCycle(2, true);
    const b = heroCycle(8, true);
    expect(a.totalMs).toBe(b.totalMs);
  });
});
