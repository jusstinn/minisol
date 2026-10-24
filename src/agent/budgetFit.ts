import { fenceSegments, isZoned } from "@/domain/layout";
import type { Layout, SketchOp } from "@/domain/layout";
import type { QualityTier } from "@/domain/types";

/**
 * "Am un buget de 3.000 lei": the best version of the project that fits a budget, found by the
 * pricing engine (never guessed). In order:
 *  1. the current list already fits;
 *  2. the best quality tier under the budget (premium → standard → budget);
 *  3. the budget tier without the optional extras — then also without the furniture placed in it
 *     (a table, a BBQ: not part of the build);
 *  4. for things that can be smaller (deck, paving, lawn) or done in stages (fence): the largest size
 *     that fits — as a suggestion, the customer decides;
 *  5. otherwise: how much the leanest version costs.
 * Pure orchestration over a `price` callback, so it's testable without the catalogue.
 */

/**
 * Price the project at `scale` (1 = as drawn; 0.5 = half the area, or half the fence),
 * at this quality, `lean` = without the optional extras, `bare` = also without the furniture.
 * null when that version can't be drawn.
 */
export type Pricer = (o: { scale: number; quality: QualityTier; lean: boolean; bare?: boolean }) => Promise<{ total: number } | null>;

export type Fit =
  | { kind: "fits"; total: number }
  | { kind: "tier"; quality: QualityTier; total: number }
  | { kind: "lean"; total: number; /** Also without the furniture. */ bare?: boolean }
  | { kind: "smaller"; scale: number; total: number; /** The leanest full-size version. */ minimum: number; bare?: boolean }
  | { kind: "over"; minimum: number };

const ORDER: QualityTier[] = ["premium", "standard", "budget"];
/** Below a quarter of the size it's no longer the same project. */
const MIN_SCALE = 0.25;
const floor1 = (v: number) => Math.floor(v * 10 + 1e-9) / 10;

/**
 * The sketch edits that make this project `s` times as big (area for surfaces, length for a fence),
 * keeping its proportions — or null when it can't sensibly shrink (rooms and walls are the size
 * they are; an L-shape has no single "smaller").
 */
export function shrinkOps(layout: Layout, s: number): SketchOp[] | null {
  if (layout.type === "fence") {
    const total = fenceSegments(layout.points).reduce((sum, x) => sum + x.length, 0);
    return total > 0 ? [{ op: "resize", w: Math.max(2, floor1(total * s)) }] : null;
  }
  if ((layout.type === "deck" || layout.type === "paving" || layout.type === "lawn") && isZoned(layout) && layout.zones.length === 1) {
    const z = layout.zones[0];
    const k = Math.sqrt(s);
    return [{ op: "resize", zone: z.id, w: Math.max(1, floor1(z.w * k)), d: Math.max(1, floor1(z.d * k)) }];
  }
  return null;
}

export async function fitBudget(
  o: { amount: number; current: number; quality: QualityTier; canShrink: boolean; /** Furniture that could be left out. */ furnished?: boolean },
  price: Pricer,
): Promise<Fit> {
  if (o.current <= o.amount) return { kind: "fits", total: o.current };

  // 2. The best tier that fits (only tiers below the current one: "fit my budget" isn't "upgrade me").
  for (const q of ORDER.slice(ORDER.indexOf(o.quality) + 1)) {
    const p = await price({ scale: 1, quality: q, lean: false });
    if (p && p.total <= o.amount) return { kind: "tier", quality: q, total: p.total };
  }

  // 3. Leanest: budget tier, essentials only.
  const lean = await price({ scale: 1, quality: "budget", lean: true });
  let minimum = lean?.total ?? o.current;
  if (lean && lean.total <= o.amount) return { kind: "lean", total: lean.total };
  if (o.furnished) {
    const bare = await price({ scale: 1, quality: "budget", lean: true, bare: true });
    if (bare && bare.total <= o.amount) return { kind: "lean", total: bare.total, bare: true };
    if (bare) minimum = Math.min(minimum, bare.total);
  }

  // 4. Smaller (or in stages): the largest scale that fits, by bisection on the real prices. The
  // furniture stays out — the project is the deck, not the table (that can come later).
  if (!o.canShrink) return { kind: "over", minimum };
  const bare = o.furnished === true;
  const found = await largest(o.amount, (scale) => price({ scale, quality: "budget", lean: true, bare }));
  return found ? { kind: "smaller", scale: found.s, total: found.total, minimum, ...(bare ? { bare } : {}) } : { kind: "over", minimum };
}

/** The largest scale in [MIN_SCALE, 1) whose price fits, or null. */
async function largest(amount: number, price: (scale: number) => Promise<{ total: number } | null>): Promise<{ s: number; total: number } | null> {
  const floor = await price(MIN_SCALE);
  if (!floor || floor.total > amount) return null;
  let best = { s: MIN_SCALE, total: floor.total };
  let lo = MIN_SCALE;
  let hi = 1;
  for (let k = 0; k < 8; k++) {
    const s = (lo + hi) / 2;
    const p = await price(s);
    if (p && p.total <= amount) {
      best = { s, total: p.total };
      lo = s;
    } else hi = s;
  }
  return best;
}
