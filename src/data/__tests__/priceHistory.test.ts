import { describe, expect, it } from "vitest";
import { DEMO_CATALOG, createDemoSources } from "@/adapters/demo";
import { getTenant } from "@/config/tenant";
import catalogJson from "@/data/catalog.json";
import type { Product } from "@/domain/types";
import { lowestPriceInWindow, priceHistory, withPriceHistory } from "../priceHistory";
import type { PricePoint } from "../priceHistory";

const TODAY = new Date("2026-09-27T10:00:00Z");
const RAW = catalogJson as unknown as Product[];
const pt = (from: string, price: number): PricePoint => ({ from, price });

describe("lowestPriceInWindow", () => {
  it("includes the price in force when the window opened and every change since", () => {
    expect(lowestPriceInWindow([pt("2026-05-01", 90), pt("2026-09-10", 100)], TODAY)).toBe(90); // raised 17 days ago
    expect(lowestPriceInWindow([pt("2026-05-01", 100), pt("2026-09-10", 80), pt("2026-09-17", 100)], TODAY)).toBe(80); // promo ended
  });

  it("ignores prices that ended before the 30-day window", () => {
    expect(lowestPriceInWindow([pt("2026-05-01", 70), pt("2026-08-01", 100)], TODAY)).toBe(100);
  });

  it("is today's price after a price cut, and handles products listed inside the window", () => {
    expect(lowestPriceInWindow([pt("2026-05-01", 120), pt("2026-09-20", 99)], TODAY)).toBe(99);
    expect(lowestPriceInWindow([pt("2026-09-20", 99)], TODAY)).toBe(99);
    expect(lowestPriceInWindow([], TODAY)).toBeUndefined();
  });
});

describe("demo price history", () => {
  it("is deterministic per SKU and ends at today's list price", () => {
    for (const p of RAW.slice(0, 40)) {
      const h = priceHistory(p, TODAY);
      expect(h).toEqual(priceHistory(p, TODAY));
      expect(h.at(-1)!.price).toBe(p.price);
    }
  });

  it("gives some products a lower 30-day price and never one above the list price", () => {
    const priced = RAW.map((p) => withPriceHistory(p, TODAY));
    const lower = priced.filter((p) => p.lowestPrice30d! < p.price);
    expect(priced.every((p) => p.lowestPrice30d! > 0 && p.lowestPrice30d! <= p.price)).toBe(true);
    expect(lower.length).toBeGreaterThan(RAW.length * 0.1);
    expect(lower.length).toBeLessThan(RAW.length * 0.6);
  });

  it("is attached by the demo adapter", async () => {
    const sources = createDemoSources(getTenant("demo"));
    const [p] = await sources.catalog.getMany([RAW[0].sku]);
    expect(p.lowestPrice30d).toBeGreaterThan(0);
    expect(DEMO_CATALOG.every((x) => typeof x.lowestPrice30d === "number")).toBe(true);
  });
});
