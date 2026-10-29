import type { Part, Vec3 } from "../builders";
import { insideConvex, prismOutline } from "./prism";
import type { Pt } from "./prism";

/**
 * Pure math behind the deck's screw heads (instanced in `Scene.tsx`'s REAL view, desktop only):
 * wherever a board lies over a joist it is screwed down, two screws per crossing a little in
 * from the board's long edges. A crossing is where the joist's own run-position meets the board
 * — straight boards, boards at 45° and mitred frame boards alike, and only where they really
 * overlap (a frame's short field boards stop before the joists beyond them). No renderer, no
 * `THREE` — `Scene.tsx` turns the points into one `InstancedMesh`.
 */

/** The axis (0 = x, 2 = z) along which a horizontal part is narrow — its own row/run position is
 *  the *other* horizontal axis. Ties (a square cross-section) resolve to x. */
function thinAxis(size: Vec3): 0 | 2 {
  return size[0] <= size[2] ? 0 : 2;
}

interface BoardFrame {
  /** A point on the board's centreline. */
  origin: Pt;
  /** Unit vector along the board, and across it. */
  g: Pt;
  n: Pt;
  /** Half the board's width. */
  half: number;
  /** Is a plan point on the board? */
  has: (p: Pt) => boolean;
}

/** The board's grain direction, width and outline, whether it is a plain box or a prism. */
function boardFrame(board: Part): BoardFrame | null {
  const outline = prismOutline(board.shape, board.pos);
  if (outline) {
    const m = String(board.shape).match(/^prism:(\d+):/);
    const grain = ((Number(m?.[1] ?? 0)) * Math.PI) / 1800;
    const g: Pt = [Math.cos(grain), Math.sin(grain)];
    const n: Pt = [-g[1], g[0]];
    const vs = outline.map((p) => p[0] * n[0] + p[1] * n[1]);
    const lo = Math.min(...vs);
    const hi = Math.max(...vs);
    const centre = (lo + hi) / 2;
    // Shift the origin onto the board's own centreline (a board cut by the edge is off-centre).
    const origin: Pt = [board.pos[0] + n[0] * (centre - (board.pos[0] * n[0] + board.pos[2] * n[1])), board.pos[2] + n[1] * (centre - (board.pos[0] * n[0] + board.pos[2] * n[1]))];
    return { origin, g, n, half: (hi - lo) / 2, has: (p) => insideConvex(outline, p, 0.004) };
  }
  const across = thinAxis(board.size); // the axis the board's own width/row sits on
  const along = across === 0 ? 2 : 0;
  const g: Pt = along === 0 ? [1, 0] : [0, 1];
  const n: Pt = [-g[1], g[0]];
  const hx = board.size[0] / 2 + 1e-6;
  const hz = board.size[2] / 2 + 1e-6;
  return {
    origin: [board.pos[0], board.pos[2]],
    g,
    n,
    half: board.size[across] / 2,
    has: (p) => Math.abs(p[0] - board.pos[0]) <= hx && Math.abs(p[1] - board.pos[2]) <= hz,
  };
}

/** The (up to two) screw positions where `board` crosses `joist` underneath it, or `[]` if the
 *  two parts share the same orientation (so they can't actually cross), they don't overlap, or
 *  the board is too narrow for an inset screw on each side. */
export function screwCrossings(board: Part, joist: Part, edgeInset = 0.022): Vec3[] {
  const frame = boardFrame(board);
  return frame ? crossingsOf(frame, board, joist, edgeInset) : [];
}

function crossingsOf(frame: BoardFrame, board: Part, joist: Part, edgeInset: number): Vec3[] {
  const joistAxis = thinAxis(joist.size); // the axis the joist's own width/run sits on
  const joistLong = joistAxis === 0 ? 2 : 0;
  const o = frame.half - edgeInset;
  if (o <= 0) return [];
  // A board running the same way as the joist can't lie across it.
  if (Math.abs(frame.g[joistAxis === 0 ? 0 : 1]) < 1e-6) return [];
  const y = board.pos[1] + board.size[1] / 2 + 0.001;
  const c = joist.pos[joistAxis];
  const joistLo = joist.pos[joistLong] - joist.size[joistLong] / 2 - 1e-6;
  const joistHi = joist.pos[joistLong] + joist.size[joistLong] / 2 + 1e-6;
  const out: Vec3[] = [];
  for (const side of [1, -1]) {
    // The line parallel to the board, `o` in from its centreline, meets the joist's centreline here.
    const q: Pt = [frame.origin[0] + frame.n[0] * o * side, frame.origin[1] + frame.n[1] * o * side];
    const k = joistAxis === 0 ? 0 : 1;
    const t = (c - q[k]) / frame.g[k];
    const s: Pt = [q[0] + frame.g[0] * t, q[1] + frame.g[1] * t];
    const on = joistLong === 0 ? s[0] : s[1];
    if (on < joistLo || on > joistHi || !frame.has(s)) continue;
    out.push([s[0], y, s[1]]);
  }
  return out;
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
    const frame = boardFrame(b);
    if (!frame) continue;
    for (const j of joists) {
      if (out.length >= cap) return out;
      for (const pos of crossingsOf(frame, b, j, 0.022)) out.push({ pos, delay: b.delay });
    }
  }
  return out;
}
