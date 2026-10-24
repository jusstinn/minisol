/**
 * Pure solar-position astronomy — the NOAA Solar Calculator's simplified algorithm (Spencer's
 * Fourier approximations for the equation of time and declination, feeding the standard zenith
 * and azimuth formulas). No renderer, no clock assumptions beyond the `Date`'s own UTC instant:
 * callers that think in "2pm in Bucharest" convert that themselves with `zonedTimeToUtc` below.
 *
 * Plan convention reminder (see domain/layout.ts): x grows east, z grows south. Azimuth here is
 * the usual surveying convention — degrees clockwise from true north (0 = N, 90 = E, 180 = S,
 * 270 = W) — `@/components/blueprint/sunLighting` turns that into the plan's own axes.
 */

export interface SunPosition {
  /** Degrees above the horizon (negative once the sun has set). */
  altitudeDeg: number;
  /** Degrees clockwise from true north. */
  azimuthDeg: number;
}

export interface SunTimes {
  sunrise: Date | null;
  sunset: Date | null;
  solarNoon: Date;
  /** The sun never sets this day (polar summer). */
  polarDay: boolean;
  /** The sun never rises this day (polar winter). */
  polarNight: boolean;
}

export interface Location {
  lat: number;
  lon: number;
  tz: string;
  label: string;
}

/** The sketch's default location until a project supplies its own (see BlueprintPanel's `location` prop). */
export const DEFAULT_LOCATION: Location = { lat: 44.43, lon: 26.1, tz: "Europe/Bucharest", label: "București" };

const DEG = Math.PI / 180;
const toDeg = (rad: number) => rad / DEG;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const mod = (v: number, n: number) => ((v % n) + n) % n;
const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

function dayOfYearUTC(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.floor((date.getTime() - start) / 86400000) + 1;
}

/** Spencer's fractional-year angle (radians) — the shared input to the equation of time and declination below. */
function fractionalYear(year: number, dayOfYear: number, utcHour: number): number {
  const daysInYear = isLeapYear(year) ? 366 : 365;
  return ((2 * Math.PI) / daysInYear) * (dayOfYear - 1 + (utcHour - 12) / 24);
}

/** Equation of time, minutes (apparent solar time minus mean solar time). */
function equationOfTimeMin(gamma: number): number {
  return 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
}

/** Solar declination, radians. */
function declinationRad(gamma: number): number {
  return (
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma)
  );
}

/** Where the sun is in the sky at this instant, for this latitude/longitude (degrees, WGS84-ish precision). */
export function solarPosition(date: Date, latDeg: number, lonDeg: number): SunPosition {
  const year = date.getUTCFullYear();
  const doy = dayOfYearUTC(date);
  const utcHour = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const gamma = fractionalYear(year, doy, utcHour);
  const eqtime = equationOfTimeMin(gamma);
  const decl = declinationRad(gamma);
  const latRad = latDeg * DEG;

  const trueSolarTime = mod(utcHour * 60 + eqtime + 4 * lonDeg, 1440);
  const hourAngleDeg = trueSolarTime / 4 - 180;
  const haRad = hourAngleDeg * DEG;

  const cosZenith = clamp(Math.sin(latRad) * Math.sin(decl) + Math.cos(latRad) * Math.cos(decl) * Math.cos(haRad), -1, 1);
  const zenithRad = Math.acos(cosZenith);
  const altitudeDeg = 90 - toDeg(zenithRad);

  const sinZenith = Math.sin(zenithRad);
  let azimuthDeg: number;
  if (Math.abs(sinZenith) < 1e-6) {
    // Directly overhead or underfoot: azimuth is undefined — due south is as good a convention as any.
    azimuthDeg = 180;
  } else {
    const cosAz = clamp((Math.sin(latRad) * Math.cos(zenithRad) - Math.sin(decl)) / (Math.cos(latRad) * sinZenith), -1, 1);
    const acosAzDeg = toDeg(Math.acos(cosAz));
    azimuthDeg = hourAngleDeg > 0 ? mod(acosAzDeg + 180, 360) : mod(540 - acosAzDeg, 360);
  }
  return { altitudeDeg, azimuthDeg };
}

/** Sunrise, solar noon and sunset for this calendar day (the `Date`'s UTC fields) at this location. */
export function sunTimes(date: Date, latDeg: number, lonDeg: number): SunTimes {
  const year = date.getUTCFullYear();
  const doy = dayOfYearUTC(date);
  const gamma = fractionalYear(year, doy, 12); // the day's declination/equation of time, evaluated at noon
  const eqtime = equationOfTimeMin(gamma);
  const decl = declinationRad(gamma);
  const latRad = latDeg * DEG;

  const dayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const solarNoonUTCmin = 720 - 4 * lonDeg - eqtime;
  const solarNoon = new Date(dayStart + solarNoonUTCmin * 60000);

  // Standard sunrise/sunset altitude: -50′ (atmospheric refraction plus the sun's own half-degree disc).
  const cosHourAngle0 = (Math.sin(-0.8333 * DEG) - Math.sin(latRad) * Math.sin(decl)) / (Math.cos(latRad) * Math.cos(decl));
  if (cosHourAngle0 > 1) return { sunrise: null, sunset: null, solarNoon, polarDay: false, polarNight: true };
  if (cosHourAngle0 < -1) return { sunrise: null, sunset: null, solarNoon, polarDay: true, polarNight: false };

  const hourAngle0Deg = toDeg(Math.acos(cosHourAngle0));
  const sunrise = new Date(dayStart + (solarNoonUTCmin - hourAngle0Deg * 4) * 60000);
  const sunset = new Date(dayStart + (solarNoonUTCmin + hourAngle0Deg * 4) * 60000);
  return { sunrise, sunset, solarNoon, polarDay: false, polarNight: false };
}

/** The UTC offset (minutes) `timeZone` keeps at this instant (handles DST transitions). */
function tzOffsetMinutes(utcDate: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(utcDate);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return (asUTC - utcDate.getTime()) / 60000;
}

/** A wall-clock date/time in `timeZone` (e.g. "14:30 in Europe/Bucharest") → the UTC instant it names. */
export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  // Two passes converge even right around a DST transition.
  for (let i = 0; i < 2; i++) {
    const offset = tzOffsetMinutes(guess, timeZone);
    guess = new Date(Date.UTC(year, month - 1, day, hour, minute) - offset * 60000);
  }
  return guess;
}

/** The inverse of `zonedTimeToUtc`: this instant's wall-clock hour (0–24, fractional) in `timeZone`. */
export function localHourOfDay(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get("hour") + get("minute") / 60 + get("second") / 3600;
}

/** Today's calendar date as seen in `timeZone` (so "today" means the project's day, not the visitor's). */
export function todayInZone(timeZone: string, now: Date = new Date()): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 1);
  return { year: get("year"), month: get("month"), day: get("day") };
}
