import type { Vec3 } from "./builders";
import { sunAppearance } from "./sunLighting";
import type { SunLight } from "./sunLighting";

/**
 * Pure mapping from the sketch's `SunLight` (the sun simulation's look — see sunLighting.ts) to
 * the physically-flavoured rig the desktop REAL view lights itself with (see Lighting.tsx and
 * SkyEnvironment.tsx): a strong directional sun, an image-based sky for the ambient term, and
 * only a whisper of the old flat ambient/hemisphere fill — which stays the whole story at night
 * (a Preetham sky is black after dusk) and on phones, which never get the sky at all.
 *
 * Kept out of the React components so it is unit-tested without a renderer.
 */

/** A pleasant fixed afternoon: sun from the south-west (az 215°) at 42°. From the iso camera
 *  (south-east) the key light comes from the left-front and the shadows fall to the right, away
 *  from the lens — the usual 3/4 product-photo set-up. Used whenever the simulation is off. */
export const AFTERNOON_ALTITUDE_DEG = 42;
export const AFTERNOON_AZIMUTH_DEG = 215;
export const AFTERNOON_SUN: SunLight = sunAppearance(AFTERNOON_ALTITUDE_DEG, AFTERNOON_AZIMUTH_DEG);
/** A cut-away room's walls are tall on the north and west sides: light it from the open
 *  south-east, higher up, so the inside faces of both tall walls catch the sun (from the
 *  south-west the west wall would throw the whole room into shadow). */
export const INTERIOR_SUN: SunLight = sunAppearance(50, 148);

export interface Daylight {
  /** Sun direction (unit vector towards the sun) in the plan's axes (x east, z south, y up). */
  sunDir: Vec3;
  /** Degrees above the horizon (negative: below). */
  altitudeDeg: number;
  /** 0 at night → 1 in full daylight: how much of the look comes from the sky (vs the flat fill). */
  day: number;
  sunColor: string;
  sunIntensity: number;
  ambient: number;
  hemiIntensity: number;
  hemiSky: string;
  hemiGround: string;
  /** `scene.environmentIntensity` for the sky/window image-based light. */
  envIntensity: number;
  /** Preetham sky parameters (clearer/bluer at noon, hazier and warmer near the horizon). */
  sky: { turbidity: number; rayleigh: number; mieCoefficient: number; mieDirectionalG: number };
  /** Linear-RGB radiance of the ground half of the environment (the lawn bouncing the sun back up). */
  groundBounce: [number, number, number];
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export function altitudeOf(direction: Vec3): number {
  const len = Math.hypot(direction[0], direction[1], direction[2]) || 1;
  return (Math.asin(Math.max(-1, Math.min(1, direction[1] / len))) * 180) / Math.PI;
}

export function normalised(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

/** How the sky-lit rig is derived from a sun look (`null`: the fixed afternoon — or, for a room, the open-side sun). */
export function daylightFor(sun: SunLight | null, interior = false): Daylight {
  const light = sun ?? (interior ? INTERIOR_SUN : AFTERNOON_SUN);
  const alt = altitudeOf(light.direction);
  // Fully "day" by ~14° up: the sky carries the ambient, the old flat fill fades to a whisper.
  const day = smoothstep(-3, 14, alt);
  // The simulation's intensities were tuned for the old flat rig (1.6 at midday); a physically
  // lit scene wants a much stronger key against a dimmer, bluer fill.
  const sunIntensity = light.intensity * 2.1;
  // Near the horizon the air is hazier: more turbid, redder, a wider forward-scattering glow.
  const low = 1 - smoothstep(4, 30, alt);
  return {
    sunDir: normalised(light.direction),
    altitudeDeg: alt,
    day,
    sunColor: light.color,
    sunIntensity,
    ambient: light.ambient * lerp(1, 0.04, day),
    hemiIntensity: light.hemiIntensity * lerp(1, 0.1, day),
    hemiSky: light.hemiSky,
    hemiGround: light.hemiGround,
    envIntensity: day,
    sky: {
      turbidity: lerp(2.6, 8, low),
      rayleigh: lerp(1.15, 2.4, low),
      mieCoefficient: 0.004,
      mieDirectionalG: lerp(0.78, 0.9, low),
    },
    // A sunlit lawn (albedo ~0.2) re-radiates roughly what falls on it, warmer near the horizon.
    groundBounce: [lerp(0.1, 0.18, low) * day, lerp(0.14, 0.14, low) * day, lerp(0.07, 0.07, low) * day],
  };
}

/** A key that changes only when the sky image would visibly change (0.5° steps) — the
 *  environment is re-rendered per key, not per frame, while the sun scrubber plays. */
export function skyKey(d: Daylight, interior: boolean): string {
  const az = (Math.atan2(d.sunDir[0], -d.sunDir[2]) * 180) / Math.PI;
  return `${interior ? "in" : "out"}:${Math.round(d.altitudeDeg * 2) / 2}:${Math.round(az * 2) / 2}`;
}
