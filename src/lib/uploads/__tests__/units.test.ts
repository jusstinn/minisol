import { describe, expect, it } from "vitest";
import { defaultPlacement, detectUnit, ground, nudge, placedSize, rotateQuarter, sanitizePlacement, setUnit, UNIT_SCALE, yaw } from "../units";

describe("model units", () => {
  it("guesses the unit from the largest dimension", () => {
    expect(detectUnit([12, 7, 9])).toBe("m");
    expect(detectUnit([20, 3, 3])).toBe("m");
    expect(detectUnit([20.5, 3, 3])).toBe("cm");
    expect(detectUnit([1200, 700, 900])).toBe("mm"); // a 12 m house in mm… 1200 > 200
    expect(detectUnit([180, 250, 90])).toBe("mm");
    expect(detectUnit([150, 90, 60])).toBe("cm"); // a 1.5 m bathroom unit in cm
    expect(detectUnit([NaN, Infinity, 2])).toBe("m");
    expect(UNIT_SCALE.mm * 12000).toBeCloseTo(12);
  });

  it("places, nudges, turns and grounds", () => {
    const p = defaultPlacement([1200, 300, 800], [1.5, -2]);
    expect(p).toMatchObject({ unit: "mm", unitAuto: true, x: 1.5, z: -2, y: 0, rot: 0, opacity: 1, hidden: false });
    const q = nudge(nudge(p, 0.1, 0), 0.1, -1, 0.3);
    expect(q.x).toBe(1.7); // no float drift
    expect(q.z).toBe(-3);
    expect(q.y).toBe(0.3);
    expect(ground(q).y).toBe(0);
    expect(rotateQuarter(rotateQuarter(rotateQuarter(rotateQuarter(p)))).rot).toBe(0);
    expect(rotateQuarter(p, -1).rot).toBe(3);
    expect(setUnit(p, "cm")).toMatchObject({ unit: "cm", unitAuto: false });
    expect(nudge(p, 1e6, 0).x).toBe(500);
  });

  it("reports the placed size in metres (turned models swap width and depth)", () => {
    expect(placedSize([1200, 300, 800], { unit: "mm", rot: 0 })).toEqual([1.2, 0.3, 0.8]);
    expect(placedSize([1200, 300, 800], { unit: "mm", rot: 1 })).toEqual([0.8, 0.3, 1.2]);
    expect(yaw(1)).toBeCloseTo(-Math.PI / 2); // clockwise from above
  });

  it("doesn't trust stored placements blindly", () => {
    const fb = defaultPlacement([10, 3, 8]);
    expect(sanitizePlacement(null, fb)).toBe(fb);
    expect(sanitizePlacement({ unit: "ft", rot: 7, x: "3", y: 1e9, z: 2, opacity: 0, hidden: "yes" }, fb)).toEqual({ ...fb, y: 50, z: 2, opacity: 0.1 });
  });
});
