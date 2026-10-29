/**
 * A flat board with any convex outline — a diagonal deck board cut flush at the edge of the
 * deck, a picture-frame border board mitred at the corner. A `Part` is an axis-aligned box, so
 * these carry their outline in their `shape` string instead (see `Part.shape`): the renderer
 * turns the string into a prism geometry (`geometries.ts`), the same in PLAN, EXPLODED and
 * REAL, on phones too. Pure maths — no renderer — so builders and tests use it directly.
 *
 * The outline is written relative to the centre of its bounding box, in millimetres, so the
 * string is stable (equal outlines share one cached geometry) and a part's `pos`/`size` stay
 * what the rest of the scene expects: the bounding box.
 */

export type Pt = [x: number, z: number];

/** `prism:<grain angle in 0.1°>:<x,z;x,z;…>` — x, z in mm from the bounding-box centre. */
export type PrismShape = `prism:${string}`;

export interface PrismSpec {
  /** Outline relative to the bounding-box centre, metres. */
  points: Pt[];
  /** Direction the grain/texture runs along (radians in the x–z plane, 0 = along +x). */
  grain: number;
  /** Bounding box of the outline, metres. */
  width: number;
  depth: number;
}

export const isPrismShape = (s: unknown): s is PrismShape => typeof s === "string" && s.startsWith("prism:");

const MM = 1000;

/** Signed area ×2 of a polygon in the x–z plane (positive = counter-clockwise with z pointing "up"). */
export function area2(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i];
    const [x2, z2] = poly[(i + 1) % poly.length];
    a += x1 * z2 - x2 * z1;
  }
  return a;
}

export const polygonArea = (poly: Pt[]) => Math.abs(area2(poly)) / 2;

export function boundsOf(poly: Pt[]) {
  const xs = poly.map((p) => p[0]);
  const zs = poly.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  return { minX, maxX, minZ, maxZ, width: maxX - minX, depth: maxZ - minZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };
}

/** The shape string for an absolute outline: the part's centre (its bounding box's centre) and the string. */
export function prismOf(poly: Pt[], grain: number): { center: Pt; shape: PrismShape; width: number; depth: number } {
  const b = boundsOf(poly);
  const pts = poly.map(([x, z]) => `${Math.round((x - b.cx) * MM)},${Math.round((z - b.cz) * MM)}`).join(";");
  const deg10 = Math.round((((grain * 1800) / Math.PI) % 1800 + 1800) % 1800);
  return { center: [b.cx, b.cz], shape: `prism:${deg10}:${pts}`, width: b.width, depth: b.depth };
}

/** Read a shape string back; null for anything that isn't a well-formed prism. */
export function parsePrism(shape: unknown): PrismSpec | null {
  if (!isPrismShape(shape)) return null;
  const [, deg10, pts] = shape.split(":");
  const points: Pt[] = [];
  for (const p of (pts ?? "").split(";")) {
    const [x, z] = p.split(",").map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    points.push([x / MM, z / MM]);
  }
  const angle = Number(deg10);
  if (points.length < 3 || !Number.isFinite(angle)) return null;
  const b = boundsOf(points);
  return { points, grain: (angle * Math.PI) / 1800, width: b.width, depth: b.depth };
}

/** The outline in plan coordinates for a prism part (its `pos` is the bounding-box centre). */
export function prismOutline(shape: unknown, pos: [number, number, number]): Pt[] | null {
  const spec = parsePrism(shape);
  if (!spec) return null;
  const b = boundsOf(spec.points);
  // The string is relative to the bbox centre already, but rounding can leave it a hair off: re-centre.
  return spec.points.map(([x, z]) => [pos[0] + x - b.cx, pos[2] + z - b.cz] as Pt);
}

/** Clip a convex polygon to the half-plane `a·x + b·z ≥ c` (Sutherland–Hodgman). */
export function clipHalfPlane(poly: Pt[], a: number, b: number, c: number): Pt[] {
  const out: Pt[] = [];
  const f = (p: Pt) => a * p[0] + b * p[1] - c;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const fp = f(p);
    const fq = f(q);
    if (fp >= 0) out.push(p);
    if ((fp >= 0) !== (fq >= 0)) {
      const t = fp / (fp - fq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

/** Is a point inside a convex polygon (either winding), with a tolerance in metres? */
export function insideConvex(poly: Pt[], p: Pt, tol = 0): boolean {
  const sign = Math.sign(area2(poly)) || 1;
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i];
    const [x2, z2] = poly[(i + 1) % poly.length];
    const len = Math.hypot(x2 - x1, z2 - z1) || 1;
    // Signed distance of p from the edge, positive on the polygon's inner side.
    const d = (sign * ((x2 - x1) * (p[1] - z1) - (z2 - z1) * (p[0] - x1))) / len;
    if (d < -tol) return false;
  }
  return true;
}
