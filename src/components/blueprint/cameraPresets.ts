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
 * An opt-in, direct framing for a panel whose own aspect ratio doesn't suit the plain
 * bounding-sphere fit above. That fit sizes the camera so the *tighter* of width/height touches
 * the frame at 100% — for a panel whose own aspect is very different from the build's, that can
 * mean the build's own silhouette (not the sphere that circumscribes it) ends up far from the
 * 65–75%-of-width a showpiece wants, in either direction. This instead solves directly for "the
 * build's own footprint, at this azimuth, spans exactly `fillWidth` of the horizontal field of
 * view" — correct regardless of the panel's aspect. Nobody passing this gets today's
 * `fitDistance` exactly.
 */
export interface FrameFit {
  /** Fraction of the horizontal field of view the build's own (padded) footprint should span. */
  fillWidth: number;
  /** Extra half-footprint padding (metres) folded into the fit so dimension-line labels (which
   *  sit just outside the build's own extent) stay comfortably inside the frame. */
  margin?: number;
  /** How far *above* the build's own look-at point the camera's target sits, as a fraction of
   *  the fit distance — pushes the build down in frame ("centred slightly below middle"). */
  verticalBias?: number;
}

/** The apparent horizontal half-extent of an axis-aligned footprint as seen from azimuth
 *  `theta` (the same convention as the module's own `theta`): each half-extent's own
 *  contribution to the screen-x axis, summed — the standard projected-width of a box's
 *  silhouette, good enough at the distances a fitted camera stands. */
function apparentHalfWidth(extent: Vec3, margin: number, theta: number): number {
  const hx = extent[0] / 2 + margin;
  const hz = extent[2] / 2 + margin;
  return hx * Math.abs(Math.cos(theta)) + hz * Math.abs(Math.sin(theta));
}

function fitDistanceFor(extent: Vec3, aspect: number, theta: number, fit?: FrameFit, fovDeg = DEFAULT_FOV): number {
  if (!fit) return fitDistance(extent, aspect, fovDeg);
  const margin = fit.margin ?? 0;
  const vfov = (fovDeg * Math.PI) / 180;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * Math.max(aspect, 1e-3));
  const fill = Math.min(0.95, Math.max(0.1, fit.fillWidth));
  const hw = apparentHalfWidth(extent, margin, theta);
  const byWidth = hw / Math.tan(Math.min(Math.PI / 2 - 1e-3, (fill * hfov) / 2));
  // Safety ceiling: never so close the build's own height would spill out of frame.
  const H = extent[1];
  const byHeight = (H / 2 + margin * 0.4) / Math.tan(Math.min(Math.PI / 2 - 1e-3, (0.92 * vfov) / 2));
  return Math.max(byWidth, byHeight);
}

/**
 * A restricted azimuth sweep for `tourFrame` (below), instead of a full revolution: a long, thin
 * build (a fence, a path) seen end-on reads as a sliver, and a cut-away room swings round to show
 * the backs of its tall walls partway through a full lap. `tourArcFor` picks a sensible one from
 * the build's own extent/shape; passing `undefined` keeps `tourFrame`'s original full revolution.
 */
export interface TourArc {
  /** Centre azimuth, radians (the same `theta` convention as `cameraFor`'s iso angle). */
  center: number;
  /** Total sweep width, radians — the lap oscillates ± half this around `center`. */
  span: number;
}

const DEG = Math.PI / 180;
/** Footprint length : width beyond this reads as "long and thin" (a fence, a path). */
const ELONGATION_THRESHOLD = 2.2;

const angleDist = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/**
 * `extent`'s own footprint/shape decides the arc: a cut-away room (`interior`) stays on its
 * open side; a long, thin build stays obliquely off its own long axis (never edge-on, never
 * dead-on broadside); anything else gets a gentler sweep than a full lap so its own silhouette
 * — which for a rectangle still varies with angle — never swings far from the fitted framing.
 */
