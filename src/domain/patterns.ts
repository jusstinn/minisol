import type { Lang } from "./types";

/**
 * Laying patterns: how pavers are bonded and how deck boards are laid. They change the
 * quantity (every pattern wastes a different amount in cuts), the substructure (a diagonal
 * deck needs closer joists) and the 3D sketch, so the calculator, the layout validation and
 * the builders all read their rules from here.
 *
 * The waste factors are the trade rules of thumb that paver and decking suppliers print on
 * their calculators: a plain bond only wastes the cut at each end of a row, while a pattern
 * whose pieces run at an angle to the edge (herringbone, a diagonal deck) wastes a triangle
 * at every cut.
 */

// ───────────────────────────── paving bonds ─────────────────────────────

export const PAVING_BONDS = ["running", "herringbone", "basketweave", "stack"] as const;
export type PavingBond = (typeof PAVING_BONDS)[number];

export const isPavingBond = (v: unknown): v is PavingBond => (PAVING_BONDS as readonly unknown[]).includes(v);

const BOND_ALIASES: Record<string, PavingBond> = {
  stretcher: "running",
  stretcher_bond: "running",
  running_bond: "running",
  herring_bone: "herringbone",
  basket: "basketweave",
  basket_weave: "basketweave",
  stack_bond: "stack",
  grid: "stack",
};

