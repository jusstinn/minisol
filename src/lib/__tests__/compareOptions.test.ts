import { describe, expect, it } from "vitest";
import { getDataSources } from "@/adapters";
import { executeTool } from "@/agent/tools";
import type { Card } from "@/agent/types";
import { getTenant } from "@/config/tenant";
import { compareOptions } from "../compareOptions";

async function deckBoards() {
  const tenant = getTenant("hornbach");
  const sources = getDataSources(tenant.id);
  const customer = (await sources.loyalty.getMember("WL-RO-100231"))!;
  const r = await executeTool(
    "calculate_project",
    JSON.stringify({ projectType: "deck", params: { lengthM: 4, widthM: 3 }, quality: null, storeId: null, includeOptional: null, keepSketch: null }),
    { sources, customer, state: { basket: [] }, lang: "ro", now: new Date(), tenant },
  );
  const card = r.cards!.find((c): c is Extract<Card, { kind: "quote" }> => c.kind === "quote")!;
  const group = card.choices!.find((g) => g.role === "deck_board")!;
  const current = group.options.find((o) => o.items.every((it) => card.quote.lines.some((l) => l.sku === it.sku)))!;
  const wpc = group.options.find((o) => /WPC/.test(o.name))!;
  return { current, wpc };
}

describe("compareOptions", () => {
  it("compares two options sized for the same project, with the real difference", async () => {
    const { current, wpc } = await deckBoards();
    const c = compareOptions(current, wpc, "ro");
    expect(c.delta).toBeCloseTo(wpc.total - current.total, 2);
    expect(c.rows.map((r) => r.key)).toEqual(["price", "discount", "pack", "quality", "rating", "stock"]);
    const price = c.rows.find((r) => r.key === "price")!;
    expect(price.better).toBe(wpc.total < current.total ? "b" : "a");
    expect(c.summary).toMatch(/^Deck WPC/);
    expect(c.summary).toMatch(wpc.total > current.total ? /mai mult/ : /mai puțin/);
    expect(c.summary).not.toMatch(/Kronwald/);
  });

  it("marks the better side per row and says so in English", async () => {
    const { current, wpc } = await deckBoards();
    const cheap = { ...wpc, total: 100, percentOff: 0, rating: 4, quality: "budget" as const, inStock: false };
    const dear = { ...current, total: 150, percentOff: 10, rating: 4.5, quality: "premium" as const, inStock: true };
    const c = compareOptions(cheap, dear, "en");
    const better = Object.fromEntries(c.rows.map((r) => [r.key, r.better]));
    expect(better).toEqual({ price: "a", discount: "b", pack: undefined, quality: "b", rating: "b", stock: "b" });
    expect(c.delta).toBe(50);
    expect(c.deltaPct).toBe(50);
    expect(c.summary).toContain("more for your project (+50%), rated 4.5 vs 4.0.");
  });

  it("equal prices", async () => {
    const { current } = await deckBoards();
    expect(compareOptions(current, { ...current }, "ro").summary).toContain("costă la fel");
  });
});
