import { describe, expect, it } from "vitest";
import { DEFAULT_LOCATION, localHourOfDay, solarPosition, sunTimes, todayInZone, zonedTimeToUtc } from "../sun";

const BUCHAREST = DEFAULT_LOCATION;
// A latitude far enough north that the solstices are polar day/night (Svalbard-ish).
const POLAR = { lat: 78, lon: 15.6 };

describe("solarPosition", () => {
  it("peaks at Bucharest's summer-solstice solar noon around 69° altitude", () => {
    const noon = sunTimes(new Date(Date.UTC(2024, 5, 21, 12)), BUCHAREST.lat, BUCHAREST.lon).solarNoon;
    const { altitudeDeg } = solarPosition(noon, BUCHAREST.lat, BUCHAREST.lon);
    expect(altitudeDeg).toBeGreaterThan(68);
    expect(altitudeDeg).toBeLessThan(70);
  });

  it("dips to Bucharest's winter-solstice solar noon around 22° altitude", () => {
    const noon = sunTimes(new Date(Date.UTC(2024, 11, 21, 12)), BUCHAREST.lat, BUCHAREST.lon).solarNoon;
    const { altitudeDeg } = solarPosition(noon, BUCHAREST.lat, BUCHAREST.lon);
    expect(altitudeDeg).toBeGreaterThan(21);
    expect(altitudeDeg).toBeLessThan(23);
  });

  it("puts the sun due south (azimuth ≈ 180°) at solar noon, north of the tropics", () => {
    const noon = sunTimes(new Date(Date.UTC(2024, 2, 21, 12)), BUCHAREST.lat, BUCHAREST.lon).solarNoon;
    const { azimuthDeg } = solarPosition(noon, BUCHAREST.lat, BUCHAREST.lon);
    expect(azimuthDeg).toBeGreaterThan(178);
    expect(azimuthDeg).toBeLessThan(182);
  });

  it("is below the horizon at midnight", () => {
    const { altitudeDeg } = solarPosition(new Date(Date.UTC(2024, 0, 1, 0)), BUCHAREST.lat, BUCHAREST.lon);
    expect(altitudeDeg).toBeLessThan(0);
  });

  it("swings east in the morning and west in the afternoon", () => {
    const morning = solarPosition(new Date(Date.UTC(2024, 5, 21, 5)), BUCHAREST.lat, BUCHAREST.lon);
    const afternoon = solarPosition(new Date(Date.UTC(2024, 5, 21, 15)), BUCHAREST.lat, BUCHAREST.lon);
    expect(morning.azimuthDeg).toBeLessThan(180);
    expect(afternoon.azimuthDeg).toBeGreaterThan(180);
  });
});

describe("sunTimes", () => {
  it("sits sunrise before solar noon before sunset", () => {
    const t = sunTimes(new Date(Date.UTC(2024, 5, 21, 12)), BUCHAREST.lat, BUCHAREST.lon);
    expect(t.sunrise).not.toBeNull();
    expect(t.sunset).not.toBeNull();
    expect(t.sunrise!.getTime()).toBeLessThan(t.solarNoon.getTime());
    expect(t.solarNoon.getTime()).toBeLessThan(t.sunset!.getTime());
  });

  it("gives a longer day in June than in December at the same latitude", () => {
    const june = sunTimes(new Date(Date.UTC(2024, 5, 21, 12)), BUCHAREST.lat, BUCHAREST.lon);
    const december = sunTimes(new Date(Date.UTC(2024, 11, 21, 12)), BUCHAREST.lat, BUCHAREST.lon);
    const length = (t: typeof june) => t.sunset!.getTime() - t.sunrise!.getTime();
    expect(length(june)).toBeGreaterThan(length(december));
  });

  it("never sets at midsummer, this far north (polar day)", () => {
    const t = sunTimes(new Date(Date.UTC(2024, 5, 21, 12)), POLAR.lat, POLAR.lon);
    expect(t.polarDay).toBe(true);
    expect(t.polarNight).toBe(false);
    expect(t.sunrise).toBeNull();
    expect(t.sunset).toBeNull();
  });

  it("never rises at midwinter, this far north (polar night)", () => {
    const t = sunTimes(new Date(Date.UTC(2024, 11, 21, 12)), POLAR.lat, POLAR.lon);
    expect(t.polarNight).toBe(true);
    expect(t.polarDay).toBe(false);
    expect(t.sunrise).toBeNull();
    expect(t.sunset).toBeNull();
  });
});

describe("zonedTimeToUtc / localHourOfDay", () => {
  it("reads Bucharest winter time as UTC+2 (EET, no DST)", () => {
    const d = zonedTimeToUtc(2024, 1, 15, 14, 0, BUCHAREST.tz);
    expect(d.getTime()).toBe(Date.UTC(2024, 0, 15, 12, 0));
  });

  it("reads Bucharest summer time as UTC+3 (EEST, DST)", () => {
    const d = zonedTimeToUtc(2024, 7, 15, 14, 0, BUCHAREST.tz);
    expect(d.getTime()).toBe(Date.UTC(2024, 6, 15, 11, 0));
  });

  it("round-trips through localHourOfDay", () => {
    const d = zonedTimeToUtc(2024, 7, 15, 21, 30, BUCHAREST.tz);
    expect(localHourOfDay(d, BUCHAREST.tz)).toBeCloseTo(21.5, 5);
  });

  it("carries a late-evening local time into the next UTC day", () => {
    const d = zonedTimeToUtc(2024, 1, 1, 23, 30, BUCHAREST.tz); // UTC+2 → 21:30 UTC, same day
    expect(d.getUTCDate()).toBe(1);
    expect(d.getUTCHours()).toBe(21);
  });
});

describe("todayInZone", () => {
  it("rolls over to the next calendar day once local time passes midnight", () => {
    // 23:30 UTC on Jan 1st is already 01:30 on Jan 2nd in Bucharest (UTC+2).
    const now = new Date(Date.UTC(2024, 0, 1, 23, 30));
    expect(todayInZone(BUCHAREST.tz, now)).toEqual({ year: 2024, month: 1, day: 2 });
  });
});