/** A bond from the model's or the UI's words ("Herringbone", "stretcher", "stack bond"); undefined if it isn't one. */
export function parsePavingBond(v: unknown): PavingBond | undefined {
  const k = String(v ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return isPavingBond(k) ? k : BOND_ALIASES[k];
}

/** What a plain request gets: the bond the sketch always drew and the calculator always priced. */
export const DEFAULT_PAVING_BOND: PavingBond = "running";

/** Extra pavers for cuts, as a fraction of the paved area, on a single rectangle. */
export const PAVING_BOND_WASTE: Record<PavingBond, number> = {
  /** Stretcher bond: only the cut at the end of each row (2 per row, half a paver each, ~5%). */
  running: 0.05,
  /** 90° herringbone: both ends of every row are saw-toothed, each tooth a cut paver (~10%). */
  herringbone: 0.1,
  /** Pairs of pavers in a chessboard: the edge blocks need cutting two at a time (~7%). */
  basketweave: 0.07,
  /** Grid: the same cut as a running bond, and no half-paver offset to fill (~5%). */
  stack: 0.05,
};

/** More corners (an L or U shape) mean more cuts, whatever the bond: the old 5% → 7% rule. */
export const PAVING_EXTRA_ZONE_WASTE = 0.02;

/** Waste factor for a paving job: per bond, plus a little more when the outline has several zones. */
export function pavingWaste(bond: PavingBond | undefined, zoneCount: number): number {
  const base = PAVING_BOND_WASTE[bond ?? DEFAULT_PAVING_BOND];
  return Math.round((base + (zoneCount > 1 ? PAVING_EXTRA_ZONE_WASTE : 0)) * 1000) / 1000;
}

export const PAVING_BOND_LABEL: Record<PavingBond, { ro: string; en: string }> = {
  running: { ro: "În rânduri decalate", en: "Running bond" },
  herringbone: { ro: "În spic", en: "Herringbone" },
  basketweave: { ro: "În coș", en: "Basketweave" },
  stack: { ro: "În linie", en: "Stack bond" },
};

/** Words for the change card ("Model în spic"). */
export const PAVING_BOND_SAYS: Record<PavingBond, { ro: string; en: string }> = {
  running: { ro: "Pavele în rânduri decalate", en: "Pavers in running bond" },
  herringbone: { ro: "Pavele în spic", en: "Pavers in herringbone" },
  basketweave: { ro: "Pavele în coș", en: "Pavers in basketweave" },
  stack: { ro: "Pavele în linie", en: "Pavers in stack bond" },
};

// ───────────────────────────── deck board layouts ─────────────────────────────

export const DECK_BOARD_LAYOUTS = ["straight", "diagonal", "frame"] as const;
export type DeckBoardLayout = (typeof DECK_BOARD_LAYOUTS)[number];

export const isDeckBoardLayout = (v: unknown): v is DeckBoardLayout => (DECK_BOARD_LAYOUTS as readonly unknown[]).includes(v);

export const DEFAULT_DECK_BOARDS: DeckBoardLayout = "straight";

const BOARD_ALIASES: Record<string, DeckBoardLayout> = {
  diagonally: "diagonal",
  picture_frame: "frame",
  border: "frame",
  framed: "frame",
  perimeter: "frame",
};

/** A deck board layout from the model's or the UI's words; undefined if it isn't one. */
export function parseDeckBoards(v: unknown): DeckBoardLayout | undefined {
  const k = String(v ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return isDeckBoardLayout(k) ? k : BOARD_ALIASES[k];
}

/** Board waste: straight boards 10%; diagonal boards 20% (every board is cut at 45° at both ends). */
export const DECK_BOARD_WASTE: Record<DeckBoardLayout, number> = { straight: 0.1, diagonal: 0.2, frame: 0.1 };
/** The frame's own boards are mitred at the corners: each cut leaves an offcut. */
export const DECK_FRAME_WASTE = 0.15;
/** Joist spacing, m: 40 cm under straight boards, 30 cm under boards at 45° (they span further between joists). */
export const DECK_JOIST_SPACING: Record<DeckBoardLayout, number> = { straight: 0.4, diagonal: 0.3, frame: 0.4 };
/** A board 145 mm wide with a 5 mm gap. */
export const DECK_BOARD_PITCH = 0.15;

export const DECK_BOARD_LABEL: Record<DeckBoardLayout, { ro: string; en: string }> = {
  straight: { ro: "Drept", en: "Straight" },
  diagonal: { ro: "Pe diagonală", en: "Diagonal" },
  frame: { ro: "Cu ramă", en: "Picture frame" },
};

export const DECK_BOARD_SAYS: Record<DeckBoardLayout, { ro: string; en: string }> = {
  straight: { ro: "Deck montat drept", en: "Boards laid straight" },
  diagonal: { ro: "Deck montat pe diagonală (grinzi la 30 cm)", en: "Boards laid diagonally (joists at 30 cm)" },
  frame: { ro: "Deck cu ramă de scânduri pe margini", en: "Boards with a picture-frame border" },
};

/** What each pattern means in a few words, for the picker and the plan editor. */
export function patternHint(kind: "bond" | "boards", value: string, lang: Lang): string {
  const en = lang === "en";
  if (kind === "bond") {
    const waste = isPavingBond(value) ? Math.round(PAVING_BOND_WASTE[value] * 100) : 5;
    return en ? `${waste}% spare pavers` : `${waste}% rezervă de pavele`;
  }
  if (value === "diagonal") return en ? "+10% boards, joists at 30 cm" : "+10% deck, grinzi la 30 cm";
  if (value === "frame") return en ? "Border boards, mitred corners" : "Scânduri pe margini, colțuri la 45°";
  return en ? "10% spare boards" : "10% rezervă de deck";
}

// ───────────────────────────── picture-frame geometry ─────────────────────────────

interface FrameZone {
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface FrameSides {
  n: boolean;
  e: boolean;
  s: boolean;
  w: boolean;
}

export interface FrameLayout {
  /** The border boards on each open side: true = a board there. */
  sides: FrameSides;
  /** The area left for the field boards (zone minus the border), in the zone's own plan coordinates. */
  field: { x0: number; z0: number; x1: number; z1: number };
}

/**
 * The frame of one zone: a single border board along each open side and the rectangle left inside.
 * A zone too small to hold a border and at least two rows of field boards is laid without a frame
 * (returns null), the way a joiner would.
 */
export function deckFrameFor(zone: FrameZone, sides: FrameSides, pitch = DECK_BOARD_PITCH): FrameLayout | null {
  const field = {
    x0: zone.x + (sides.w ? pitch : 0),
    x1: zone.x + zone.w - (sides.e ? pitch : 0),
    z0: zone.z + (sides.n ? pitch : 0),
    z1: zone.z + zone.d - (sides.s ? pitch : 0),
  };
  if (!(sides.n || sides.e || sides.s || sides.w)) return null;
  if (field.x1 - field.x0 < 2 * pitch || field.z1 - field.z0 < 2 * pitch) return null;
  return { sides, field };
}

/**
 * Which sides of each zone get a border board: only a side that is open to the garden, not one
 * that continues into a neighbouring zone (an L-shape has no frame across the joint). A side
 * that is even partly shared counts as shared. Shared by the calculator and the 3D sketch so the
 * boards in the list are the boards in the drawing.
 */
export function deckFrameSides<Z extends FrameZone>(zones: Z[]): FrameSides[] {
  const eps = 0.02;
  const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > eps;
  return zones.map((z) => {
    const shared = { n: false, e: false, s: false, w: false };
    for (const o of zones) {
      if (o === z) continue;
      if (Math.abs(o.z + o.d - z.z) < eps && overlap(o.x, o.x + o.w, z.x, z.x + z.w)) shared.n = true;
      if (Math.abs(o.z - (z.z + z.d)) < eps && overlap(o.x, o.x + o.w, z.x, z.x + z.w)) shared.s = true;
      if (Math.abs(o.x + o.w - z.x) < eps && overlap(o.z, o.z + o.d, z.z, z.z + z.d)) shared.w = true;
      if (Math.abs(o.x - (z.x + z.w)) < eps && overlap(o.z, o.z + o.d, z.z, z.z + z.d)) shared.e = true;
    }
    return { n: !shared.n, e: !shared.e, s: !shared.s, w: !shared.w };
  });
}
