import { describe, expect, it } from "vitest";
import { getDataSources } from "@/adapters";
import { getTenant } from "@/config/tenant";
import { productLineKey } from "@/domain/resolve";
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

describe("sketch edits", () => {
  const deckState = { basket: [], project: { type: "deck" as const, title: "", inputs: {}, measurements: [], assumptions: [], estimate: { hoursMin: 1, hoursMax: 2, difficulty: 1 as const, people: 1 as const }, safetyNotes: [] } };

  it("parses edits in Romanian and English", () => {
    expect(parseIntent("Adaugă 3 trepte în față", deckState)).toMatchObject({ kind: "sketch", edits: [{ op: "add_steps", side: "s", count: 3 }] });
    expect(parseIntent("Make it an L with a 2 x 2 m wing on the right", deckState)).toMatchObject({ kind: "sketch", edits: [{ op: "add_zone", side: "e", w: 2, d: 2 }] });
    expect(parseIntent("Terasa ridicată la 50 cm, cu trepte", deckState)).toMatchObject({ kind: "sketch", edits: [{ op: "set_height", value: 0.5 }, { op: "add_steps" }] });
    const fence = { ...deckState, project: { ...deckState.project, type: "fence" as const } };
    expect(parseIntent("Pune o poartă de mașină la gard", fence)).toMatchObject({ kind: "sketch", edits: [{ op: "add_opening", kind: "gate", width: 3 }] });
    const bath = { ...deckState, project: { ...deckState.project, type: "tiling" as const } };
    expect(parseIntent("Faianță doar până la 1,2 m", bath)).toMatchObject({ kind: "sketch", edits: [{ op: "set_wall_tiles", wall: "all", value: 1.2 }] });
    // a quality follow-up is still a quality follow-up
    expect(parseIntent("Variantă mai ieftină", deckState)).toEqual({ kind: "requality", quality: "budget" });
  });

  it("edits the sketch, keeps the chosen products and reports a verified price delta", async () => {
    const tenant = getTenant("demo");
    const sources = getDataSources(tenant.id);
    const customer = (await sources.loyalty.getMember("WL-RO-100231"))!;
    const run = async (message: string, state: Parameters<typeof runScriptedAgent>[0]["state"]) => {
      const events: AgentEvent[] = [];
      for await (const ev of runScriptedAgent({ sources, tenant, customer, message, state, lang: "ro" })) events.push(ev);
      const last = events.filter((e) => e.type === "state").at(-1) as Extract<AgentEvent, { type: "state" }> | undefined;
      return { events, state: last?.state ?? state };
    };
    const first = await run("Vreau o terasă de 4 x 3 m pe pământ", empty);
    const boards0 = first.state.basket.find((b) => b.role === "deck_board")!;
    // the customer swaps the boards for another option → that pick must survive the edit
    const second = await run("Adaugă 3 trepte în față și ridic-o la 50 cm de la sol", first.state);
    const change = second.events.find((e) => e.type === "card" && e.card.kind === "change") as Extract<AgentEvent, { type: "card" }> | undefined;
    expect(change).toBeTruthy();
    if (change?.card.kind !== "change") return;
    expect(change.card.change.delta).toBeGreaterThan(0);
    expect(change.card.change.lines.some((l) => l.role === "deck_board" && l.after > l.before)).toBe(true);
    expect(second.state.project?.layout?.type === "deck" && second.state.project.layout.steps).toHaveLength(1);
    // same product line (the board length may change to suit the new runs)
    const [p0, p1] = await sources.catalog.getMany([boards0.sku, second.state.basket.find((b) => b.role === "deck_board")!.sku]);
    expect(productLineKey(p1 ?? p0)).toBe(productLineKey(p0));
    // raised to 50 cm → supports that actually reach ~400 mm
    const sup = (await sources.catalog.getMany([second.state.basket.find((b) => b.role === "deck_support")!.sku]))[0];
    expect(sup.specs.heightRangeMm).toBe("320-500");
    const verified = second.events.find((e) => e.type === "verified") as Extract<AgentEvent, { type: "verified" }> | undefined;
    expect(verified?.ok).toBe(true);
  }, 20000);
});

