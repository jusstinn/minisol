import { describe, expect, it } from "vitest";
import { applyOps, defaultLayout, fenceSegments } from "@/domain/layout";
import type { QualityTier } from "@/domain/types";
import { fitBudget, shrinkOps } from "../budgetFit";
import type { Pricer } from "../budgetFit";

/** A 4 × 3 m deck priced like the real engine roughly is: per m² by tier, plus optional extras and tools. */
const deckPrice: Pricer = async ({ scale, quality, lean }) => {
  const area = 12 * scale;
  const perM2: Record<QualityTier, number> = { budget: 300, standard: 420, premium: 560 };
  return { total: Math.round(area * perM2[quality] + 250 + (lean ? 0 : 180)) };
};
const deck = { quality: "standard" as QualityTier, canShrink: true };

describe("fitBudget", () => {
  it("says so when the list already fits", async () => {
    expect(await fitBudget({ ...deck, amount: 6000, current: 5470 }, deckPrice)).toEqual({ kind: "fits", total: 5470 });
  });

  it("drops to a cheaper tier before anything else (never upgrades)", async () => {
    // standard 12 m² = 5470 with extras; budget = 4030
    expect(await fitBudget({ ...deck, amount: 4500, current: 5470 }, deckPrice)).toEqual({ kind: "tier", quality: "budget", total: 4030 });
    // Already at the cheapest tier: no tier step, straight to the extras.
    expect(await fitBudget({ ...deck, quality: "budget", amount: 3900, current: 4030 }, deckPrice)).toEqual({ kind: "lean", total: 3850 });
  });

  it("then leaves out the optional extras", async () => {
    expect(await fitBudget({ ...deck, amount: 3900, current: 5470 }, deckPrice)).toEqual({ kind: "lean", total: 3850 });
  });

  it("then finds the largest size that fits, with real prices", async () => {
    const r = await fitBudget({ ...deck, amount: 3000, current: 5470 }, deckPrice);
    expect(r.kind).toBe("smaller");
    if (r.kind !== "smaller") return;
    expect(r.total).toBeLessThanOrEqual(3000);
    expect(r.minimum).toBe(3850);
    // (3000 − 250) / 300 / 12 ≈ 0.76 is the ceiling; bisection lands close below it.
    expect(r.scale).toBeGreaterThan(0.72);
    expect(r.scale).toBeLessThanOrEqual(0.77);
  });

  it("says what the leanest version costs when nothing fits", async () => {
    const room: Pricer = async ({ quality, lean }) => ({ total: (quality === "budget" ? 900 : 1200) + (lean ? 0 : 100) });
    expect(await fitBudget({ quality: "standard", canShrink: false, amount: 500, current: 1300 }, room)).toEqual({ kind: "over", minimum: 900 });
    // Even a quarter of the deck is over budget.
    expect(await fitBudget({ ...deck, amount: 600, current: 5470 }, deckPrice)).toEqual({ kind: "over", minimum: 3850 });
  });

  it("leaves the furniture out before making the project smaller", async () => {
    // A 1.200 lei table + BBQ on the deck.
    const furnished: Pricer = async (o) => {
      const p = (await deckPrice(o))!;
      return { total: p.total + (o.bare ? 0 : 1200) };
    };
    const base = { ...deck, current: 6670, furnished: true };
    expect(await fitBudget({ ...base, amount: 4000 }, furnished)).toEqual({ kind: "lean", total: 3850, bare: true });
    const r = await fitBudget({ ...base, amount: 3000 }, furnished);
    // A bigger deck without the furniture beats a tiny one with it.
    expect(r).toMatchObject({ kind: "smaller", bare: true, minimum: 3850 });
    if (r.kind === "smaller") expect(r.scale).toBeGreaterThan(0.72);
  });

  it("skips sizes that can't be drawn", async () => {
    const picky: Pricer = async (o) => (o.scale < 1 && o.scale > 0.5 ? null : deckPrice(o));
    const r = await fitBudget({ ...deck, amount: 3000, current: 5470 }, picky);
    expect(r).toMatchObject({ kind: "smaller" });
    if (r.kind === "smaller") expect(r.scale).toBeLessThanOrEqual(0.5);
  });
});

describe("shrinkOps", () => {
  it("shrinks a surface by area, keeping its proportions", () => {
    const l = defaultLayout("deck", { lengthM: 4, widthM: 3 });
    expect(shrinkOps(l, 0.25)).toEqual([{ op: "resize", zone: "A", w: 2, d: 1.5 }]);
    const out = applyOps(l, shrinkOps(l, 0.5)!).layout;
    expect("zones" in out && out.zones[0]).toMatchObject({ w: 2.8, d: 2.1 });
  });

  it("shortens a fence (a first stage)", () => {
    const l = defaultLayout("fence", { lengthM: 20, heightM: 1.8 });
    const out = applyOps(l, shrinkOps(l, 0.6)!).layout;
    expect(out.type === "fence" && fenceSegments(out.points).reduce((s, x) => s + x.length, 0)).toBeCloseTo(12, 1);
  });

  it("leaves rooms, walls and L-shapes alone", () => {
    expect(shrinkOps(defaultLayout("paint_room", { lengthM: 4, widthM: 3, heightM: 2.6 }), 0.5)).toBeNull();
    const l = applyOps(defaultLayout("deck", { lengthM: 4, widthM: 3 }), [{ op: "add_zone", zone: "A", side: "e", w: 2, d: 2 }]).layout;
    expect(shrinkOps(l, 0.5)).toBeNull();
  });
});