export function tourArcFor(extent: Vec3, interior?: boolean): TourArc {
  if (interior) return { center: ISO_ANGLES.theta, span: 80 * DEG };
  const [L, , W] = extent;
  const longX = L >= W;
  const ratio = longX ? L / Math.max(W, 1e-6) : W / Math.max(L, 1e-6);
  if (ratio < ELONGATION_THRESHOLD) return { center: ISO_ANGLES.theta, span: 70 * DEG };
  const edgeOn = longX ? Math.PI / 2 : 0;
  // Whichever oblique side (±45° off the long axis) lands closer to the default iso angle keeps
  // the sweep's centre close to the view a non-elongated build would get.
  const a = edgeOn + Math.PI / 4;
  const b = edgeOn - Math.PI / 4;
  const center = angleDist(a, ISO_ANGLES.theta) <= angleDist(b, ISO_ANGLES.theta) ? a : b;
  return { center, span: 30 * DEG }; // ±15° around the 45°-oblique centre: never edge-on, never broadside
}

/**
 * Where the camera sits and what it looks at for one preset, given the build's bounds and the
 * canvas aspect ratio. `iso`/`top`/`front`/`side` all fit the whole build into frame; `eye`
 * instead stands a fixed, human distance just outside it. `tour`'s resting frame is `iso` — its
 * flight path is `tourFrame` below. `fit` is an opt-in direct framing (see `FrameFit`); `arc` (see
 * `TourArc`) re-centres `iso`/`tour`'s azimuth on the arc instead of the fixed default — so a
 * restricted tour's phase-0/1 frame and its build's resting ("snap") frame always agree. Neither
 * is used by any existing caller, so nobody passing them gets exactly today's behaviour.
 */
export function cameraFor(preset: CameraPreset, bounds: CameraBounds, aspect: number, fit?: FrameFit, arc?: TourArc): CameraFrame {
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
      const theta = arc?.center ?? ISO_ANGLES.theta;
      const r = fitDistanceFor(bounds.extent, aspect, theta, fit);
      const biasedTarget: Vec3 = fit ? [0, H * 0.25 + (fit.verticalBias ?? 0) * r, 0] : target;
      return { position: add(fromSpherical(theta, ISO_ANGLES.phi, r), biasedTarget), target: biasedTarget, fov: DEFAULT_FOV };
    }
  }
}

/**
 * `tour`'s flight path: a revolution around the build with a gentle dolly (the distance
 * breathing in and out), starting and ending EXACTLY on its own resting frame (`phase` 0 and 1)
 * so it can hand back to a static view without a jump. `phase` is 0–1 for one lap. With no `arc`
 * it's a full revolution (unchanged); with one (see `tourArcFor`) it oscillates back and forth
 * across that arc instead, re-centred on it (not the fixed default iso angle) — and breathes more
 * gently, since a restricted sweep is meant to hold a settled framing, not go sightseeing.
 */
export function tourFrame(bounds: CameraBounds, aspect: number, phase: number, arc?: TourArc, fit?: FrameFit): CameraFrame {
  const rest = cameraFor("iso", bounds, aspect, fit, arc);
  const center = arc?.center ?? ISO_ANGLES.theta;
  const r = fitDistanceFor(bounds.extent, aspect, center, fit);
  const p = ((phase % 1) + 1) % 1;
  const lap = p * Math.PI * 2;
  const theta = arc ? center + Math.sin(lap) * (arc.span / 2) : center + lap;
  const phiAmp = arc ? 0.06 : 0.12;
  const dollyAmp = arc ? 0.06 : 0.1;
  const phi = ISO_ANGLES.phi + Math.sin(lap) * phiAmp;
  const dolly = r * (1 + Math.sin(lap) * dollyAmp);
  return { position: add(fromSpherical(theta, phi, dolly), rest.target), target: rest.target, fov: DEFAULT_FOV };
}
