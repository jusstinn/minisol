import { describe, expect, it } from "vitest";
import type { QualityTier } from "@/domain/types";
import { fitBudget, scaled } from "../budgetFit";
import type { Pricer } from "../budgetFit";

/** A deck priced like the real engine roughly is: per m² by tier, plus optional extras and tools. */
const deckPrice: Pricer = async ({ inputs, quality, optional }) => {
  const area = Number(inputs.lengthM) * Number(inputs.widthM);
  const perM2: Record<QualityTier, number> = { budget: 300, standard: 420, premium: 560 };
  const total = Math.round(area * perM2[quality] + 250 + (optional ? 180 : 0));
  return { total, basket: [{ sku: `${quality}-${area}`, qty: 1 }] };
};
const deck = { type: "deck" as const, inputs: { lengthM: 4, widthM: 3 }, quality: "standard" as QualityTier };

describe("fitBudget", () => {
  it("says so when the list already fits", async () => {
    expect(await fitBudget({ ...deck, amount: 6000, current: 5470 }, deckPrice)).toEqual({ kind: "fits", total: 5470 });
  });

  it("drops to a cheaper tier before anything else (never upgrades)", async () => {
    // standard 12 m² = 5470 with extras; budget = 4030
    const r = await fitBudget({ ...deck, amount: 4500, current: 5470 }, deckPrice);
    expect(r).toMatchObject({ kind: "tier", quality: "budget", total: 4030 });
  });

  it("then leaves out the optional extras", async () => {
    const r = await fitBudget({ ...deck, amount: 3900, current: 5470 }, deckPrice);
    expect(r).toMatchObject({ kind: "lean", quality: "budget", total: 3850 });
  });

  it("then finds the largest deck that fits, with real prices", async () => {
    const r = await fitBudget({ ...deck, amount: 3000, current: 5470 }, deckPrice);
    expect(r.kind).toBe("smaller");
    if (r.kind !== "smaller") return;
    expect(r.total).toBeLessThanOrEqual(3000);
    const area = Number(r.inputs.lengthM) * Number(r.inputs.widthM);
    expect(area).toBeGreaterThan(8.2); // (3000-250)/300 ≈ 9.2 m² is the ceiling; bisection lands close
    expect(area).toBeLessThanOrEqual(9.2);
    // Keeps the proportions roughly.
    expect(Number(r.inputs.lengthM) / Number(r.inputs.widthM)).toBeCloseTo(4 / 3, 0);
  });

  it("rooms don't shrink: it says what the leanest version costs", async () => {
    const room: Pricer = async ({ quality, optional }) => ({ total: (quality === "budget" ? 900 : 1200) + (optional ? 100 : 0), basket: [] });
    const r = await fitBudget({ type: "paint_room", inputs: { lengthM: 4, widthM: 3.5 }, quality: "standard", amount: 500, current: 1300 }, room);
    expect(r).toEqual({ kind: "over", minimum: 900 });
  });
});

describe("scaled", () => {
  it("shrinks by area or length, and leaves rooms and L-shapes alone", () => {
    expect(scaled("deck", { lengthM: 4, widthM: 3, areaM2: 12 }, 0.25)).toEqual({ lengthM: 2, widthM: 1.5 });
    expect(scaled("lawn", { areaM2: 80 }, 0.5)).toEqual({ areaM2: 40 });
    expect(scaled("fence", { lengthM: 20, heightM: 1.8 }, 0.6)).toEqual({ lengthM: 12, heightM: 1.8 });
    expect(scaled("paint_room", { lengthM: 4, widthM: 3 }, 0.5)).toBeNull();
    expect(scaled("deck", { lengthM: 6, widthM: 4, zones: [{}, {}] }, 0.5)).toBeNull();
  });
});
