import { describe, expect, it } from "vitest";
import { DEFAULT_SUN_LIGHT, sunAppearance, sunDirectionVec } from "../sunLighting";

describe("sunDirectionVec", () => {
  it("points straight up when the sun is at the zenith", () => {
    const [x, y, z] = sunDirectionVec(90, 0, 10);
    expect(x).toBeCloseTo(0, 5);
    expect(z).toBeCloseTo(0, 5);
    expect(y).toBeCloseTo(10, 5);
  });

  it("sits due south, at ground level, when the sun is on the horizon due south", () => {
    const [x, y, z] = sunDirectionVec(0, 180, 10);
    expect(x).toBeCloseTo(0, 5);
    expect(y).toBeCloseTo(0, 5);
    expect(z).toBeCloseTo(10, 5); // plan convention: south is +z
  });

  it("sits due east, at ground level, when the sun is on the horizon due east", () => {
    const [x, y, z] = sunDirectionVec(0, 90, 10);
    expect(x).toBeCloseTo(10, 5); // plan convention: east is +x
    expect(y).toBeCloseTo(0, 5);
    expect(z).toBeCloseTo(0, 5);
  });
});

describe("sunAppearance", () => {
  it("matches today's fixed defaults at a high midday sun", () => {
    const a = sunAppearance(55, 180);
    expect(a.intensity).toBeCloseTo(DEFAULT_SUN_LIGHT.intensity, 5);
    expect(a.ambient).toBeCloseTo(DEFAULT_SUN_LIGHT.ambient, 5);
    expect(a.hemiIntensity).toBeCloseTo(DEFAULT_SUN_LIGHT.hemiIntensity, 5);
    expect(a.color).toBe(DEFAULT_SUN_LIGHT.color);
    expect(a.hemiSky).toBe(DEFAULT_SUN_LIGHT.hemiSky);
    expect(a.hemiGround).toBe(DEFAULT_SUN_LIGHT.hemiGround);
    expect(a.isNight).toBe(false);
  });

  it("stays at that same bright look above the keyframe range (never dims past full daylight)", () => {
    const high = sunAppearance(80, 180);
    expect(high.intensity).toBeCloseTo(DEFAULT_SUN_LIGHT.intensity, 5);
  });

  it("dims smoothly and monotonically as the sun sinks from midday to the horizon", () => {
    const steps = [55, 40, 25, 10, 1];
    const intensities = steps.map((alt) => sunAppearance(alt, 180).intensity);
    for (let i = 1; i < intensities.length; i++) expect(intensities[i]).toBeLessThanOrEqual(intensities[i - 1]);
  });

  it("turns warm (reddish) near the horizon, not white like midday", () => {
    const low = sunAppearance(2, 180);
    const [r, g, b] = [low.color.slice(1, 3), low.color.slice(3, 5), low.color.slice(5, 7)].map((h) => parseInt(h, 16));
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });

  it("is night exactly once the sun dips below the horizon, not before", () => {
    expect(sunAppearance(0.01, 0).isNight).toBe(false);
    expect(sunAppearance(0, 0).isNight).toBe(false);
    expect(sunAppearance(-0.01, 0).isNight).toBe(true);
  });

  it("has no light output once well below the horizon (civil twilight is over)", () => {
    const a = sunAppearance(-10, 0);
    expect(a.intensity).toBe(0);
  });

  it("eases the night factor in from 0 at sunset to 1 by 8° under the horizon", () => {
    expect(sunAppearance(0, 0).nightFactor).toBeCloseTo(0, 5);
    expect(sunAppearance(-4, 0).nightFactor).toBeCloseTo(0.5, 5);
    expect(sunAppearance(-8, 0).nightFactor).toBeCloseTo(1, 5);
    expect(sunAppearance(-30, 0).nightFactor).toBe(1);
  });

  it("carries the sun's direction through from sunDirectionVec", () => {
    const a = sunAppearance(30, 90, 20);
    expect(a.direction).toEqual(sunDirectionVec(30, 90, 20));
  });
});