describe("the chat can change everything on screen", () => {
  const project = { type: "deck" as const, title: "", inputs: {}, measurements: [], assumptions: [], estimate: { hoursMin: 1, hoursMax: 2, difficulty: 1 as const, people: 1 as const }, safetyNotes: [] };
  const st = { basket: [], project };

  it("parses screen, list and undo requests", () => {
    expect(parseIntent("Arată-mi grinzile", st)).toMatchObject({ kind: "view", command: { highlight: "deck_joist" } });
    expect(parseIntent("Vreau vedere explodată", st)).toMatchObject({ kind: "view", command: { view: "exploded" } });
    expect(parseIntent("Deschide coșul", st)).toMatchObject({ kind: "view", command: { panel: "cart" } });
    expect(parseIntent("Plătesc cu puncte", st)).toMatchObject({ kind: "view", command: { redeemPoints: true } });
    expect(parseIntent("Anulează ultima modificare", st)).toMatchObject({ kind: "sketch", edits: [{ op: "undo" }] });
    expect(parseIntent("Scoate geotextilul din listă", st)).toMatchObject({ kind: "remove" });
    expect(parseIntent("Alege varianta din pin", st)).toMatchObject({ kind: "choose" });
    expect(parseIntent("Mută lista la Berceni", st)).toMatchObject({ kind: "move" });
    expect(parseIntent("Adaugă sugestiile", st)).toEqual({ kind: "add_suggestions" });
  });

  it("chooses options, removes, moves, adds extras and undoes — all from the chat", async () => {
    const tenant = getTenant("demo");
    const sources = getDataSources(tenant.id);
    const customer = (await sources.loyalty.getMember("WL-RO-100231"))!;
    const run = async (message: string, state: Parameters<typeof runScriptedAgent>[0]["state"]) => {
      const events: AgentEvent[] = [];
      for await (const ev of runScriptedAgent({ sources, tenant, customer, message, state, lang: "ro" })) events.push(ev);
      const last = events.filter((e) => e.type === "state").at(-1) as Extract<AgentEvent, { type: "state" }> | undefined;
      const text = events.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("");
      const verified = events.find((e) => e.type === "verified") as Extract<AgentEvent, { type: "verified" }> | undefined;
      return { events, text, verified, state: last?.state ?? state };
    };
    const s0 = (await run("Vreau o terasă de 4 x 3 m pe pământ", { basket: [] })).state;
    expect(s0.suggestions?.length).toBeGreaterThan(0);

    const pine = await run("Alege varianta din pin", s0);
    const boards = (await sources.catalog.getMany(pine.state.basket.filter((b) => b.role === "deck_board").map((b) => b.sku)))[0];
    expect(boards.name).toMatch(/pin/i);
    expect(pine.verified?.ok).toBe(true);

    const noMembrane = await run("Scoate geotextilul din listă", pine.state);
    expect(noMembrane.state.basket.some((b) => b.role === "weed_membrane")).toBe(false);

    const moved = await run("Mută lista la Berceni", noMembrane.state);
    expect(moved.state.storeId).not.toBe(noMembrane.state.storeId);
    expect(moved.text).toMatch(/Berceni/);

    const extras = await run("Adaugă sugestiile", moved.state);
    expect(extras.state.suggestions ?? []).toHaveLength(0);
    expect(extras.state.basket.length).toBeGreaterThan(moved.state.basket.length);

    const view = await run("Arată-mi grinzile", extras.state);
    const ui = view.events.find((e) => e.type === "ui") as Extract<AgentEvent, { type: "ui" }> | undefined;
    expect(ui?.command).toMatchObject({ highlight: "deck_joist", view: "exploded" });

    const edited = await run("Adaugă 2 trepte în față", extras.state);
    expect(edited.state.project?.layoutHistory).toHaveLength(1);
    const undone = await run("Anulează", edited.state);
    const l = undone.state.project?.layout;
    expect(l?.type === "deck" && l.steps).toHaveLength(0);
    // the pine boards picked earlier are still there after edit + undo
    const b2 = (await sources.catalog.getMany(undone.state.basket.filter((b) => b.role === "deck_board").map((b) => b.sku)))[0];
    expect(b2.name).toMatch(/pin/i);
  }, 30000);
});
