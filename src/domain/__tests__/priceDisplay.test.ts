import { describe, expect, it } from "vitest";
import { isPersonalisedOffer } from "../offers";
import { buildQuote, measurePriceOf, referencePrice } from "../quote";
import type { QuoteDeps } from "../quote";
import type { Offer, Product } from "../types";
import { STORES_FIXTURE, customer, offer, paint, product } from "./fixtures";

/**
 * Price-display rules a Romanian/EU retailer must follow: Omnibus prior price on
 * reductions, personalised-price flag, unit price per measure.
 */

const paintWasCheaper = paint(10, 200, { lowestPrice30d: 180 });
const paintStable = paint(10, 200);
const board = product({ name: "Deck pin 4 m", roles: ["deck_board"], price: 50, content: { amount: 4, unit: "m" }, category: "wood" });
const oil = product({ name: "Ulei terasă 2,5 l", roles: ["deck_oil"], price: 80, lowestPrice30d: 72, content: { amount: 2.5, unit: "l" }, category: "paint" });
const drill = product({ name: "Drill", roles: ["cordless_drill"], price: 500, content: { amount: 1, unit: "buc" }, category: "power_tools", isTool: true });
const primer1l = product({ name: "Grund 1 l", roles: ["primer"], price: 24.9, content: { amount: 1, unit: "l" }, category: "paint" });
const spacers = product({ name: "Cruciulițe 250 buc", roles: ["tile_spacers"], price: 6.9, content: { amount: 250, unit: "buc" }, salesUnit: "pachet", category: "tiles" });
const all: Product[] = [paintWasCheaper, paintStable, board, oil, drill, primer1l, spacers];

const deps: QuoteDeps = {
  products: new Map(all.map((p) => [p.sku, p])),
  stores: STORES_FIXTURE,
  stockOf: () => 100,
  aisleOf: () => 3,
};

const quote = (items: { sku: string; qty: number }[], offers: Offer[] = [], c = customer()) => buildQuote(items, { customer: c, storeId: "a", offers }, deps);
const line = (q: ReturnType<typeof quote>, sku: string) => q.lines.find((l) => l.sku === sku)!;

const paint15 = offer({ id: "paint15", kind: "percent_role", percent: 15, roles: ["interior_paint"] });
const paint5 = offer({ id: "paint5", kind: "percent_role", percent: 5, roles: ["interior_paint"] });

describe("prior price on reductions (Omnibus, Dir. 98/6/EC art. 6a)", () => {
  it("measures a reduction from the lowest price of the last 30 days, not today's list price", () => {
    const q = quote([{ sku: paintWasCheaper.sku, qty: 2 }], [paint15]);
    const l = line(q, paintWasCheaper.sku);
    expect(l.netTotal).toBe(340); // 2 × 200 − 15 %
    expect(l.referenceUnitPrice).toBe(180);
    expect(l.referenceTotal).toBe(360); // what the UI may cross out — not 400
    expect(q.compareAt).toBe(360);
    expect(q.saving).toBe(20);
  });

  it("uses today's list price as the reference when the price has not changed", () => {
    const q = quote([{ sku: paintStable.sku, qty: 1 }], [paint15]);
    expect(line(q, paintStable.sku)).toMatchObject({ referenceUnitPrice: 200, referenceTotal: 200, netTotal: 170 });
    expect(q.saving).toBe(30);
  });

  it("shows nothing crossed out when the offer does not beat the 30-day lowest", () => {
    const q = quote([{ sku: paintWasCheaper.sku, qty: 1 }], [paint5]);
    const l = line(q, paintWasCheaper.sku);
    expect(l.discount).toBe(10); // the member still gets the offer…
    expect(l.netTotal).toBe(190);
    expect(l.referenceUnitPrice).toBeUndefined(); // …but 200 may not be shown as a "was" price
    expect(l.referenceTotal).toBeUndefined();
    expect(q.compareAt).toBe(190);
    expect(q.saving).toBe(0);
  });

  it("has no reference price when there is no reduction", () => {
    const q = quote([{ sku: paintWasCheaper.sku, qty: 1 }, { sku: drill.sku, qty: 1 }]);
    for (const l of q.lines) {
      expect(l.referenceUnitPrice).toBeUndefined();
      expect(l.referenceTotal).toBeUndefined();
    }
    expect(q.saving).toBe(0);
    expect(q.compareAt).toBe(q.total);
  });

  it("never uses a 30-day price above today's list price", () => {
    const bad = paint(10, 200, { lowestPrice30d: 260 });
    expect(referencePrice(bad)).toBe(200);
    expect(referencePrice(paint(10, 200, { lowestPrice30d: Number.NaN }))).toBe(200);
    expect(referencePrice(paintWasCheaper)).toBe(180);
  });

  it("references a bundle's free unit at its 30-day lowest price", () => {
    const bundle = offer({ id: "oil", kind: "bundle_free_role", bundle: { requiresRole: "deck_board", requiresQty: 20, freeRole: "deck_oil" } });
    const q = quote([{ sku: board.sku, qty: 20 }, { sku: oil.sku, qty: 1 }], [bundle]);
    expect(line(q, oil.sku)).toMatchObject({ netTotal: 0, referenceUnitPrice: 72, referenceTotal: 72 });
    expect(line(q, board.sku).referenceTotal).toBeUndefined();
    expect(q.saving).toBe(72); // not the 80 list price
  });

  it("counts basket-level vouchers in the saving", () => {
    const t50 = offer({ id: "t50", kind: "fixed_threshold", amount: 50, minSpend: 500 });
    const q = quote([{ sku: drill.sku, qty: 1 }], [t50]);
    expect(q.compareAt).toBe(500);
    expect(q.total).toBe(450);
    expect(q.saving).toBe(50);
  });
});

