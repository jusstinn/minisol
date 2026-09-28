import { describe, expect, it } from "vitest";
import {
  calibrate,
  defaultCalibration,
  guessScale,
  imageToPlan,
  metresPerPixel,
  parseMetres,
  planFootprint,
  planToImage,
  rotatePlan,
  sanitizeCalibration,
  scaleOf,
  svgTransform,
} from "../calibration";
import type { PlanCalibration } from "../calibration";

const img = { w: 1000, h: 800 };
const base: PlanCalibration = { mpp: 0.01, guess: 0.02, cx: 2, cz: 1, rot: 0, opacity: 0.6, hidden: false, in3d: true };

/** Apply an SVG transform string (translate / rotate / scale only) to a point. */
function applySvg(t: string, [x, y]: [number, number]): [number, number] {
  const ops = [...t.matchAll(/(translate|rotate|scale)\(([^)]+)\)/g)].map((m) => ({ op: m[1], a: m[2].split(/[\s,]+/).map(Number) }));
  for (const { op, a } of ops.reverse()) {
    if (op === "translate") [x, y] = [x + a[0], y + (a[1] ?? 0)];
    if (op === "scale") [x, y] = [x * a[0], y * (a[1] ?? a[0])];
    if (op === "rotate") {
      const r = (a[0] * Math.PI) / 180;
      [x, y] = [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
    }
  }
  return [x, y];
}

describe("plan calibration", () => {
  it("computes metres per pixel from two points and a distance", () => {
    expect(metresPerPixel([100, 100], [420, 100], 3.2)).toBeCloseTo(0.01);
    expect(metresPerPixel([0, 0], [300, 400], 5)).toBeCloseTo(0.01); // diagonal: 500 px
    expect(metresPerPixel([0, 0], [2, 0], 3)).toBeNull(); // points too close
    expect(metresPerPixel([0, 0], [300, 0], 0)).toBeNull();
    expect(metresPerPixel([0, 0], [300, 0], NaN)).toBeNull();
  });

  it("parses distances the way people type them", () => {
    expect(parseMetres("3,2")).toBe(3.2);
    expect(parseMetres(" 3.2 m ")).toBe(3.2);
    expect(parseMetres("320 cm")).toBeCloseTo(3.2);
    expect(parseMetres("3200mm")).toBeCloseTo(3.2);
    expect(parseMetres(",5")).toBe(0.5);
    expect(parseMetres("abc")).toBeNull();
    expect(parseMetres("0")).toBeNull();
    expect(parseMetres("-3")).toBeNull();
    expect(parseMetres("9000")).toBeNull();
  });

  it("maps image pixels to plan metres and back, at every quarter turn", () => {
    expect(imageToPlan([500, 400], img, base)).toEqual([2, 1]); // the centre sits on (cx, cz)
    expect(imageToPlan([1000, 400], img, base)).toEqual([7, 1]); // right edge: +5 m
    // A quarter turn clockwise: the image's right edge now points south (+z).
    const r1 = imageToPlan([1000, 400], img, { ...base, rot: 1 });
    expect(r1[0]).toBeCloseTo(2);
    expect(r1[1]).toBeCloseTo(6);
    for (const rot of [0, 1, 2, 3] as const) {
      const cal = { ...base, rot };
      const p = imageToPlan([123, 456], img, cal);
      const back = planToImage(p, img, cal);
      expect(back[0]).toBeCloseTo(123);
      expect(back[1]).toBeCloseTo(456);
    }
  });

  it("draws the image in the plan editor where imageToPlan says", () => {
    const f = { sc: 40, ox: 180, oz: 120 };
    for (const rot of [0, 1, 2, 3] as const) {
      const cal = { ...base, rot };
      const t = svgTransform(img, cal, f);
      for (const px of [[0, 0], [1000, 0], [250, 700]] as [number, number][]) {
        const [sx, sy] = applySvg(t, px);
        const [x, z] = imageToPlan(px, img, cal);
        expect(sx).toBeCloseTo(f.ox + x * f.sc);
        expect(sy).toBeCloseTo(f.oz + z * f.sc);
      }
    }
  });

  it("keeps the measured segment in place when the scale changes", () => {
    const cal = defaultCalibration(img, [0, 0], 4);
    expect(cal.mpp).toBeNull();
    expect(scaleOf(cal)).toBeCloseTo(guessScale(img, 4));
    const a: [number, number] = [200, 300];
    const b: [number, number] = [520, 300];
    const before = imageToPlan([360, 300], img, cal);
    const next = calibrate(cal, img, a, b, 3.2)!;
    expect(next.mpp).toBeCloseTo(0.01);
    expect(next.ref).toEqual({ a, b, m: 3.2 });
    expect(next.in3d).toBe(true); // first calibration shows it in 3D
    const after = imageToPlan([360, 300], img, next);
    expect(after[0]).toBeCloseTo(before[0], 2);
    expect(after[1]).toBeCloseTo(before[1], 2);
    // The two points are now exactly 3.2 m apart on the plan.
    const pa = imageToPlan(a, img, next);
    const pb = imageToPlan(b, img, next);
    expect(Math.hypot(pb[0] - pa[0], pb[1] - pa[1])).toBeCloseTo(3.2);
    expect(calibrate(cal, img, a, a, 3)).toBeNull();
  });

  it("reports the footprint on the ground", () => {
    expect(planFootprint(img, base)).toEqual({ w: 10, d: 8 });
    expect(planFootprint(img, rotatePlan(base))).toEqual({ w: 8, d: 10 });
    expect(rotatePlan(rotatePlan(rotatePlan(rotatePlan(base)))).rot).toBe(0);
  });

  it("doesn't trust stored calibrations blindly", () => {
    const fb = defaultCalibration(img, [1, 2], 5);
    expect(sanitizeCalibration("x", fb)).toBe(fb);
    const s = sanitizeCalibration({ mpp: -1, guess: 0.01, cx: 1e9, cz: 3, rot: 5, opacity: 5, hidden: true, in3d: 1, ref: { a: [1, 2], b: [3, "x"], m: 2 } }, fb);
    expect(s).toEqual({ mpp: null, guess: 0.01, cx: 500, cz: 3, rot: 0, opacity: 1, hidden: true, in3d: false });
    expect(sanitizeCalibration({ ...base, ref: { a: [1, 2], b: [3, 4], m: 2 } }, fb).ref).toEqual({ a: [1, 2], b: [3, 4], m: 2 });
  });
});
