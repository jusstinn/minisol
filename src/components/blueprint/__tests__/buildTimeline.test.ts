import { describe, expect, it } from "vitest";
import { dayHourAt, hoursAtProgress, layerToProgress, progressToLayer, sweepProgress } from "../buildTimeline";

describe("progressToLayer", () => {
  it("starts on the first layer and ends on the last one", () => {
    expect(progressToLayer(0, 4)).toEqual({ layerIndex: 0, withinLayer: 0 });
    expect(progressToLayer(1, 4)).toEqual({ layerIndex: 3, withinLayer: 1 });
  });

  it("splits the timeline into even slices, one per layer", () => {
    expect(progressToLayer(0.26, 4).layerIndex).toBe(1);
    expect(progressToLayer(0.24, 4).layerIndex).toBe(0);
    expect(progressToLayer(0.76, 4).layerIndex).toBe(3);
  });

  it("clamps out-of-range progress instead of throwing", () => {
    expect(progressToLayer(-0.5, 4).layerIndex).toBe(0);
    expect(progressToLayer(1.5, 4).layerIndex).toBe(3);
  });

  it("never divides by zero for a build with no layers", () => {
    expect(progressToLayer(0.5, 0)).toEqual({ layerIndex: 0, withinLayer: 0 });
  });
});

describe("layerToProgress", () => {
  it("is monotonically increasing with the layer index", () => {
    const ps = [0, 1, 2, 3].map((i) => layerToProgress(i, 4));
    for (let i = 1; i < ps.length; i++) expect(ps[i]).toBeGreaterThan(ps[i - 1]);
  });

  it("round-trips back to the same layer through progressToLayer", () => {
    for (let i = 0; i < 5; i++) expect(progressToLayer(layerToProgress(i, 5), 5).layerIndex).toBe(i);
  });
});

describe("hoursAtProgress", () => {
  it("is the share of a typical duration done so far (nothing at the start)", () => {
    expect(hoursAtProgress(0, 10, 16)).toBe(0);
    expect(hoursAtProgress(1, 10, 16)).toBe(13);
    expect(hoursAtProgress(0.5, 10, 16)).toBe(6.5);
    expect(hoursAtProgress(2, 10, 16)).toBe(13);
  });
});

describe("dayHourAt", () => {
  it("keeps a short build on day 1", () => {
    expect(dayHourAt(3, 8)).toEqual({ day: 1, hour: 3 });
  });

  it("rolls over to day 2 once the first workday is spent", () => {
    const { day, hour } = dayHourAt(10, 8);
    expect(day).toBe(2);
    expect(hour).toBe(2);
  });
});

describe("sweepProgress", () => {
  it("clamps to 0..1 and reaches 1 at the duration", () => {
    expect(sweepProgress(0, 8000)).toBe(0);
    expect(sweepProgress(4000, 8000)).toBe(0.5);
    expect(sweepProgress(8000, 8000)).toBe(1);
    expect(sweepProgress(9000, 8000)).toBe(1);
    expect(sweepProgress(-100, 8000)).toBe(0);
  });

  it("treats a zero-length sweep as already finished", () => {
    expect(sweepProgress(0, 0)).toBe(1);
  });
});
