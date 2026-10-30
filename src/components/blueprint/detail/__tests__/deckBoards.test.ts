import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { diagonalBoards, frameBoards } from "../deckBoards";
import { clipHalfPlane, insideConvex, parsePrism, polygonArea, prismOf, prismOutline } from "../prism";
import type { Pt } from "../prism";
import { prismCacheSize, prismGeometryFor, unitGeometryFor } from "../geometries";

const zone = { x: -2, z: -1.5, w: 4, d: 3 };
const rectArea = (z: { w: number; d: number }) => z.w * z.d;
const inRect = (z: typeof zone, p: Pt, tol = 1e-6) => p[0] >= z.x - tol && p[0] <= z.x + z.w + tol && p[1] >= z.z - tol && p[1] <= z.z + z.d + tol;

/** How many of the outlines contain each of a grid of sample points. */
function coverage(polys: Pt[][], z: typeof zone, step = 0.013) {
  let covered = 0;
  let double = 0;
  let total = 0;
  for (let x = z.x + step / 2; x < z.x + z.w; x += step) {
    for (let y = z.z + step / 2; y < z.z + z.d; y += step) {
      total++;
      const n = polys.filter((p) => insideConvex(p, [x, y], -1e-9)).length;
      if (n >= 1) covered++;
      if (n > 1) double++;
    }
  }
  return { covered: covered / total, double };
}

describe("diagonalBoards", () => {
  const boards = diagonalBoards(zone, false, 0.15, 0.145);

  it("lays boards at 45°, one every 15 cm across the diagonal, cut flush at the deck's edge", () => {
    // the diagonal of the zone measured across the boards: (4 + 3) / √2 = 4.95 m → 33 boards
    expect(boards.length).toBeGreaterThanOrEqual(32);
    expect(boards.length).toBeLessThanOrEqual(34);
    for (const b of boards) {
      expect(b.grain).toBeCloseTo(Math.PI / 4, 9);
      for (const p of b.poly) expect(inRect(zone, p)).toBe(true);
    }
  });

  it("the boards neither overlap nor leave much bare: ~97% of the deck (145 mm of every 150)", () => {
    const { covered, double } = coverage(boards.map((b) => b.poly), zone);
    expect(double).toBe(0);
    expect(covered).toBeGreaterThan(0.95);
    expect(covered).toBeLessThan(0.98);
    const sum = boards.reduce((s, b) => s + polygonArea(b.poly), 0);
    expect(sum / rectArea(zone)).toBeGreaterThan(0.95);
  });

  it("the other diagonal mirrors it", () => {
    const flipped = diagonalBoards(zone, true, 0.15, 0.145);
    expect(flipped).toHaveLength(boards.length);
    for (const b of flipped) expect(b.grain).toBeCloseTo(-Math.PI / 4, 9);
    expect(coverage(flipped.map((b) => b.poly), zone).double).toBe(0);
  });

  it("a long board crosses the deck; the corners are small triangles", () => {
    const areas = boards.map((b) => polygonArea(b.poly));
    expect(Math.min(...areas)).toBeLessThan(0.03);
    expect(Math.max(...areas)).toBeGreaterThan(0.5);
    const mid = boards[Math.floor(boards.length / 2)];
    expect(mid.poly.length).toBeGreaterThanOrEqual(4);
  });

  it("is deterministic and the indexes are unique", () => {
    expect(diagonalBoards(zone, false, 0.15, 0.145)).toEqual(boards);
    expect(new Set(boards.map((b) => b.index)).size).toBe(boards.length);
  });
});

describe("frameBoards", () => {
  const all = { n: true, e: true, s: true, w: true };

  it("one board on each open side, mitred where two open sides meet", () => {
    const fb = frameBoards(zone, all, 0.145);
    expect(fb.map((b) => b.side).sort()).toEqual(["e", "n", "s", "w"]);
    for (const b of fb) {
      expect(b.poly).toHaveLength(4);
      for (const p of b.poly) expect(inRect(zone, p)).toBe(true);
    }
    // together a ring: perimeter × width, less the mitred corner triangles counted once
    const sum = fb.reduce((s, b) => s + polygonArea(b.poly), 0);
    const inner = (zone.w - 2 * 0.145) * (zone.d - 2 * 0.145);
    expect(sum).toBeCloseTo(rectArea(zone) - inner, 6);
    expect(coverage(fb.map((b) => b.poly), zone).double).toBe(0);
  });

  it("the north and south boards run east–west, east and west run north–south", () => {
    const fb = frameBoards(zone, all, 0.145);
    expect(fb.find((b) => b.side === "n")!.grain).toBe(0);
    expect(fb.find((b) => b.side === "e")!.grain).toBeCloseTo(Math.PI / 2, 9);
  });

  it("a side that continues into another zone has no board and the neighbours are cut square", () => {
    const fb = frameBoards(zone, { n: true, e: false, s: true, w: true }, 0.145);
    expect(fb.map((b) => b.side).sort()).toEqual(["n", "s", "w"]);
    const n = fb.find((b) => b.side === "n")!;
    // the north board's east end is square (no mitre): both its east corners are at x = 2
    const east = n.poly.filter((p) => Math.abs(p[0] - (zone.x + zone.w)) < 1e-9);
    expect(east).toHaveLength(2);
    expect(coverage(fb.map((b) => b.poly), zone).double).toBe(0);
  });
});

