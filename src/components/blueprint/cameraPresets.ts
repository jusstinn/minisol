import type { Vec3 } from "./builders";

/**
 * Pure camera math for the sketch's framings — no renderer, no React, so it's unit-tested
 * without WebGL (see Scene.tsx's `CameraRig`, which turns these into an animated camera move).
 *
 * The plan's own convention (x → east, z → south, three.js axes, see domain/layout.ts) holds
 * here too: `front` looks north from the south edge (where doors/steps usually face), `side`
 * looks west from the east edge, and `top` keeps north "up" on screen, matching the plan editor.
 */
export type CameraPreset = "iso" | "top" | "front" | "side" | "eye" | "tour";

/** In the UI's and the keyboard shortcuts' (1–6) order. */
export const CAMERA_PRESETS: readonly CameraPreset[] = ["iso", "top", "front", "side", "eye", "tour"];

export interface CameraBounds {
  /** [length(x), height(y), width(z)] of the build, metres — `Build.extent`. */
  extent: Vec3;
}

export interface CameraFrame {
  /** World position in the plan's own centred frame (the drawing is recentred on its plan centre). */
  position: Vec3;
  target: Vec3;
  /** Vertical field of view, degrees. */
  fov: number;
}

const DEFAULT_FOV = 32;
/** Wide enough that standing just outside a small room doesn't feel clipped. */
const EYE_FOV = 60;
const EYE_HEIGHT = 1.6;
/** Personal space kept between the eye-level camera and the project's south (front) edge. */
const EYE_STANDOFF = 1.1;
/** Kept just off true vertical: a hair of polar angle keeps the maths (and OrbitControls) well
 *  defined at the pole, but still reads as "straight down" once rendered. */
const TOP_TILT = 0.03;
/** How long one lap of the cinematic tour takes. */
export const TOUR_LAP_SECONDS = 22;

/** Today's 3/4 view, kept identical to the camera's original hard-coded direction. */
const ISO_DIR: Vec3 = [0.9, 0.75, 1];

function angles(dir: Vec3): { theta: number; phi: number } {
  const len = Math.sqrt(dir[0] ** 2 + dir[1] ** 2 + dir[2] ** 2) || 1;
  const y = dir[1] / len;
  return { phi: Math.acos(Math.min(1, Math.max(-1, y))), theta: Math.atan2(dir[0], dir[2]) };
}
const ISO_ANGLES = angles(ISO_DIR);

/** three.js's spherical → cartesian convention: y up, theta measured from +z around y. */
const fromSpherical = (theta: number, phi: number, r: number): Vec3 => [r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.cos(theta)];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/**
 * How far back a camera with this vertical fov must stand to fit the build's bounding sphere
 * at this aspect ratio — the same bounding-sphere fit the sketch's single view always used.
 */
export function fitDistance(extent: Vec3, aspect: number, fovDeg = DEFAULT_FOV): number {
  const [L, H, W] = extent;
  const radius = 0.5 * Math.sqrt(L * L + H * H + W * W) + 0.4;
  const vfov = (fovDeg * Math.PI) / 180;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * Math.max(aspect, 1e-3));
  return radius / Math.sin(Math.min(vfov, hfov, Math.PI - 1e-3) / 2);
}

/**
 * Where the camera sits and what it looks at for one preset, given the build's bounds and the
 * canvas aspect ratio. `iso`/`top`/`front`/`side` all fit the whole build into frame; `eye`
 * instead stands a fixed, human distance just outside it. `tour`'s resting frame is `iso` — its
 * flight path is `tourFrame` below.
 */
export function cameraFor(preset: CameraPreset, bounds: CameraBounds, aspect: number): CameraFrame {
  const [, H, W] = bounds.extent;
  const target: Vec3 = [0, H * 0.25, 0];
  switch (preset) {
    case "top": {
      const r = fitDistance(bounds.extent, aspect);
      // theta 0, phi ≈ 0: directly overhead, biased a hair south — with OrbitControls' default
      // up (0,1,0) this is exactly the orientation where north lands "up" on screen (see the
      // module docstring), matching the plan editor without ever touching the camera's up vector.
      return { position: fromSpherical(0, TOP_TILT, r), target: [0, 0, 0], fov: DEFAULT_FOV };
    }
    case "front": {
      const r = fitDistance(bounds.extent, aspect);
      return { position: add(fromSpherical(0, Math.PI / 2, r), target), target, fov: DEFAULT_FOV };
    }
    case "side": {
      const r = fitDistance(bounds.extent, aspect);
      return { position: add(fromSpherical(Math.PI / 2, Math.PI / 2, r), target), target, fov: DEFAULT_FOV };
    }
    case "eye": {
      // Standing just south of the build (its open/front side — see roomShell's low south wall),
      // at eye height, looking a little down into it so it reads as "just outside, looking in".
      const standoff = EYE_STANDOFF + Math.max(0, (W - 3) * 0.08);
      const lookY = Math.min(EYE_HEIGHT - 0.1, Math.max(0.3, H * 0.55));
      return { position: [0, EYE_HEIGHT, W / 2 + standoff], target: [0, lookY, 0], fov: EYE_FOV };
    }
    case "tour":
    case "iso":
    default: {
      const r = fitDistance(bounds.extent, aspect);
      return { position: add(fromSpherical(ISO_ANGLES.theta, ISO_ANGLES.phi, r), target), target, fov: DEFAULT_FOV };
    }
  }
}

/**
 * `tour`'s flight path: a full revolution around the build with a gentle dolly (the distance
 * breathing in and out), starting and ending EXACTLY on `iso`'s frame (`phase` 0 and 1) so it
 * can hand back to a static `iso` view without a jump. `phase` is 0–1 for one lap.
 */
export function tourFrame(bounds: CameraBounds, aspect: number, phase: number): CameraFrame {
  const iso = cameraFor("iso", bounds, aspect);
  const r = fitDistance(bounds.extent, aspect);
  const p = ((phase % 1) + 1) % 1;
  const lap = p * Math.PI * 2;
  const theta = ISO_ANGLES.theta + lap;
  const phi = ISO_ANGLES.phi + Math.sin(lap) * 0.12;
  const dolly = r * (1 + Math.sin(lap) * 0.1);
  return { position: add(fromSpherical(theta, phi, dolly), iso.target), target: iso.target, fov: DEFAULT_FOV };
}
