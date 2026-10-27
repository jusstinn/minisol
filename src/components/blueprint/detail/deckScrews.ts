import type { Part, Vec3 } from "../builders";

/**
 * Pure math behind the deck's screw heads (instanced in `Scene.tsx`'s REAL view, desktop only):
 * every board crosses every joist underneath it (see `deck()` in `builders.ts` — each board spans
 * the zone's full run, each joist spans its full width), so a crossing is simply where the
 * joist's own run-position meets the board's own row-position. Two screws per crossing, a little
 * in from the board's long edges. No renderer, no `THREE` — `Scene.tsx` turns the points into one
 * `InstancedMesh`.
 */

/** The axis (0 = x, 2 = z) along which a horizontal part is narrow — its own row/run position is
 *  the *other* horizontal axis. Ties (a square cross-section) resolve to x. */
function thinAxis(size: Vec3): 0 | 2 {
  return size[0] <= size[2] ? 0 : 2;
}

/** The (up to two) screw positions where `board` crosses `joist` underneath it, or `[]` if the
 *  two parts share the same orientation (so they can't actually cross) or the board is too
 *  narrow for an inset screw on each side. */
export function screwCrossings(board: Part, joist: Part, edgeInset = 0.022): Vec3[] {
  const boardAxis = thinAxis(board.size); // the axis the board's own width/row sits on
  const joistAxis = thinAxis(joist.size); // the axis the joist's own width/run sits on
  if (boardAxis === joistAxis) return [];
  const half = board.size[boardAxis] / 2 - edgeInset;
  if (half <= 0) return [];
  const y = board.pos[1] + board.size[1] / 2 + 0.001;
  const base: Vec3 = [0, y, 0];
  base[joistAxis] = joist.pos[joistAxis];
  base[boardAxis] = board.pos[boardAxis];
  const a: Vec3 = [...base] as Vec3;
  const b: Vec3 = [...base] as Vec3;
  a[boardAxis] += half;
  b[boardAxis] -= half;
  return [a, b];
}

const isStairPart = (id: string) => id.includes("-tread-") || id.includes("-str-");

export interface ScrewPlacement {
  pos: Vec3;
  /** The board's own build delay — a screw pops in shortly after its board settles. */
  delay: number;
}

/** Every screw position for a deck build: the main surface's boards × joists (stair treads and
 *  their stringers are skipped — a stringer only sits under its own tread, not the whole deck,
 *  so the generic "every board crosses every joist" shortcut doesn't hold there). Capped so even
 *  a large deck stays a reasonable instance count. */
export function deckScrewInstances(parts: readonly Part[], cap = 4000): ScrewPlacement[] {
  const boards = parts.filter((p) => p.layer === "deck_board" && !isStairPart(p.id));
  const joists = parts.filter((p) => p.layer === "deck_joist" && !isStairPart(p.id));
  const out: ScrewPlacement[] = [];
  for (const b of boards) {
    for (const j of joists) {
      if (out.length >= cap) return out;
      for (const pos of screwCrossings(b, j)) out.push({ pos, delay: b.delay });
    }
  }
  return out;
}
