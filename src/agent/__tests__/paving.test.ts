import { afterEach, describe, expect, it, vi } from "vitest";
import { getDataSources } from "@/adapters";
import { getTenant } from "@/config/tenant";
import type { ProjectType } from "@/domain/calculators";
import type { Lang } from "@/domain/types";
import { parseIntent, runScriptedAgent } from "../scripted";
import type { AgentEvent, Card, SessionState } from "../types";

const empty: SessionState = { basket: [] };
const on = (type: ProjectType): SessionState => ({
  basket: [],
  project: { type, title: "", inputs: {}, measurements: [], assumptions: [], estimate: { hoursMin: 1, hoursMax: 2, difficulty: 1, people: 1 }, safetyNotes: [] },
});

describe("paving requests (offline parser)", () => {
  it.each([
    ["Vreau o alee din pavele de 6 x 1,2 m prin grădină", { lengthM: 6, widthM: 1.2, use: "path" }],
    ["Terasă din pavele 4 × 3 m", { lengthM: 4, widthM: 3, use: "patio" }],
    ["curte pavată de 8 x 6 m", { lengthM: 8, widthM: 6, use: "patio" }],
    ["Intrare auto din pavele 5 × 3 m", { lengthM: 5, widthM: 3, use: "driveway" }],
    ["un loc de parcare pavat de 5 x 2,5 m", { lengthM: 5, widthM: 2.5, use: "driveway" }],
    ["vreau să pun dale de beton pe o alee de 10 x 1 m", { lengthM: 10, widthM: 1, use: "path" }],
    ["30 mp de pavaj în curte", { lengthM: 5.48, widthM: 5.48, use: "patio" }],
    ["alee din pavele fără borduri 5 x 1", { lengthM: 5, widthM: 1, use: "path", edging: false }],
    ["I want a 6 x 1.2 m paver path through the garden", { lengthM: 6, widthM: 1.2, use: "path" }],
    ["Paved driveway 6 by 3 m", { lengthM: 6, widthM: 3, use: "driveway" }],
    ["a 4 x 3 m patio", { lengthM: 4, widthM: 3, use: "patio" }],
    ["Paving slabs for a garden path 8 x 0.9 m, no edging", { lengthM: 8, widthM: 0.9, use: "path", edging: false }],
  ])("%s", (msg, params) => {
    expect(parseIntent(msg, empty)).toMatchObject({ kind: "project", type: "paving", params });
  });

  it("timber stays a deck; a fence's driveway gate stays a gate", () => {
    expect(parseIntent("Terasă 4 × 3 m", empty)).toMatchObject({ type: "deck" });
    expect(parseIntent("a wooden patio deck 4 x 3 m", empty)).toMatchObject({ type: "deck" });
    expect(parseIntent("add a driveway gate", on("fence"))).toMatchObject({ kind: "sketch", edits: [{ op: "add_opening", kind: "gate", width: 3 }] });
  });

  it("asks for the size when there is none", () => {
    expect(parseIntent("vreau o alee din pavele", empty)).toMatchObject({ kind: "project", type: "paving", missing: "dims" });
  });
});

describe("follow-ups on a paving project", () => {
  it.each([
    ["Fă-o în L: +1,2 × 3 m în dreapta", [{ op: "add_zone", side: "e", w: 1.2, d: 3 }]],
    ["Make it L-shaped: +1.2 × 3 m on the right", [{ op: "add_zone", side: "e", w: 1.2, d: 3 }]],
    ["fă-o 8 x 1,5 m", [{ op: "resize", w: 8, d: 1.5 }]],
    ["fă-o pentru mașini", [{ op: "set_option", key: "use", value: "driveway" }]],
    ["make it a driveway", [{ op: "set_option", key: "use", value: "driveway" }]],
    ["Fără borduri", [{ op: "set_option", key: "edging", value: false }]],
    ["no edging", [{ op: "set_option", key: "edging", value: false }]],
    ["Borduri pe margini", [{ op: "set_option", key: "edging", value: true }]],
    // "terasă" on a paving project is the paved patio, not a new deck
    ["Pune o masă pe terasă", [{ op: "add_item", item: "table" }]],
    ["Put a table on the patio", [{ op: "add_item", item: "table" }]],
    ["Pune o lampă de grădină", [{ op: "add_item", item: "garden_light" }]],
  ])("%s", (msg, edits) => {
    expect(parseIntent(msg, on("paving"))).toMatchObject({ kind: "sketch", edits });
  });

  it("shows, swaps and removes its materials", () => {
    expect(parseIntent("Arată-mi piatra spartă", on("paving"))).toMatchObject({ kind: "view", command: { highlight: "paving_base" } });
    expect(parseIntent("Show me the edging", on("paving"))).toMatchObject({ kind: "view", command: { highlight: "paving_edging" } });
    expect(parseIntent("arată-mi betonul pentru borduri", on("paving"))).toMatchObject({ kind: "view", command: { highlight: "kerb_concrete" } });
    expect(parseIntent("Alege pavelele antracit", on("paving"))).toMatchObject({ kind: "choose" });
    expect(parseIntent("scoate betonul uscat", on("paving"))).toMatchObject({ kind: "remove" });
    // a timber deck is still a different project
    expect(parseIntent("vreau o terasă din lemn de 4 x 3 m", on("paving"))).toMatchObject({ kind: "project", type: "deck" });
  });
});

