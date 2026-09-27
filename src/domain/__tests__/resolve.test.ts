import { describe, expect, it } from "vitest";
import { optimisePacks, productLineKey, resolveRequirements } from "../resolve";
import type { Requirement } from "../types";
import { paint, product } from "./fixtures";

describe("optimisePacks", () => {
  const line = [paint(2.5, 40), paint(5, 70), paint(10, 120), paint(15, 160)];

  it("finds the cheapest combination covering the need", () => {
    const r = optimisePacks(18, line);
    const litres = r.reduce((s, x) => s + x.qty * line.find((p) => p.sku === x.sku)!.content.amount, 0);
    const cost = r.reduce((s, x) => s + x.qty * line.find((p) => p.sku === x.sku)!.price, 0);
    expect(litres).toBeGreaterThanOrEqual(18);
    expect(cost).toBe(230); // 15 l + 5 l
  });

  it("uses a single small pack for tiny needs", () => {
    expect(optimisePacks(1.2, line)).toEqual([{ sku: line[0].sku, qty: 1 }]);
  });

  it("single-size lines just round up", () => {
    expect(optimisePacks(21.4, [product({ roles: ["laminate"], price: 150, content: { amount: 2.13, unit: "m²" } })])[0].qty).toBe(11);
  });
});

describe("productLineKey", () => {
  it("groups pack sizes of the same product", () => {
    expect(productLineKey(paint(2.5, 40))).toBe(productLineKey(paint(10, 120)));
  });
});

describe("resolveRequirements", () => {
  const catalog = [
    paint(5, 70, { quality: "standard" }),
    paint(10, 120, { quality: "standard" }),
    paint(10, 90, { name: "Vopsea Eco albă, 10 l", quality: "budget", specs: { coverageM2PerL: 7 } }),
    product({ name: "Trafalet", roles: ["paint_roller"], price: 25, content: { amount: 1, unit: "buc" }, isTool: true }),
    product({ name: "Panou 1.8", roles: ["fence_panel"], price: 300, content: { amount: 1, unit: "buc" }, specs: { heightM: 1.8 }, rating: 4.0 }),
    product({ name: "Panou 1.2", roles: ["fence_panel"], price: 200, content: { amount: 1, unit: "buc" }, specs: { heightM: 1.2 }, rating: 4.9 }),
  ];

  it("uses product coverage for areaToCover requirements", () => {
    const reqs: Requirement[] = [{ role: "interior_paint", quantity: 10, unit: "l", basis: "", areaToCover: 150 }];
    const std = resolveRequirements(reqs, catalog, { quality: "standard" });
    expect(std.lines.reduce((s, l) => s + l.provided, 0)).toBeGreaterThanOrEqual(15); // 150 / 10
    const budget = resolveRequirements(reqs, catalog, { quality: "budget" });
    expect(budget.lines[0].qty).toBe(3); // 150 / 7 = 21.4 l → 3 × 10 l
  });

  it("skips tools the member already owns", () => {
    const reqs: Requirement[] = [{ role: "paint_roller", quantity: 1, unit: "buc", basis: "", isTool: true }];
    const r = resolveRequirements(reqs, catalog, { owned: new Map([["paint_roller", { sku: "x", date: "2026-01-01" }]]) });
    expect(r.lines).toHaveLength(0);
    expect(r.skipped[0]).toMatchObject({ role: "paint_roller", reason: "owned" });
  });

  it("turns optional requirements into suggestions unless asked", () => {
    const reqs: Requirement[] = [{ role: "paint_roller", quantity: 1, unit: "buc", basis: "", isTool: true, optional: true }];
    expect(resolveRequirements(reqs, catalog).suggestions).toHaveLength(1);
    expect(resolveRequirements(reqs, catalog, { includeOptional: true }).lines).toHaveLength(1);
  });

  it("honours spec matches even over better-rated products", () => {
    const reqs: Requirement[] = [{ role: "fence_panel", quantity: 3, unit: "buc", basis: "", match: { heightM: 1.8 } }];
    const r = resolveRequirements(reqs, catalog);
    expect(r.lines[0].sku).toBe(catalog[4].sku);
  });

  it("reports roles with no product", () => {
    const r = resolveRequirements([{ role: "sprinkler", quantity: 1, unit: "buc", basis: "", isTool: true }], catalog);
    expect(r.skipped[0].reason).toBe("no_product");
  });
});

describe("optimisePacks performance", () => {
  it("stays fast for very large needs", () => {
    const line = [paint(2.5, 40), paint(5, 70), paint(10, 120), paint(15, 160)];
    const t0 = performance.now();
    optimisePacks(3500, line);
    expect(performance.now() - t0).toBeLessThan(250);
  });
});
