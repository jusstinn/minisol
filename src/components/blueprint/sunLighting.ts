import type { Vec3 } from "./builders";

/**
 * Bridges solar altitude/azimuth (see `@/domain/sun`) to what the sketch's `Lighting` rig and
 * canvas backdrop need — a pure, deterministic mapping, unit-tested without a renderer. Altitude
 * drives a handful of keyframes (deep night → golden hour → full daylight); azimuth only steers
 * the light's direction, not its look.
 */

export interface SunLight {
  /** Where the directional light sits, in the plan's own axes (x east, z south, y up) — already
   *  scaled to a sensible distance, not a unit vector. */
  direction: Vec3;
  color: string;
  intensity: number;
  ambient: number;
  hemiIntensity: number;
  hemiSky: string;
  hemiGround: string;
  /** Canvas backdrop tint behind the model (CSS colour; "" when the look shouldn't be tinted). */
  bg: string;
  /** The sun is below the horizon: the sketch's garden/wall/ceiling lamps should be lit. */
  isNight: boolean;
  /** 0 (just set) → 1 (fully dark, ~8° under the horizon): eases the lamps in rather than snapping them on. */
  nightFactor: number;
}

/** Today's look: the sketch's original fixed afternoon sun — used whenever the sun simulation is off. */
export const DEFAULT_SUN_LIGHT: SunLight = {
  direction: [6, 10, 4],
  color: "#ffffff",
  intensity: 1.6,
  ambient: 0.75,
  hemiIntensity: 0.5,
  hemiSky: "#fff6e8",
  hemiGround: "#8a7a66",
  bg: "",
  isNight: false,
  nightFactor: 0,
};

/** PLAN/EXPLODED's own fixed numbers, unaffected by the sun simulation (their materials are unlit anyway). */
export const FLAT_LIGHT: SunLight = { ...DEFAULT_SUN_LIGHT, intensity: 0.4, ambient: 1, hemiIntensity: 0.2 };

const DEG = Math.PI / 180;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Sun direction in the plan's axes (x east, z south, y up) at this altitude/azimuth, scaled to `distance`. */
export function sunDirectionVec(altitudeDeg: number, azimuthDeg: number, distance = 14): Vec3 {
  const alt = altitudeDeg * DEG;
  const az = azimuthDeg * DEG;
  const horizontal = Math.cos(alt);
  return [distance * horizontal * Math.sin(az), distance * Math.sin(alt), -distance * horizontal * Math.cos(az)];
}

type RGB = [number, number, number];
interface Keyframe {
  alt: number;
  color: RGB;
  intensity: number;
  ambient: number;
  hemiIntensity: number;
  hemiSky: RGB;
  hemiGround: RGB;
  bg: RGB;
}

// Altitude (deg) → look, from deep night up through a bright midday sun. The 55° stop matches
// `DEFAULT_SUN_LIGHT`'s numbers exactly, so a simulated midday sun hands back today's look.
const KEYFRAMES: Keyframe[] = [
  { alt: -90, color: [10, 14, 30], intensity: 0, ambient: 0.06, hemiIntensity: 0.1, hemiSky: [10, 18, 40], hemiGround: [4, 6, 10], bg: [4, 6, 14] },
  { alt: -6, color: [40, 46, 90], intensity: 0, ambient: 0.12, hemiIntensity: 0.18, hemiSky: [40, 56, 110], hemiGround: [18, 22, 38], bg: [18, 22, 48] },
  { alt: 0, color: [255, 122, 61], intensity: 0.3, ambient: 0.3, hemiIntensity: 0.32, hemiSky: [255, 170, 120], hemiGround: [90, 70, 60], bg: [70, 55, 90] },
  { alt: 10, color: [255, 176, 102], intensity: 1.0, ambient: 0.5, hemiIntensity: 0.4, hemiSky: [255, 214, 163], hemiGround: [120, 100, 80], bg: [200, 175, 150] },
  { alt: 30, color: [255, 241, 222], intensity: 1.45, ambient: 0.68, hemiIntensity: 0.47, hemiSky: [255, 246, 232], hemiGround: [150, 135, 110], bg: [205, 225, 245] },
  { alt: 55, color: [255, 255, 255], intensity: 1.6, ambient: 0.75, hemiIntensity: 0.5, hemiSky: [255, 246, 232], hemiGround: [138, 122, 102], bg: [188, 217, 242] },
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpRGB = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const clampByte = (v: number) => Math.min(255, Math.max(0, Math.round(v)));
const toHex = ([r, g, b]: RGB) => `#${[r, g, b].map((v) => clampByte(v).toString(16).padStart(2, "0")).join("")}`;

function frameAt(altitudeDeg: number): Keyframe {
  const ks = KEYFRAMES;
  if (altitudeDeg <= ks[0].alt) return ks[0];
  if (altitudeDeg >= ks[ks.length - 1].alt) return ks[ks.length - 1];
  for (let i = 0; i < ks.length - 1; i++) {
    const lo = ks[i];
    const hi = ks[i + 1];
    if (altitudeDeg >= lo.alt && altitudeDeg <= hi.alt) {
      const t = (altitudeDeg - lo.alt) / (hi.alt - lo.alt);
      return {
        alt: altitudeDeg,
        color: lerpRGB(lo.color, hi.color, t),
        intensity: lerp(lo.intensity, hi.intensity, t),
        ambient: lerp(lo.ambient, hi.ambient, t),
        hemiIntensity: lerp(lo.hemiIntensity, hi.hemiIntensity, t),
        hemiSky: lerpRGB(lo.hemiSky, hi.hemiSky, t),
        hemiGround: lerpRGB(lo.hemiGround, hi.hemiGround, t),
        bg: lerpRGB(lo.bg, hi.bg, t),
      };
    }
  }
  return ks[ks.length - 1];
}

/** Smooth, deterministic directional/ambient/hemisphere/backdrop look for this sun position. */
export function sunAppearance(altitudeDeg: number, azimuthDeg: number, distance = 14): SunLight {
  const f = frameAt(altitudeDeg);
  return {
    direction: sunDirectionVec(altitudeDeg, azimuthDeg, distance),
    color: toHex(f.color),
    intensity: f.intensity,
    ambient: f.ambient,
    hemiIntensity: f.hemiIntensity,
    hemiSky: toHex(f.hemiSky),
    hemiGround: toHex(f.hemiGround),
    bg: toHex(f.bg),
    isNight: altitudeDeg < 0,
    nightFactor: clamp01(-altitudeDeg / 8),
  };
}
