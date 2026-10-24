import type { ProjectType } from "@/domain/calculators";
import type { BasketItem } from "@/domain/quote";
import type { QualityTier } from "@/domain/types";

/**
 * "Am un buget de 3.000 lei": the best version of the project that fits a budget, found by the
 * pricing engine (never guessed). In order:
 *  1. the current list already fits;
 *  2. the best quality tier under the budget (premium → standard → budget);
 *  3. the budget tier without the optional extras;
 *  4. for things that can be smaller (deck, paving, lawn) or done in stages (fence): the largest size
 *     that fits — as a suggestion, the customer decides;
 *  5. otherwise: how much the leanest version costs.
 * Pure orchestration over a `price` callback, so it's testable without the catalogue.
 */

export interface Priced {
  total: number;
  basket: BasketItem[];
}

/** Price the project with these inputs, at this quality, with or without the optional extras. */
export type Pricer = (o: { inputs: Record<string, unknown>; quality: QualityTier; optional: boolean }) => Promise<Priced>;

export type Fit =
  | { kind: "fits"; total: number }
  | { kind: "tier"; quality: QualityTier; total: number; basket: BasketItem[] }
  | { kind: "lean"; quality: "budget"; total: number; basket: BasketItem[] }
  | { kind: "smaller"; quality: "budget"; inputs: Record<string, unknown>; total: number; basket: BasketItem[]; scale: number }
  | { kind: "over"; minimum: number };

const ORDER: QualityTier[] = ["premium", "standard", "budget"];
const r1 = (v: number) => Math.floor(v * 10) / 10;

/** The inputs scaled down by `s` (area or length), or null when this project can't sensibly shrink. */
export function scaled(type: ProjectType, inputs: Record<string, unknown>, s: number): Record<string, unknown> | null {
  const num = (k: string) => (typeof inputs[k] === "number" ? (inputs[k] as number) : undefined);
  if (type === "lawn") {
    const a = num("areaM2");
    return a ? { ...inputs, areaM2: Math.max(5, Math.floor(a * s)) } : null;
  }
  if (type === "fence") {
    const l = num("lengthM");
    return l ? { ...inputs, lengthM: Math.max(2, r1(l * s)) } : null;
  }
  if (type === "deck" || type === "paving") {
    const l = num("lengthM");
    const w = num("widthM");
    if (!l || !w || Array.isArray(inputs.zones)) return null; // L/U shapes: no single "smaller" answer
    const k = Math.sqrt(s);
    const rest = { ...inputs };
    delete rest.areaM2;
    return { ...rest, lengthM: Math.max(1, r1(l * k)), widthM: Math.max(1, r1(w * k)) };
  }
  // Rooms and walls are the size they are.
  return null;
}

export async function fitBudget(
  o: { amount: number; current: number; type: ProjectType; inputs: Record<string, unknown>; quality: QualityTier },
  price: Pricer,
): Promise<Fit> {
  if (o.current <= o.amount) return { kind: "fits", total: o.current };

  // 2. The best tier that fits (only tiers at or below the current quality: "fit my budget" isn't "upgrade me").
  const below = ORDER.slice(ORDER.indexOf(o.quality));
  for (const q of below) {
    if (q === o.quality) continue;
    const p = await price({ inputs: o.inputs, quality: q, optional: true });
    if (p.total <= o.amount) return { kind: "tier", quality: q, total: p.total, basket: p.basket };
  }

  // 3. Leanest: budget tier, essentials only.
  const lean = await price({ inputs: o.inputs, quality: "budget", optional: false });
  if (lean.total <= o.amount) return { kind: "lean", quality: "budget", total: lean.total, basket: lean.basket };

  // 4. Smaller (or in stages): the largest scale that fits, by bisection on the real prices.
  if (!scaled(o.type, o.inputs, 0.5)) return { kind: "over", minimum: lean.total };
  let lo = 0.1;
  let hi = 1;
  let best: { s: number; inputs: Record<string, unknown>; p: Priced } | null = null;
  for (let k = 0; k < 9; k++) {
    const s = (lo + hi) / 2;
    const inputs = scaled(o.type, o.inputs, s)!;
    const p = await price({ inputs, quality: "budget", optional: false });
    if (p.total <= o.amount) {
      best = { s, inputs, p };
      lo = s;
    } else hi = s;
  }
  if (!best) return { kind: "over", minimum: lean.total };
  return { kind: "smaller", quality: "budget", inputs: best.inputs, total: best.p.total, basket: best.p.basket, scale: Math.round(best.s * 100) / 100 };
}
