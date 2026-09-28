import { describe, expect, it } from "vitest";
import { eligibleOffers } from "../offers";
import { buildQuote } from "../quote";
import type { QuoteDeps } from "../quote";
import { STORES_FIXTURE, customer, offer, paint, product } from "./fixtures";

const p10 = paint(10, 200, { category: "paint" });
const board = product({ name: "Deck pin 4 m", roles: ["deck_board"], price: 50, content: { amount: 4, unit: "m" }, category: "wood", bulky: true });
const oil = product({ name: "Ulei terasă 2,5 l", roles: ["deck_oil"], price: 80, content: { amount: 2.5, unit: "l" }, category: "paint" });
const drill = product({ name: "Drill", roles: ["cordless_drill"], price: 500, content: { amount: 1, unit: "buc" }, category: "power_tools", isTool: true });
const wpc = product({ name: "Deck WPC 4 m", roles: ["deck_board"], price: 120, content: { amount: 4, unit: "m" }, category: "wood", bulky: true, specs: { material: "WPC compozit" } });
const all = [p10, board, oil, drill, wpc];

function deps(stock: Record<string, number> = {}): QuoteDeps {
  return {
    products: new Map(all.map((p) => [p.sku, p])),
    stores: STORES_FIXTURE,
    stockOf: (st, sku) => stock[`${st}:${sku}`] ?? 100,
    aisleOf: () => 7,
  };
}

describe("buildQuote", () => {
  it("prices lines and merges duplicate SKUs", () => {
    const q = buildQuote([{ sku: p10.sku, qty: 1 }, { sku: p10.sku, qty: 2 }], { customer: customer(), storeId: "a", offers: [] }, deps());
    expect(q.lines).toHaveLength(1);
    expect(q.lines[0].qty).toBe(3);
    expect(q.subtotal).toBe(600);
    expect(q.total).toBe(600);
  });

  it("ignores unknown SKUs and non-positive quantities", () => {
    const q = buildQuote([{ sku: "nope", qty: 1 }, { sku: p10.sku, qty: 0 }], { customer: customer(), storeId: "a", offers: [] }, deps());
    expect(q.lines).toHaveLength(0);
    expect(q.total).toBe(0);
  });

  it("applies only the best percentage offer per line", () => {
    const offers = [
      offer({ id: "cat10", kind: "percent_category", percent: 10, categories: ["paint"] }),
      offer({ id: "role15", kind: "percent_role", percent: 15, roles: ["interior_paint"] }),
    ];
    const q = buildQuote([{ sku: p10.sku, qty: 1 }], { customer: customer(), storeId: "a", offers }, deps());
    expect(q.lines[0].discount).toBe(30);
    expect(q.discounts).toEqual([expect.objectContaining({ offerId: "role15", amount: 30 })]);
    expect(q.total).toBe(170);
  });

  it("applies bundle-free offers once the threshold quantity is reached", () => {
    const bundle = offer({ id: "b", kind: "bundle_free_role", bundle: { requiresRole: "deck_board", requiresQty: 20, freeRole: "deck_oil" } });
    const few = buildQuote([{ sku: board.sku, qty: 19 }, { sku: oil.sku, qty: 2 }], { customer: customer(), storeId: "a", offers: [bundle] }, deps());
    expect(few.discountTotal).toBe(0);
    const many = buildQuote([{ sku: board.sku, qty: 20 }, { sku: oil.sku, qty: 2 }], { customer: customer(), storeId: "a", offers: [bundle] }, deps());
    expect(many.discountTotal).toBe(80);
    expect(many.total).toBe(20 * 50 + 80);
  });

  it("says when a chosen product makes a line unnecessary — even a free one", () => {
    const bundle = offer({ id: "b", kind: "bundle_free_role", bundle: { requiresRole: "deck_board", requiresQty: 20, freeRole: "deck_oil" } });
    const pine = buildQuote([{ sku: board.sku, qty: 20 }, { sku: oil.sku, qty: 2 }], { customer: customer(), storeId: "a", offers: [bundle] }, deps());
    expect(pine.hints.filter((h) => h.kind === "not_needed")).toEqual([]);
    const q = buildQuote([{ sku: wpc.sku, qty: 20 }, { sku: oil.sku, qty: 2 }], { customer: customer(), storeId: "a", offers: [bundle] }, deps());
    expect(q.hints).toContainEqual(expect.objectContaining({ kind: "not_needed", offerId: "b", sku: oil.sku, role: "deck_oil", because: "deck-ul WPC" }));
    // No offer involved: still flagged, with no offer id.
    const plain = buildQuote([{ sku: wpc.sku, qty: 5 }, { sku: oil.sku, qty: 2 }], { customer: customer(), storeId: "a", offers: [], lang: "en" }, deps());
    expect(plain.hints).toEqual([expect.objectContaining({ kind: "not_needed", offerId: "", because: "WPC boards" })]);
  });

  it("applies the single best basket threshold offer", () => {
    const offers = [
      offer({ id: "t50", kind: "fixed_threshold", amount: 50, minSpend: 500 }),
      offer({ id: "t150", kind: "fixed_threshold", amount: 150, minSpend: 2500 }),
    ];
    const q = buildQuote([{ sku: p10.sku, qty: 3 }], { customer: customer(), storeId: "a", offers }, deps());
    expect(q.discounts.map((d) => d.offerId)).toEqual(["t50"]);
    expect(q.total).toBe(550);
  });

  it("earns points with tier multiplier and category bonus", () => {
    const gold = customer({ tier: "Gold" });
    const q = buildQuote([{ sku: p10.sku, qty: 1 }], { customer: gold, storeId: "a", offers: [] }, deps());
    expect(q.points.earned).toBe(300); // 200 × 1.5
    const bonus = offer({ id: "x3", kind: "points_multiplier", multiplier: 3, categories: ["paint"] });
    const q2 = buildQuote([{ sku: p10.sku, qty: 1 }], { customer: gold, storeId: "a", offers: [bonus] }, deps());
    expect(q2.points.earned).toBe(900);
  });

  it("caps point redemption at 20% of the basket", () => {
    const rich = customer({ points: 100000 });
    const q = buildQuote([{ sku: p10.sku, qty: 1 }], { customer: rich, storeId: "a", offers: [] }, deps());
    expect(q.points.redeemableValue).toBeLessThanOrEqual(40);
    expect(q.points.redeemableValue).toBe(40);
    expect(q.points.totalIfRedeemed).toBe(160);
  });

  it("flags missing stock and finds a store with everything", () => {
    const q = buildQuote(
      [{ sku: board.sku, qty: 30 }, { sku: p10.sku, qty: 1 }],
      { customer: customer(), storeId: "a", offers: [] },
      deps({ [`a:${board.sku}`]: 12 }),
    );
    expect(q.availability.allInStock).toBe(false);
    expect(q.availability.missing[0]).toMatchObject({ sku: board.sku, needed: 30, available: 12 });
    expect(q.lines.find((l) => l.sku === board.sku)!.stock.status).toBe("insufficient");
    expect(q.availability.alternatives.find((a) => a.storeId === "b")!.allInStock).toBe(true);
  });

  it("uses truck delivery for bulky items", () => {
    const q = buildQuote([{ sku: board.sku, qty: 2 }], { customer: customer(), storeId: "a", offers: [] }, deps());
    expect(q.delivery.type).toBe("truck");
    const q2 = buildQuote([{ sku: p10.sku, qty: 2 }], { customer: customer(), storeId: "a", offers: [] }, deps());
    expect(q2.delivery).toMatchObject({ type: "courier", fee: 0 });
  });
});

