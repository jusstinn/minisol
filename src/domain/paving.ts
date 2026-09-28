/**
 * Garden paths, patios and driveways laid with concrete pavers ("pavele") on a
 * compacted crushed-stone base and a sand bed. The build-up depends on what the
 * surface carries: feet (path, patio) or cars (driveway). Shared by the calculator,
 * the layout (items stand on the finished surface) and the 3D sketch.
 */

export const PAVING_USES = ["path", "patio", "driveway"] as const;
export type PavingUse = (typeof PAVING_USES)[number];

export interface PavingBuildup {
  /** Compacted crushed-stone base (0–31.5 mm), m. */
  base: number;
  /** Screeded bedding sand, m. */
  sand: number;
  /** Paver thickness, m (6 cm for foot traffic, 8 cm for cars). */
  paver: number;
}

export const PAVING_BUILDUP: Record<PavingUse, PavingBuildup> = {
  path: { base: 0.1, sand: 0.04, paver: 0.06 },
  patio: { base: 0.15, sand: 0.04, paver: 0.06 },
  driveway: { base: 0.25, sand: 0.04, paver: 0.08 },
};

export const isPavingUse = (v: unknown): v is PavingUse => (PAVING_USES as readonly unknown[]).includes(v);

/** How deep to dig below the finished surface: the whole build-up, in m. */
export function pavingDepth(use: PavingUse): number {
  const b = PAVING_BUILDUP[use];
  return Math.round((b.base + b.sand + b.paver) * 1000) / 1000;
}

/** A plain request says no use: narrow strips are paths, anything wider is a patio. */
export const defaultPavingUse = (w: number, d: number): PavingUse => (Math.min(w, d) <= 1.5 ? "path" : "patio");