describe("unit price per measure (Dir. 98/6/EC)", () => {
  it("prices packs per litre, metre, m² or piece", () => {
    const q = quote([{ sku: paintStable.sku, qty: 1 }, { sku: board.sku, qty: 3 }, { sku: spacers.sku, qty: 1 }]);
    expect(line(q, paintStable.sku).measurePrice).toEqual({ price: 20, unit: "l" });
    expect(line(q, board.sku).measurePrice).toEqual({ price: 12.5, unit: "m" });
    expect(line(q, spacers.sku).measurePrice).toEqual({ price: 0.0276, unit: "buc" });
    expect(measurePriceOf(product({ roles: ["laminate"], price: 99.9, content: { amount: 2.13, unit: "m²" } }))).toEqual({ price: 46.9014, unit: "m²" });
  });

  it("gives none for single pieces or when it equals the selling price", () => {
    const q = quote([{ sku: drill.sku, qty: 2 }, { sku: primer1l.sku, qty: 1 }]);
    expect(line(q, drill.sku).measurePrice).toBeUndefined();
    expect(line(q, primer1l.sku).measurePrice).toBeUndefined();
  });
});

describe("personalised prices (CRD art. 6(1)(ea))", () => {
  it("classifies tier, segment and member offers as personalised, open offers as not", () => {
    expect(isPersonalisedOffer(offer({ id: "all", kind: "percent_category" }))).toBe(false);
    expect(isPersonalisedOffer(offer({ id: "bronze", kind: "percent_category", eligibility: { minTier: "Bronze" } }))).toBe(false);
    expect(isPersonalisedOffer(offer({ id: "gold", kind: "percent_category", eligibility: { minTier: "Gold" } }))).toBe(true);
    expect(isPersonalisedOffer(offer({ id: "seg", kind: "percent_category", eligibility: { segments: ["renovator"] } }))).toBe(true);
    expect(isPersonalisedOffer(offer({ id: "me", kind: "percent_category", eligibility: { memberIds: ["WL-TEST"] } }))).toBe(true);
  });

  it("flags lines discounted by a member-targeted offer", () => {
    const gold = offer({ id: "gold", kind: "percent_role", percent: 15, roles: ["interior_paint"], eligibility: { minTier: "Gold" } });
    const pub = offer({ id: "pub", kind: "percent_category", percent: 10, categories: ["power_tools"] });
    const q = quote([{ sku: paintStable.sku, qty: 1 }, { sku: drill.sku, qty: 1 }, { sku: board.sku, qty: 1 }], [gold, pub], customer({ tier: "Gold" }));
    expect(line(q, paintStable.sku).personalised).toBe(true);
    expect(line(q, drill.sku).personalised).toBe(false); // open to every member
    expect(line(q, board.sku).personalised).toBe(false); // no discount at all
    expect(q.discounts.find((d) => d.offerId === "gold")!.personalised).toBe(true);
    expect(q.discounts.find((d) => d.offerId === "pub")!.personalised).toBe(false);
    expect(q.personalisedPricing).toBe(true);
  });

  it("flags a segment-targeted bundle on the free line", () => {
    const bundle = offer({
      id: "oil",
      kind: "bundle_free_role",
      bundle: { requiresRole: "deck_board", requiresQty: 20, freeRole: "deck_oil" },
      eligibility: { segments: ["garden_lover"] },
    });
    const q = quote([{ sku: board.sku, qty: 20 }, { sku: oil.sku, qty: 1 }], [bundle]);
    expect(line(q, oil.sku).personalised).toBe(true);
    expect(line(q, board.sku).personalised).toBe(false);
  });

  it("discloses personalised basket vouchers and stays silent for open offers only", () => {
    const welcome = offer({ id: "welcome", kind: "fixed_threshold", amount: 50, minSpend: 100, eligibility: { segments: ["new_member"] } });
    const q = quote([{ sku: drill.sku, qty: 1 }], [welcome]);
    expect(q.lines.some((l) => l.personalised)).toBe(false);
    expect(q.discounts[0].personalised).toBe(true);
    expect(q.personalisedPricing).toBe(true);

    const pub = offer({ id: "pub", kind: "percent_category", percent: 10, categories: ["power_tools"] });
    expect(quote([{ sku: drill.sku, qty: 1 }], [pub]).personalisedPricing).toBe(false);
  });
});
