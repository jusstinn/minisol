import { describe, expect, it } from "vitest";
import { PAVING_BONDS } from "@/domain/patterns";
import type { PavingBond } from "@/domain/patterns";
import { bondUnit, paverPieces } from "../pavingBond";
import type { PaverPiece } from "../pavingBond";

const zone = { x: -3, z: -0.6, w: 6, d: 1.2 };
const area = (p: PaverPiece) => (p.x1 - p.x0) * (p.z1 - p.z0);

function overlap(a: PaverPiece, b: PaverPiece) {
  const dx = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const dz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
  return dx > 1e-9 && dz > 1e-9 ? dx * dz : 0;
}

describe("paverPieces: every bond tiles the zone exactly", () => {
  const cases: [PavingBond | undefined, number, number][] = [
    [undefined, 0.2, 0.1],
    ["running", 0.2, 0.1],
    ["stack", 0.2, 0.1],
    ["herringbone", 0.2, 0.1],
    ["basketweave", 0.2, 0.1],
    ["herringbone", 0.346, 0.173],
    ["basketweave", 0.346, 0.173],
    ["running", 0.3, 0.3],
  ];
  it.each(cases)("%s %s × %s: pieces cover the zone once, stay inside it and never overlap", (bond, l, w) => {
    for (const z of [zone, { x: 0.37, z: -1.1, w: 4.13, d: 2.71 }]) {
      const pieces = paverPieces(z, l, w, bond);
      // inside the outline
      for (const p of pieces) {
        expect(p.x0).toBeGreaterThanOrEqual(z.x - 1e-9);
        expect(p.x1).toBeLessThanOrEqual(z.x + z.w + 1e-9);
        expect(p.z0).toBeGreaterThanOrEqual(z.z - 1e-9);
        expect(p.z1).toBeLessThanOrEqual(z.z + z.d + 1e-9);
      }
      // no two pieces overlap
      let overlapping = 0;
      for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) overlapping += overlap(pieces[i], pieces[j]);
      expect(overlapping).toBeLessThan(1e-9);
      // together they are the whole zone (a paver thinner than 2 cm is joint, not paver)
      const covered = pieces.reduce((s, p) => s + area(p), 0);
      expect(covered).toBeGreaterThan(z.w * z.d * 0.995);
      expect(covered).toBeLessThanOrEqual(z.w * z.d + 1e-9);
    }
  });

  it("ids are unique and stable: the same call twice gives the same pieces", () => {
    for (const bond of PAVING_BONDS) {
      const a = paverPieces(zone, 0.2, 0.1, bond);
      const b = paverPieces(zone, 0.2, 0.1, bond);
      expect(a).toEqual(b);
      expect(new Set(a.map((p) => p.key)).size).toBe(a.length);
    }
  });

  it("running bond keeps its old ids and the half-paver offset on every other row", () => {
    const pieces = paverPieces(zone, 0.2, 0.1, "running");
    expect(pieces[0].key).toBe("paver-0-0");
    const row0 = pieces.filter((p) => p.r === 0);
    const row1 = pieces.filter((p) => p.r === 1);
    expect(row0[0].x1 - row0[0].x0).toBeCloseTo(0.2, 9);
    // row 1 starts with a half paver at the edge (offset by 0.1)
    expect(row1[0].x1 - row1[0].x0).toBeCloseTo(0.1, 9);
    expect(row0).toHaveLength(30);
    expect(row1).toHaveLength(31);
  });

  it("stack bond lines every row up", () => {
    const pieces = paverPieces(zone, 0.2, 0.1, "stack");
    expect(pieces).toHaveLength(12 * 30);
    const xs = new Set(pieces.map((p) => p.x0.toFixed(6)));
    expect(xs.size).toBe(30);
  });

  it("with no bond named, rectangular pavers go in a running bond and squares in a straight grid", () => {
    expect(paverPieces(zone, 0.2, 0.1, undefined)).toEqual(paverPieces(zone, 0.2, 0.1, "running"));
    expect(paverPieces(zone, 0.3, 0.3, undefined)).toEqual(paverPieces(zone, 0.3, 0.3, "stack"));
  });

  it("herringbone sets pavers both ways, half of them flat and half upright", () => {
    const pieces = paverPieces({ x: 0, z: 0, w: 4, d: 4 }, 0.2, 0.1, "herringbone");
    const flat = pieces.filter((p) => p.orient === "h");
    const upright = pieces.filter((p) => p.orient === "v");
    expect(Math.abs(flat.length - upright.length)).toBeLessThan(pieces.length * 0.08);
    // whole pavers are 20 × 10 either way round
    const whole = pieces.filter((p) => Math.abs(area(p) - 0.02) < 1e-9);
    expect(whole.length).toBeGreaterThan(pieces.length * 0.85);
    for (const p of whole) {
      const w = p.x1 - p.x0;
      const d = p.z1 - p.z0;
      expect(p.orient === "h" ? w > d : d > w).toBe(true);
    }
    // 16 m² of 0,02 m² pavers: 800 whole ones' worth
    expect(pieces.reduce((s, p) => s + area(p), 0)).toBeCloseTo(16, 6);
  });

  it("basketweave alternates blocks of two flat and two upright pavers", () => {
    const pieces = paverPieces({ x: 0, z: 0, w: 2, d: 2 }, 0.2, 0.1, "basketweave");
    // 10 × 10 blocks of 20 × 20 cm, 2 pavers each
    expect(pieces).toHaveLength(200);
    expect(pieces.filter((p) => p.orient === "h")).toHaveLength(100);
    expect(pieces.filter((p) => p.orient === "v")).toHaveLength(100);
    const first = pieces.filter((p) => p.key.startsWith("bw-0-0-"));
    const next = pieces.filter((p) => p.key.startsWith("bw-1-0-"));
    expect(first.every((p) => p.orient === "h")).toBe(true);
    expect(next.every((p) => p.orient === "v")).toBe(true);
  });

  it("an area-preserving 2:1 format for patterns that need one", () => {
    expect(bondUnit("herringbone", 0.2, 0.1)).toEqual({ l: expect.closeTo(0.2, 9), w: expect.closeTo(0.1, 9) });
    const u = bondUnit("basketweave", 0.3, 0.2);
    expect(u.l / u.w).toBeCloseTo(2, 9);
    expect(u.l * u.w).toBeCloseTo(0.06, 9);
    expect(bondUnit("running", 0.3, 0.2)).toEqual({ l: 0.3, w: 0.2 });
    expect(bondUnit(undefined, 0.3, 0.3)).toEqual({ l: 0.3, w: 0.3 });
  });
});
