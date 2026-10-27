import { describe, expect, it } from "vitest";
import type { Part } from "../../builders";
import { deckScrewInstances, screwCrossings } from "../deckScrews";

/** A board/joist pair shaped exactly like `deck()` (builders.ts) draws them for an `alongX` zone:
 *  boards span the full run (x) at a given row (z); joists span the full width (z) at a given
 *  run position (x). */
function board(v: number, run = 2, bw = 0.145, boardT = 0.028, top = 0.1): Part {
  return { id: `A-board-${v}`, layer: "deck_board", pos: [run / 2, top - boardT / 2, v], size: [run, boardT, bw], color: "#c9935a", delay: 0, grow: "slide" };
}
function joist(u: number, across = 1, joistW = 0.045, joistH = 0.07, supH = 0.03): Part {
  return { id: `A-joist-${u}`, layer: "deck_joist", pos: [u, supH + joistH / 2, across / 2], size: [joistW, joistH, across], color: "#8e6038", delay: 0, grow: "drop" };
}

describe("screwCrossings", () => {
  it("places two screws where a joist runs under a board, just proud of its top face", () => {
    const b = board(0.1);
    const j = joist(0);
    const pts = screwCrossings(b, j);
    expect(pts).toHaveLength(2);
    for (const p of pts) {
      expect(p[0]).toBeCloseTo(0, 6); // the joist's own run position
      expect(p[1]).toBeCloseTo(b.pos[1] + b.size[1] / 2 + 0.001, 6); // just above the board's top
    }
    // straddling the board's own centreline (z = 0.1), symmetrically
    const zs = pts.map((p) => p[2]).sort((a, c) => a - c);
    expect((zs[0] + zs[1]) / 2).toBeCloseTo(0.1, 6);
    expect(zs[1] - zs[0]).toBeGreaterThan(0);
    expect(zs[1] - zs[0]).toBeLessThan(b.size[2]);
  });

  it("returns nothing for two parts with the same orientation (never actually crosses)", () => {
    const b = board(0.1);
    expect(screwCrossings(b, board(0.3))).toHaveLength(0);
  });

  it("returns nothing once the edge inset would overlap itself (a too-narrow board)", () => {
    const narrow: Part = { ...board(0.1), size: [2, 0.028, 0.02] };
    expect(screwCrossings(narrow, joist(0))).toHaveLength(0);
  });
});

describe("deckScrewInstances", () => {
  it("places two screws at every board × joist crossing", () => {
    const parts = [board(0.1), board(0.3), joist(0), joist(1), joist(2)];
    const pts = deckScrewInstances(parts);
    expect(pts).toHaveLength(2 * 3 * 2);
  });

  it("carries the board's own delay — a screw pops in with its board, not all at once", () => {
    const b = { ...board(0.1), delay: 2.4 };
    const pts = deckScrewInstances([b, joist(0)]);
    expect(pts.every((p) => p.delay === 2.4)).toBe(true);
  });

  it("skips stair treads and stringers (a stringer only sits under its own tread)", () => {
    const parts = [
      board(0.1),
      joist(0),
      { ...board(0.1), id: "st1-tread-0" },
      { ...joist(0), id: "st1-str-0-0" },
    ];
    const pts = deckScrewInstances(parts);
    expect(pts).toHaveLength(2); // only the real board × joist pair
  });

  it("is capped so a very large deck never produces an unbounded instance count", () => {
    const boards = Array.from({ length: 50 }, (_, i) => board(i * 0.15));
    const joists = Array.from({ length: 50 }, (_, i) => joist(i * 0.4));
    const pts = deckScrewInstances([...boards, ...joists], 500);
    expect(pts.length).toBeLessThanOrEqual(500);
  });
});
