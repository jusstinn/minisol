import { describe, expect, it } from "vitest";
import { AFTERNOON_SUN, altitudeOf, daylightFor, INTERIOR_SUN, normalised, skyKey } from "../daylight";
import { sunAppearance } from "../sunLighting";

describe("altitudeOf", () => {
  it("reads the sun's height above the horizon from its direction vector", () => {
    expect(altitudeOf([0, 10, 0])).toBeCloseTo(90, 5);
    expect(altitudeOf([10, 0, 0])).toBeCloseTo(0, 5);
    expect(altitudeOf([10, 10, 0])).toBeCloseTo(45, 5);
    expect(altitudeOf([0, -3, 3])).toBeLessThan(0);
  });
});

describe("daylightFor", () => {
  it("defaults to a pleasant afternoon sun from the south-west, and a room's from the open south-east", () => {
    const outdoor = daylightFor(null);
    expect(outdoor.altitudeDeg).toBeCloseTo(42, 0);
    // x east, z south: south-west is -x, +z.
    expect(outdoor.sunDir[0]).toBeLessThan(0);
    expect(outdoor.sunDir[2]).toBeGreaterThan(0);
    const room = daylightFor(null, true);
    expect(room.sunDir[0]).toBeGreaterThan(0);
    expect(room.sunDir[2]).toBeGreaterThan(0);
    expect(AFTERNOON_SUN.isNight).toBe(false);
    expect(INTERIOR_SUN.isNight).toBe(false);
  });

  it("returns a unit sun direction", () => {
    const d = daylightFor(sunAppearance(33, 100));
    expect(Math.hypot(...d.sunDir)).toBeCloseTo(1, 6);
    expect(normalised([3, 4, 0])).toEqual([0.6, 0.8, 0]);
  });

  it("has no sky light and the old flat fill at night, a strong sun and whisper of fill by day", () => {
    const night = daylightFor(sunAppearance(-30, 0));
    const noon = daylightFor(sunAppearance(60, 180));
    expect(night.day).toBe(0);
    expect(night.envIntensity).toBe(0);
    expect(night.sunIntensity).toBe(0);
    expect(noon.day).toBe(1);
    expect(noon.envIntensity).toBe(1);
    expect(noon.sunIntensity).toBeGreaterThan(2.5);
    expect(noon.ambient).toBeLessThan(0.1);
    expect(night.ambient).toBeGreaterThan(noon.ambient);
  });

  it("is hazier and redder near the horizon than at noon", () => {
    const low = daylightFor(sunAppearance(5, 250));
    const high = daylightFor(sunAppearance(60, 180));
    expect(low.sky.turbidity).toBeGreaterThan(high.sky.turbidity);
    expect(low.sky.rayleigh).toBeGreaterThan(high.sky.rayleigh);
    expect(low.groundBounce[0]).toBeGreaterThan(0);
  });

  it("fades the sky in smoothly across dawn (monotone with altitude)", () => {
    let prev = -1;
    for (let alt = -10; alt <= 20; alt += 2) {
      const day = daylightFor(sunAppearance(alt, 120)).day;
      expect(day).toBeGreaterThanOrEqual(prev);
      prev = day;
    }
  });
});

describe("skyKey", () => {
  it("stays put for sub-half-degree sun moves, and changes for real ones or a different room type", () => {
    const a = skyKey(daylightFor(sunAppearance(40.1, 200.1)), false);
    const b = skyKey(daylightFor(sunAppearance(40.15, 200.1)), false);
    const c = skyKey(daylightFor(sunAppearance(43, 200)), false);
    expect(b).toBe(a);
    expect(c).not.toBe(a);
    expect(skyKey(daylightFor(sunAppearance(40.1, 200.1)), true)).not.toBe(a);
  });
});
