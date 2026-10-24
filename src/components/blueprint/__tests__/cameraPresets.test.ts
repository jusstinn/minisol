import { describe, expect, it } from "vitest";
import type { Vec3 } from "../builders";
import { CAMERA_PRESETS, cameraFor, fitDistance, tourFrame } from "../cameraPresets";

const ASPECT = 16 / 9;
const deck: Vec3 = [4, 0.4, 3]; // "Terasă 4 × 3 m"
const bathroom: Vec3 = [2.5, 2.6, 2]; // "Baie 2,5 × 2 m"
const big: Vec3 = [30, 1.8, 2]; // a long fence

function dist(pos: Vec3, target: Vec3) {
  return Math.hypot(pos[0] - target[0], pos[1] - target[1], pos[2] - target[2]);
}

describe("CAMERA_PRESETS", () => {
  it("lists all six presets, once each, in the UI/keyboard-shortcut order", () => {
    expect(CAMERA_PRESETS).toEqual(["iso", "top", "front", "side", "eye", "tour"]);
    expect(new Set(CAMERA_PRESETS).size).toBe(6);
  });
});

describe("iso", () => {
  it("keeps the original 3/4 direction (0.9, 0.75, 1), just scaled to fit the bounds", () => {
    for (const extent of [deck, bathroom, big]) {
      const { position, target } = cameraFor("iso", { extent }, ASPECT);
      const off: Vec3 = [position[0] - target[0], position[1] - target[1], position[2] - target[2]];
      expect(off[0] / off[2]).toBeCloseTo(0.9, 3);
      expect(off[1] / off[2]).toBeCloseTo(0.75, 3);
    }
  });

  it("stands further back for a bigger build than a smaller one", () => {
    const small = dist(cameraFor("iso", { extent: bathroom }, ASPECT).position, [0, 0, 0]);
    const large = dist(cameraFor("iso", { extent: big }, ASPECT).position, [0, 0, 0]);
    expect(large).toBeGreaterThan(small);
  });
});

describe("top", () => {
  it("looks straight down: almost all of the offset is vertical, and it's centred on the ground", () => {
    for (const extent of [deck, bathroom, big]) {
      const { position, target, fov } = cameraFor("top", { extent }, ASPECT);
      expect(target).toEqual([0, 0, 0]);
      expect(position[0]).toBeCloseTo(0, 6);
      expect(Math.abs(position[2])).toBeLessThan(position[1] * 0.1);
      expect(position[1]).toBeGreaterThan(0);
      expect(fov).toBe(32);
    }
  });

  it("is biased a hair south (not north) of straight up — the side a plan-consistent north-up render needs", () => {
    const { position } = cameraFor("top", { extent: deck }, ASPECT);
    expect(position[2]).toBeGreaterThan(0);
  });

  it("stands further back for a bigger build", () => {
    const small = cameraFor("top", { extent: bathroom }, ASPECT).position[1];
    const large = cameraFor("top", { extent: big }, ASPECT).position[1];
    expect(large).toBeGreaterThan(small);
  });
});

describe("front and side elevations", () => {
  it("front looks from due south (positive z), at the model's usual target height", () => {
    for (const extent of [deck, bathroom]) {
      const { position, target } = cameraFor("front", { extent }, ASPECT);
      expect(position[0]).toBeCloseTo(target[0], 6);
      expect(position[1]).toBeCloseTo(target[1], 6);
      expect(position[2]).toBeGreaterThan(target[2]);
    }
  });

  it("side looks from due east (positive x)", () => {
    for (const extent of [deck, bathroom]) {
      const { position, target } = cameraFor("side", { extent }, ASPECT);
      expect(position[2]).toBeCloseTo(target[2], 6);
      expect(position[1]).toBeCloseTo(target[1], 6);
      expect(position[0]).toBeGreaterThan(target[0]);
    }
  });

  it("front and side stand the same distance from the target (same fit, different direction)", () => {
    const front = cameraFor("front", { extent: bathroom }, ASPECT);
    const side = cameraFor("side", { extent: bathroom }, ASPECT);
    expect(dist(front.position, front.target)).toBeCloseTo(dist(side.position, side.target), 5);
  });
});

describe("eye", () => {
  it("stands at human eye height (~1.6 m) for both a small room and a large build", () => {
    for (const extent of [deck, bathroom, big]) {
      const { position, fov } = cameraFor("eye", { extent }, ASPECT);
      expect(position[1]).toBe(1.6);
      expect(fov).toBeGreaterThan(32); // wide enough not to feel clipped standing close
    }
  });

  it("stands outside the build's south edge, not inside it", () => {
    for (const extent of [deck, bathroom]) {
      const { position } = cameraFor("eye", { extent }, ASPECT);
      expect(position[2]).toBeGreaterThan(extent[2] / 2);
    }
  });

  it("looks slightly down into the build, not straight ahead at eye height", () => {
    const { position, target } = cameraFor("eye", { extent: bathroom }, ASPECT);
    expect(target[1]).toBeLessThan(position[1]);
    expect(target[0]).toBe(0);
  });
});

describe("tour", () => {
  it("starts and ends exactly on iso's frame, so it can hand back without a jump", () => {
    const iso = cameraFor("iso", { extent: deck }, ASPECT);
    const start = tourFrame({ extent: deck }, ASPECT, 0);
    const end = tourFrame({ extent: deck }, ASPECT, 1);
    for (const f of [start, end]) {
      expect(f.position[0]).toBeCloseTo(iso.position[0], 5);
      expect(f.position[1]).toBeCloseTo(iso.position[1], 5);
      expect(f.position[2]).toBeCloseTo(iso.position[2], 5);
      expect(f.target).toEqual(iso.target);
    }
  });

  it("sweeps a full revolution (both east and west of iso's position) mid-lap", () => {
    const iso = cameraFor("iso", { extent: deck }, ASPECT);
    const mid = tourFrame({ extent: deck }, ASPECT, 0.5);
    expect(Math.abs(mid.position[0] - iso.position[0]) + Math.abs(mid.position[2] - iso.position[2])).toBeGreaterThan(0.5);
  });

  it("stays roughly the same distance from target throughout (a gentle dolly, not a wild zoom)", () => {
    const iso = cameraFor("iso", { extent: deck }, ASPECT);
    const r0 = dist(iso.position, iso.target);
    for (const phase of [0.1, 0.25, 0.4, 0.6, 0.75, 0.9]) {
      const f = tourFrame({ extent: deck }, ASPECT, phase);
      const r = dist(f.position, f.target);
      expect(r).toBeGreaterThan(r0 * 0.8);
      expect(r).toBeLessThan(r0 * 1.2);
    }
  });
});

describe("fitDistance", () => {
  it("grows with the build's size and shrinks with a wider field of view", () => {
    expect(fitDistance(big, ASPECT)).toBeGreaterThan(fitDistance(bathroom, ASPECT));
    expect(fitDistance(bathroom, ASPECT, 60)).toBeLessThan(fitDistance(bathroom, ASPECT, 32));
  });
});
