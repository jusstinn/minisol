import type { Vec3 } from "./builders";

/**
 * The directional light's shadow camera, fitted to the build's own extent instead of a fixed
 * ±12 m frustum — a 4 × 3 m deck gets a tight ~3 m half-width (sharp shadows at a modest map
 * size) instead of sharing the same 2048² map as a 30 m fence. Shared by Scene.tsx's live view
 * and PhotoRender's high-resolution capture (`capture: true` asks for a bigger map there, since
 * it's a one-off render, not a per-frame cost).
 */
export interface ShadowBounds {
  /** Half-width/-depth of the (square) orthographic shadow frustum, metres. */
  half: number;
  /** Far plane of the shadow camera, metres. */
  far: number;
  /** Shadow map size (square), a power of two. */
  mapSize: number;
}

function nearestPow2(n: number): number {
  return Math.pow(2, Math.round(Math.log2(Math.max(1, n))));
}

export function shadowBoundsFor(extent: Vec3, opts?: { capture?: boolean }): ShadowBounds {
  const [L, H, W] = extent;
  const span = Math.max(L, W, 1);
  // Margin: shadows travel sideways with the light's angle, and tall builds (a fence, a room)
  // throw them further — plus a little slack so the frustum doesn't clip at the very edge.
  const half = span / 2 + Math.max(0.6, H * 0.6) + 0.6;
  const far = Math.max(6, H + span + 4);
  const density = opts?.capture ? 220 : 140; // texels per metre of frustum width
  const raw = half * 2 * density;
  const cap = opts?.capture ? 4096 : 2048;
  const mapSize = Math.max(512, Math.min(cap, nearestPow2(raw)));
  return { half, far, mapSize };
}
