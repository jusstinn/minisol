import { describe, expect, it } from "vitest";
import type { Vec3 } from "../builders";
import { cameraFor, fitDistance, tourArcFor, tourFrame } from "../cameraPresets";

const deck: Vec3 = [4, 0.3, 3];
const bathroom: Vec3 = [2.5, 2.6, 2];
const fence: Vec3 = [11, 1.8, 2];
const fenceAlongZ: Vec3 = [2, 1.8, 11];

function dist(a: Vec3, b: Vec3) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** The build's own apparent width-fill (fraction of the horizontal fov its footprint spans) for
 *  a resulting camera frame — the same box-projection the module itself fits to, used here only
 *  to check the result, independently of the implementation. */
function widthFill(extent: Vec3, aspect: number, position: Vec3, target: Vec3, fovDeg = 32) {
  const theta = Math.atan2(position[0] - target[0], position[2] - target[2]);
  const r = dist(position, target);
  const hx = extent[0] / 2;
  const hz = extent[2] / 2;
  const hw = hx * Math.abs(Math.cos(theta)) + hz * Math.abs(Math.sin(theta));
  const angle = 2 * Math.atan(hw / r);
  const vfov = (fovDeg * Math.PI) / 180;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
  return angle / hfov;
}

describe("cameraFor with a FrameFit", () => {
  it("fits the build's own footprint to (about) the requested width fraction, on a tall panel", () => {
    const aspect = 0.55; // tall, narrow — the hero's own kind of panel
    const fit = cameraFor("iso", { extent: deck }, aspect, { fillWidth: 0.7, margin: 0.5 });
    const fill = widthFill(deck, aspect, fit.position, fit.target);
    // The margin folded into the fit (for dimension labels) means the *build itself* reads a
    // touch under the nominal fraction — comfortably inside it, never over.
    expect(fill).toBeGreaterThan(0.5);
    expect(fill).toBeLessThan(0.76);
  });

  it("...and on a wide panel too — the point is it no longer depends on the panel's own aspect", () => {
    const aspect = 2.2; // wide, short
    const fit = cameraFor("iso", { extent: deck }, aspect, { fillWidth: 0.7, margin: 0.5 });
    const fill = widthFill(deck, aspect, fit.position, fit.target);
    expect(fill).toBeGreaterThan(0.5);
    expect(fill).toBeLessThan(0.76);
  });

  it("pushes the look-at target up (so the build renders lower in frame) with a vertical bias", () => {
    const noBias = cameraFor("iso", { extent: deck }, 0.7, { fillWidth: 0.7 });
    const biased = cameraFor("iso", { extent: deck }, 0.7, { fillWidth: 0.7, verticalBias: 0.15 });
    expect(biased.target[1]).toBeGreaterThan(noBias.target[1]);
  });

  it("never fits so tight that the build's own height would spill out of frame on a very wide panel", () => {
    // A very wide, short panel: fitting *width* at 70% alone would stand far too close, clipping
    // the bathroom's own 2.6 m height — the safety ceiling must win here instead.
    const fit = cameraFor("iso", { extent: bathroom }, 4, { fillWidth: 0.7 });
    const r = dist(fit.position, fit.target);
    const halfVfov = ((32 * Math.PI) / 180) / 2;
    const visibleHalfHeight = r * Math.tan(halfVfov);
    expect(visibleHalfHeight).toBeGreaterThan(bathroom[1] / 2);
  });

  it("with no fit, matches the plain fitDistance exactly (existing callers are untouched)", () => {
    const plain = cameraFor("iso", { extent: deck }, 1.4);
    const r = fitDistance(deck, 1.4);
    expect(dist(plain.position, plain.target)).toBeCloseTo(r, 6);
  });
});

