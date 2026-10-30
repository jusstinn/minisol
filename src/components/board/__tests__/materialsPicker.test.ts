import { describe, expect, it } from "vitest";
import { getDataSources } from "@/adapters";
import { runScriptedAgent } from "@/agent/scripted";
import type { AgentEvent, Card } from "@/agent/types";
import { getTenant } from "@/config/tenant";
import { materialGroups, optionDelta } from "../MaterialsPicker";
import { isCurrentOption } from "../OptionsStrip";

const tenant = getTenant("demo");
const sources = getDataSources(tenant.id);

async function quoteFor(message: string) {
  const customer = (await sources.loyalty.getMember("WL-RO-100231"))!;
  const events: AgentEvent[] = [];
  for await (const ev of runScriptedAgent({ sources, tenant, customer, message, state: { basket: [] }, lang: "ro" })) events.push(ev);
  return events.filter((e): e is Extract<AgentEvent, { type: "card" }> => e.type === "card").map((e) => e.card).find((c): c is Extract<Card, { kind: "quote" }> => c.kind === "quote")!;
}

describe("Materials picker: swatches from the quote's choices", () => {
  it.each([
    ["deck", "Vreau o terasă din lemn de 4 x 3 m în curte, pe pământ.", ["deck_board"]],
    ["bathroom", "Vreau să refac baia: 2,5 x 2 m, gresie și faianță.", ["floor_tiles", "wall_tiles"]],
    ["paving", "Terasă din pavele 4 × 3 m", ["pavers"]],
  ])("%s: one group per finish, the current option first-class, deltas from engine totals", async (_, msg, roles) => {
    const q = await quoteFor(msg);
    const groups = materialGroups(q.choices);
    for (const r of roles) expect(groups.map((g) => g.role)).toContain(r);
    // Only finishes that show in the sketch, never tools or fixings.
    for (const g of groups) expect(["deck_board", "laminate", "floor_tiles", "wall_tiles", "pavers", "fence_panel", "interior_paint"]).toContain(g.role);
    for (const g of groups) {
      const current = g.options.filter((o) => isCurrentOption(o, q.quote.lines, g.role));
      expect(current.length).toBe(1);
      expect(optionDelta(g, current[0], q.quote.lines)).toBe(0);
      for (const o of g.options) expect(optionDelta(g, o, q.quote.lines)).toBeCloseTo(o.total - current[0].total, 2);
    }
  }, 30000);

  it("shows nothing without choices", () => {
    expect(materialGroups(undefined)).toEqual([]);
    expect(materialGroups([])).toEqual([]);
  });
});