describe("prism outlines", () => {
  const poly: Pt[] = [[1, 1], [3, 1], [2.5, 1.4], [1.5, 1.4]];

  it("round-trip through the shape string, relative to the bounding-box centre", () => {
    const { center, shape, width, depth } = prismOf(poly, Math.PI / 4);
    expect(center).toEqual([2, 1.2]);
    expect(width).toBeCloseTo(2, 9);
    expect(depth).toBeCloseTo(0.4, 9);
    const spec = parsePrism(shape)!;
    expect(spec.grain).toBeCloseTo(Math.PI / 4, 3);
    expect(spec.points).toHaveLength(4);
    const back = prismOutline(shape, [center[0], 0, center[1]])!;
    back.forEach((p, i) => {
      expect(p[0]).toBeCloseTo(poly[i][0], 3);
      expect(p[1]).toBeCloseTo(poly[i][1], 3);
    });
  });

  it("equal outlines in different places give the same string (one cached geometry)", () => {
    const a = prismOf(poly, 0).shape;
    const b = prismOf(poly.map(([x, z]) => [x + 5, z - 2] as Pt), 0).shape;
    expect(a).toBe(b);
  });

  it("rejects anything that isn't a prism string", () => {
    expect(parsePrism("cylinder")).toBeNull();
    expect(parsePrism("prism:0:1,2")).toBeNull();
    expect(parsePrism("prism:x:1,2;3,4;5,6")).toBeNull();
    expect(parsePrism(undefined)).toBeNull();
  });

  it("clips a polygon to a half-plane", () => {
    const square: Pt[] = [[0, 0], [2, 0], [2, 2], [0, 2]];
    expect(polygonArea(clipHalfPlane(square, 1, 0, 1))).toBeCloseTo(2, 9);
    expect(clipHalfPlane(square, 1, 0, 5)).toHaveLength(0);
  });
});

describe("prism geometry", () => {
  const { shape } = prismOf([[0, 0], [2, 0], [1.5, 0.145], [0.3, 0.145]], 0);

  it("fits the unit cube like every other unit shape, so scaling it by the part's bounding box sizes it", () => {
    const geo = unitGeometryFor(shape);
    geo.computeBoundingBox();
    const size = geo.boundingBox!.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(1, 3);
    expect(size.y).toBeCloseTo(1, 6);
    expect(size.z).toBeCloseTo(1, 3);
    expect(geo.boundingBox!.min.y).toBeCloseTo(-0.5, 6);
  });

  it("every face points out of the board: up on top, down below, away from the centre on the sides", () => {
    const geo = prismGeometryFor(shape);
    const pos = geo.getAttribute("position");
    const nor = geo.getAttribute("normal");
    let up = 0;
    let down = 0;
    for (let i = 0; i < pos.count; i += 3) {
      const n = new THREE.Vector3(nor.getX(i), nor.getY(i), nor.getZ(i));
      const centre = new THREE.Vector3();
      for (let k = 0; k < 3; k++) centre.add(new THREE.Vector3(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k)));
      centre.divideScalar(3);
      if (n.y > 0.99) up++;
      else if (n.y < -0.99) down++;
      else {
        expect(Math.abs(n.y)).toBeLessThan(1e-6);
        // the horizontal part of the face's position from the outline's centroid points the same way
        const horizontal = new THREE.Vector3(centre.x - 0.0, 0, centre.z - 0.0);
        expect(horizontal.dot(new THREE.Vector3(n.x, 0, n.z))).toBeGreaterThan(-0.2);
      }
    }
    expect(up).toBe(2); // a quad = two triangles
    expect(down).toBe(2);
  });

  it("has texture coordinates 0..1 along and across the grain", () => {
    const uv = prismGeometryFor(shape).getAttribute("uv");
    let minU = 1;
    let maxU = 0;
    for (let i = 0; i < uv.count; i++) {
      minU = Math.min(minU, uv.getX(i));
      maxU = Math.max(maxU, uv.getX(i));
      expect(uv.getY(i)).toBeGreaterThanOrEqual(-1e-9);
      expect(uv.getY(i)).toBeLessThanOrEqual(1 + 1e-9);
    }
    expect(minU).toBeCloseTo(0, 6);
    expect(maxU).toBeCloseTo(1, 6);
  });

  it("is cached per outline", () => {
    const before = prismCacheSize();
    const a = prismGeometryFor(shape);
    expect(prismGeometryFor(shape)).toBe(a);
    expect(prismCacheSize()).toBe(before);
  });
});