describe("tourArcFor", () => {
  it("keeps a cut-away room on its own open side, well short of a full revolution", () => {
    const arc = tourArcFor(bathroom, true);
    expect(arc.span).toBeLessThan(Math.PI / 2 + 0.01);
    expect(arc.span).toBeGreaterThan(0);
  });

  it("gives a compact, roughly square build (a deck) a gentle sweep, not a full lap", () => {
    const arc = tourArcFor(deck);
    expect(arc.span).toBeLessThan(Math.PI);
  });

  it("gives a long, thin build (a fence) a narrow oblique band, never edge-on or broadside", () => {
    const arc = tourArcFor(fence);
    const edgeOn = Math.PI / 2; // fence[0] (11) > fence[2] (2): long axis is x
    const broadside = 0;
    for (const phase of [0, 0.25, 0.5, 0.75, 1]) {
      const theta = arc.center + Math.sin(phase * Math.PI * 2) * (arc.span / 2);
      const toEdge = Math.abs(Math.atan2(Math.sin(theta - edgeOn), Math.cos(theta - edgeOn)));
      const toBroadside = Math.abs(Math.atan2(Math.sin(theta - broadside), Math.cos(theta - broadside)));
      expect(toEdge).toBeGreaterThan((20 * Math.PI) / 180);
      expect(toBroadside).toBeGreaterThan((20 * Math.PI) / 180);
    }
  });

  it("avoids each build's own edge-on angle, whichever world axis is the long one", () => {
    const xArc = tourArcFor(fence); // long axis x: edge-on at 90°
    const zArc = tourArcFor(fenceAlongZ); // long axis z: edge-on at 0°
    const edgeOnX = Math.PI / 2;
    const edgeOnZ = 0;
    expect(Math.abs(Math.atan2(Math.sin(xArc.center - edgeOnX), Math.cos(xArc.center - edgeOnX)))).toBeGreaterThan((20 * Math.PI) / 180);
    expect(Math.abs(Math.atan2(Math.sin(zArc.center - edgeOnZ), Math.cos(zArc.center - edgeOnZ)))).toBeGreaterThan((20 * Math.PI) / 180);
  });

  it("a non-elongated footprint doesn't trigger the oblique-band treatment (a visibly wider sweep)", () => {
    const square: Vec3 = [4, 1, 4];
    const arc = tourArcFor(square);
    expect(arc.span).toBeGreaterThan((45 * Math.PI) / 180);
  });
});

describe("tourFrame with an arc", () => {
  it("starts and ends exactly on its own resting frame (re-centred on the arc, not the fixed default)", () => {
    const arc = tourArcFor(fence);
    const start = tourFrame({ extent: fence }, 1.4, 0, arc);
    const end = tourFrame({ extent: fence }, 1.4, 1, arc);
    const rest = cameraFor("iso", { extent: fence }, 1.4, undefined, arc);
    for (const f of [start, end]) {
      expect(f.position[0]).toBeCloseTo(rest.position[0], 4);
      expect(f.position[1]).toBeCloseTo(rest.position[1], 4);
      expect(f.position[2]).toBeCloseTo(rest.position[2], 4);
    }
  });

  it("stays within the arc's own band throughout the lap — never swings past its edges", () => {
    const arc = { center: Math.PI / 4, span: (30 * Math.PI) / 180 };
    for (const phase of [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1]) {
      const f = tourFrame({ extent: fence }, 1.4, phase, arc);
      // Recover theta from the position (same spherical convention as the module).
      const theta = Math.atan2(f.position[0], f.position[2]);
      const d = Math.abs(Math.atan2(Math.sin(theta - arc.center), Math.cos(theta - arc.center)));
      expect(d).toBeLessThanOrEqual(arc.span / 2 + 1e-6);
    }
  });

  it("breathes more gently (smaller dolly swing) with a restricted arc than a full lap", () => {
    const arc = { center: Math.PI / 4, span: (70 * Math.PI) / 180 };
    const rest = cameraFor("iso", { extent: deck }, 1.4, undefined, arc);
    const r0 = dist(rest.position, rest.target);
    const withArc = tourFrame({ extent: deck }, 1.4, 0.25, arc);
    const full = tourFrame({ extent: deck }, 1.4, 0.25);
    const rArc = dist(withArc.position, withArc.target);
    const rFull = dist(full.position, full.target);
    expect(Math.abs(rArc - r0)).toBeLessThan(Math.abs(rFull - r0) + 1e-6);
  });
});