describe("eligibleOffers", () => {
  const offers = [
    offer({ id: "public", kind: "percent_category", percent: 5, categories: ["paint"] }),
    offer({ id: "gold", kind: "percent_category", percent: 15, categories: ["paint"], eligibility: { minTier: "Gold" } }),
    offer({ id: "garden", kind: "points_multiplier", multiplier: 3, eligibility: { segments: ["garden_lover"] } }),
    offer({ id: "expired", kind: "fixed_threshold", amount: 10, minSpend: 1, validUntil: "2020-01-01" }),
  ];

  it("filters by tier, segment and validity", () => {
    const ids = eligibleOffers(offers, customer({ tier: "Silver", segments: ["garden_lover"] })).map((o) => o.id);
    expect(ids).toEqual(["public", "garden"]);
  });

  it("drops targeted offers without personalisation consent", () => {
    const ids = eligibleOffers(offers, customer({ tier: "Gold", segments: ["garden_lover"], consent: { personalization: false, location: false } })).map((o) => o.id);
    expect(ids).toEqual(["public", "gold"]);
  });
});

describe("buildQuote hardening (review findings)", () => {
  it("never lets a client-supplied role unlock an offer", () => {
    const bundle = offer({ id: "b", kind: "bundle_free_role", bundle: { requiresRole: "deck_board", requiresQty: 20, freeRole: "deck_oil" } });
    const roleOffer = offer({ id: "r", kind: "percent_role", percent: 50, roles: ["deck_oil"] });
    // A drill disguised as decking oil, next to paint disguised as deck boards.
    const q = buildQuote(
      [{ sku: p10.sku, qty: 20, role: "deck_board" }, { sku: drill.sku, qty: 1, role: "deck_oil" }],
      { customer: customer(), storeId: "a", offers: [bundle, roleOffer] },
      deps(),
    );
    expect(q.discountTotal).toBe(0);
    expect(q.lines.find((l) => l.sku === drill.sku)!.role).toBe("cordless_drill");
  });

  it("rounds before filtering so fractional quantities never produce empty lines", () => {
    const q = buildQuote([{ sku: p10.sku, qty: 0.4 }], { customer: customer(), storeId: "a", offers: [] }, deps());
    expect(q.lines).toHaveLength(0);
  });

  it("falls back to the member's home store for an unknown store id", () => {
    const q = buildQuote([{ sku: p10.sku, qty: 1 }], { customer: customer({ homeStoreId: "c" }), storeId: "nope", offers: [] }, deps());
    expect(q.storeId).toBe("c");
  });
});
