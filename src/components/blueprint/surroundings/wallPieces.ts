/**
 * A wall with real openings, as plain boxes: the wall's face (u across, v up) minus a list of
 * rectangular holes, split into the rectangles that remain. The openings are genuine gaps — the
 * thickness of the wall shows as a reveal inside them — which is a large part of why a window in
 * a render reads as set *into* a wall rather than painted on. Pure, so it is unit-tested.
 */
export interface Hole {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}
export interface Piece {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

export function wallPieces(u0: number, u1: number, v0: number, v1: number, holes: readonly Hole[]): Piece[] {
  const clamped = holes
    .map((h) => ({ u0: Math.max(u0, h.u0), u1: Math.min(u1, h.u1), v0: Math.max(v0, h.v0), v1: Math.min(v1, h.v1) }))
    .filter((h) => h.u1 - h.u0 > 1e-6 && h.v1 - h.v0 > 1e-6);
  const cuts = Array.from(new Set([u0, u1, ...clamped.flatMap((h) => [h.u0, h.u1])])).sort((a, b) => a - b);
  const out: Piece[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i];
    const b = cuts[i + 1];
    if (b - a < 1e-6) continue;
    const mid = (a + b) / 2;
    const inSlab = clamped.filter((h) => mid > h.u0 && mid < h.u1).sort((p, q) => p.v0 - q.v0);
    let cursor = v0;
    for (const h of inSlab) {
      if (h.v0 > cursor + 1e-6) out.push({ u0: a, u1: b, v0: cursor, v1: h.v0 });
      cursor = Math.max(cursor, h.v1);
    }
    if (v1 > cursor + 1e-6) out.push({ u0: a, u1: b, v0: cursor, v1 });
  }
  return out;
}
