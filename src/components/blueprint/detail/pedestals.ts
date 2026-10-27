/**
 * Pure math behind the deck's adjustable supports: one grid point per (joist run position ×
 * cross-deck row), thinned so a big deck never places more than `maxCount` of them — exactly
 * the inline logic `builders.ts`'s `deck()` used to compute support positions, pulled out here so
 * it's unit-tested and so `Scene.tsx` can reason about "how many pedestals, roughly where" without
 * re-deriving it. No renderer, no `Part` — just the grid.
 */

export interface PedestalPoint {
  /** Index along the run (joist position) and across it (row) — stable ids come from these. */
  i: number;
  j: number;
  /** Position along the run / across it, metres, from the zone's own corner. */
  u: number;
  v: number;
}

export interface PedestalGrid {
  /** Grid lines along the run / across it, before thinning. */
  J: number;
  S: number;
  /** Every `stepS`-th grid cell (in row-major i*S+j order) is kept — 1 keeps them all. */
  stepS: number;
  points: PedestalPoint[];
}

/**
 * The support grid for one zone: a point every `pitchAlong` along the run and `pitchAcross`
 * across it, thinned (every `stepS`-th cell) once the raw grid would exceed `maxCount` points —
 * a big deck gets fewer, evenly-spread supports instead of thousands of them.
 */
export function pedestalGrid(run: number, across: number, opts?: { pitchAlong?: number; pitchAcross?: number; maxCount?: number }): PedestalGrid {
  const pitchAlong = Math.max(0.05, opts?.pitchAlong ?? 0.4);
  const pitchAcross = Math.max(0.05, opts?.pitchAcross ?? 0.6);
  const maxCount = Math.max(1, opts?.maxCount ?? 160);
  const J = Math.max(1, Math.ceil(run / pitchAlong) + 1);
  const S = Math.max(1, Math.ceil(across / pitchAcross) + 1);
  const stepS = Math.max(1, Math.ceil((J * S) / maxCount));
  const points: PedestalPoint[] = [];
  for (let i = 0; i < J; i++) {
    const u = J > 1 ? (i * run) / (J - 1) : 0;
    for (let j = 0; j < S; j++) {
      if ((i * S + j) % stepS !== 0) continue;
      const v = S > 1 ? (j * across) / (S - 1) : 0;
      points.push({ i, j, u, v });
    }
  }
  return { J, S, stepS, points };
}