describe("a paving project, end to end (offline agent)", () => {
  const tenant = getTenant("demo");
  const sources = getDataSources(tenant.id);
  afterEach(() => vi.useRealTimers());

  async function run(message: string, state: SessionState, lang: Lang = "ro") {
    const customer = (await sources.loyalty.getMember(lang === "en" ? "WL-RO-309877" : "WL-RO-100231"))!;
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const events: AgentEvent[] = [];
    let done = false;
    const p = (async () => {
      for await (const ev of runScriptedAgent({ sources, tenant, customer, message, state, lang })) events.push(ev);
    })().finally(() => (done = true));
    while (!done) await vi.advanceTimersByTimeAsync(2000);
    await p;
    vi.useRealTimers();
    const cards = events.filter((e): e is Extract<AgentEvent, { type: "card" }> => e.type === "card").map((e) => e.card);
    const text = events.filter((e): e is Extract<AgentEvent, { type: "text" }> => e.type === "text").map((e) => e.delta).join("");
    return { cards, text, state: events.filter((e): e is Extract<AgentEvent, { type: "state" }> => e.type === "state").at(-1)?.state ?? state };
  }
  const quoteOf = (cards: Card[]) => cards.filter((c): c is Extract<Card, { kind: "quote" }> => c.kind === "quote").at(-1)!;

  it("starter → L → table → anthracite pavers: the list and the look follow every step", async () => {
    const first = await run("Vreau o alee din pavele de 6 x 1,2 m prin grădină, cu borduri pe margini.", empty);
    expect(first.state.project).toMatchObject({ type: "paving", title: "Alee din pavele", layout: { use: "path", edging: true } });
    expect(first.cards.map((c) => c.kind)).toEqual(expect.arrayContaining(["project", "quote", "plan"]));
    const q0 = quoteOf(first.cards);
    for (const role of ["pavers", "paving_base", "paving_sand", "joint_sand", "paving_edging", "kerb_concrete", "weed_membrane"]) {
      expect(q0.quote.lines.some((l) => l.role === role), role).toBe(true);
    }
    expect(q0.look?.pavers?.w).toBeCloseTo(0.3);
    expect(first.text).toMatch(/alee din pavele costă/);

    const l = await run("Fă-o în L: +1,2 × 3 m în dreapta", first.state);
    expect(l.cards.map((c) => c.kind)).toContain("change");
    expect(l.state.project?.layout?.type === "paving" && l.state.project.layout.zones).toHaveLength(2);
    const pavers = (s: SessionState) => s.basket.filter((b) => b.role === "pavers").reduce((n, b) => n + b.qty, 0);
    expect(pavers(l.state)).toBeGreaterThan(pavers(first.state));

    const table = await run("pune o masă", l.state);
    expect(table.cards.map((c) => c.kind)).toContain("change");
    expect(table.state.basket.some((b) => b.role === "garden_furniture")).toBe(true);

    const swap = await run("Alege pavelele antracit", table.state);
    const q = quoteOf(swap.cards);
    const line = q.quote.lines.find((x) => x.role === "pavers")!;
    expect(line.name).toMatch(/antracit/);
    expect(q.look?.pavers?.color).not.toBe(q0.look?.pavers?.color);
    expect(q.look?.pavers?.color).toMatch(/^#3/); // dark anthracite, redrawn in the sketch
    // the sketch (L + table) survived the swap
    expect(swap.state.project?.layout?.items).toHaveLength(1);
  }, 60000);

  it("a driveway in English gets 8 cm pavers and the kerbs for it", async () => {
    const r = await run("Paved driveway 5 x 3 m", empty, "en");
    const q = quoteOf(r.cards).quote;
    const products = new Map((await sources.catalog.getMany(q.lines.map((x) => x.sku))).map((p) => [p.sku, p]));
    const paver = products.get(q.lines.find((x) => x.role === "pavers")!.sku)!;
    const kerb = products.get(q.lines.find((x) => x.role === "paving_edging")!.sku)!;
    expect(paver.specs.thicknessMm).toBe(80);
    expect(kerb.specs.thicknessMm).toBe(100);
    expect(r.text).toMatch(/paved driveway comes to/i);
  }, 30000);
});
