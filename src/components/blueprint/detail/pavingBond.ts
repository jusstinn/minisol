import type { PavingBond } from "@/domain/patterns";

/**
 * Where each paver goes in a paved zone, for the four bonds. Pure maths — no renderer, no `Part`:
 * `paving()` in `builders.ts` turns the pieces into parts. A paver is an axis-aligned rectangle in
 * every bond (the herringbone is the 90° one), so a piece cut by the zone's edge is still a
 * rectangle — it is simply clipped to the outline, which is what a paviour does with a saw.
 *
 * Coordinates are the zone's own plan coordinates, metres. `key` is stable for a given position
 * in the pattern, so an edit or a product swap morphs the same paver instead of rebuilding.
 */

export interface PaverPiece {
  /** Stable id suffix within the zone. */
  key: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Which way the long side runs: along x ("h") or along z ("v"). */
  orient: "h" | "v";
  /** Row and column in the pattern (for the build order and the colour mix). */
  r: number;
  c: number;
}

export interface BondZone {
  x: number;
  z: number;
  w: number;
  d: number;
}

/** Pieces thinner than this (m) are not drawn: a sliver of a cut paver is just joint. */
const MIN_PIECE = 0.02;

/**
 * The drawn paver format for a bond. Running and stack bond use the product's own format; the
 * herringbone and the basketweave only work with a 2:1 rectangle, so they use one with the same
 * area as the real paver (a 20 × 10 stays 20 × 10; a 30 × 20 becomes ~34.6 × 17.3).
 */
export function bondUnit(bond: PavingBond | undefined, long: number, short: number): { l: number; w: number } {
  if (bond === "herringbone" || bond === "basketweave") {
    const w = Math.sqrt((long * short) / 2);
    return { l: 2 * w, w };
  }
  return { l: long, w: short };
}

/**
 * Pieces of one zone. `l` × `w` is the drawn paver (long × short side): running bond offsets every
 * other row by half a paver, stack bond lines them all up, the basketweave puts pairs side by side
 * in a chessboard, and the herringbone sets each paver at right angles to the next in a staircase.
 * With no bond given, rectangular pavers go in a running bond and squares in a straight grid —
 * what the sketch always did.
 */
export function paverPieces(zone: BondZone, l: number, w: number, bond: PavingBond | undefined): PaverPiece[] {
  const out: PaverPiece[] = [];
  const x0 = zone.x;
  const z0 = zone.z;
  const x1 = zone.x + zone.w;
  const z1 = zone.z + zone.d;
  const push = (key: string, a: number, b: number, c: number, d: number, orient: "h" | "v", r: number, col: number) => {
    const ax = Math.max(x0, a);
    const bx = Math.min(x1, b);
    const az = Math.max(z0, c);
    const bz = Math.min(z1, d);
    if (bx - ax < MIN_PIECE || bz - az < MIN_PIECE) return;
    out.push({ key, x0: ax, x1: bx, z0: az, z1: bz, orient, r, c: col });
  };

  if (bond === "herringbone") {
    // Cells of the short side. A paver is anchored on every cell whose (column + row) is even:
    // a flat one when that sum is 0 mod 4, an upright one when it is 2 mod 4 — each cell of the
    // plane is then covered by exactly one of them.
    const cols = Math.ceil(zone.w / w) + 1;
    const rows = Math.ceil(zone.d / w) + 1;
    for (let b = -1; b < rows; b++) {
      for (let a = -1; a < cols; a++) {
        const phase = (((a + b) % 4) + 4) % 4;
        if (phase === 0) push(`hb-${a + 1}-${b + 1}`, x0 + a * w, x0 + (a + 2) * w, z0 + b * w, z0 + (b + 1) * w, "h", b + 1, a + 1);
        else if (phase === 2) push(`hb-${a + 1}-${b + 1}`, x0 + a * w, x0 + (a + 1) * w, z0 + b * w, z0 + (b + 2) * w, "v", b + 1, a + 1);
      }
    }
    return out;
  }

  if (bond === "basketweave") {
    // Square blocks of two pavers (l × l): flat pairs and upright pairs in a chessboard.
    const bl = l;
    const nx = Math.ceil(zone.w / bl - 1e-9);
    const nz = Math.ceil(zone.d / bl - 1e-9);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const bx = x0 + i * bl;
        const bz = z0 + j * bl;
        const flat = (i + j) % 2 === 0;
        for (let n = 0; n < 2; n++) {
          if (flat) push(`bw-${i}-${j}-${n}`, bx, bx + bl, bz + n * w, bz + (n + 1) * w, "h", j * 2 + n, i);
          else push(`bw-${i}-${j}-${n}`, bx + n * w, bx + (n + 1) * w, bz, bz + bl, "v", j * 2, i * 2 + n);
        }
      }
    }
    return out;
  }

  // Rows of l × w: offset by half a paver on every other row (running) or lined up (stack).
  const offset = bond === "stack" ? false : bond === "running" ? true : l >= 1.45 * w;
  const rows = Math.ceil(zone.d / w - 1e-9);
  for (let r = 0; r < rows; r++) {
    const a0 = z0 + r * w;
    const shift = offset && r % 2 ? l / 2 : 0;
    const cols = Math.ceil((zone.w + shift) / l - 1e-9);
    for (let c = 0; c < cols; c++) push(`paver-${r}-${c}`, x0 - shift + c * l, x0 - shift + (c + 1) * l, a0, a0 + w, "h", r, c);
  }
  return out;
}
