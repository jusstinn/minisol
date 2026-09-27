import { describe, expect, it } from "vitest";
import { getDataSources } from "@/adapters";
import { getTenant } from "@/config/tenant";
import { parseIntent, runScriptedAgent } from "../scripted";
import { PROJECT_STARTERS } from "@/lib/i18n";
import type { AgentEvent } from "../types";

const empty = { basket: [] };

describe("parseIntent", () => {
  it("reads a Romanian deck request with comma decimals", () => {
    const i = parseIntent("Vreau o terasă de 4,5 x 3 m în curte, pe pământ", empty);
    expect(i).toMatchObject({ kind: "project", type: "deck", params: { lengthM: 4.5, widthM: 3, base: "soil" } });
  });

  it("reads a paint request with height, doors and windows", () => {
    const i = parseIntent("I want to paint my bedroom: 4 x 3.5 m, 2.6 m high, one door and two windows", empty);
    expect(i).toMatchObject({ kind: "project", type: "paint_room", params: { lengthM: 4, widthM: 3.5, heightM: 2.6, doors: 1, windows: 2 } });
  });

  it("reads a fence length", () => {
    const i = parseIntent("Am nevoie de un gard de 20 m lungime, 1,8 m înălțime", empty);
    expect(i).toMatchObject({ kind: "project", type: "fence", params: { lengthM: 20, heightM: 1.8 } });
  });

  it("reads lawn area in mp", () => {
    expect(parseIntent("Vreau gazon nou pe 80 mp", empty)).toMatchObject({ type: "lawn", params: { areaM2: 80 } });
  });

  it("asks for dimensions when missing", () => {
    expect(parseIntent("I want new laminate flooring", empty)).toMatchObject({ kind: "project", type: "laminate_floor", missing: "dims" });
  });

  it("understands follow-ups on an existing project", () => {
    const state = { basket: [], project: { type: "deck" as const, title: "", inputs: {}, measurements: [], assumptions: [], estimate: { hoursMin: 1, hoursMax: 2, difficulty: 1 as const, people: 1 as const }, safetyNotes: [] } };
    expect(parseIntent("Variantă mai ieftină", state)).toEqual({ kind: "requality", quality: "budget" });
    expect(parseIntent("Go premium", state)).toEqual({ kind: "requality", quality: "premium" });
    expect(parseIntent("Ce oferte am?", state)).toEqual({ kind: "offers" });
    expect(parseIntent("Where is everything in stock?", state)).toEqual({ kind: "stock" });
    expect(parseIntent("Adaugă sugestiile", state)).toEqual({ kind: "add_suggestions" });
  });

  it.each(PROJECT_STARTERS.flatMap((s) => [s.promptRo, s.promptEn]))("parses starter prompt: %s", (prompt) => {
    const i = parseIntent(prompt, empty);
    expect(i.kind).toBe("project");
    if (i.kind === "project") expect(i.missing).toBeUndefined();
  });
});

describe("runScriptedAgent", () => {
  it("produces project, quote and plan cards plus a reply that quotes the real total", async () => {
    const tenant = getTenant("demo");
    const sources = getDataSources(tenant.id);
    const customer = (await sources.loyalty.getMember("WL-RO-100231"))!;
    const events: AgentEvent[] = [];
    for await (const ev of runScriptedAgent({ sources, tenant, customer, message: PROJECT_STARTERS[0].promptRo, state: empty, lang: "ro" })) {
      events.push(ev);
    }
    const kinds = events.filter((e) => e.type === "card").map((e) => (e as Extract<AgentEvent, { type: "card" }>).card.kind);
    expect(kinds).toEqual(["project", "quote", "plan"]);
    const quote = events.find((e) => e.type === "card" && e.card.kind === "quote") as Extract<AgentEvent, { type: "card" }>;
    const text = events.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("");
    const total = quote.card.kind === "quote" ? quote.card.quote.total : 0;
    expect(text).toContain(total.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    expect(events.at(-1)?.type).toBe("done");
  }, 20000);
});
