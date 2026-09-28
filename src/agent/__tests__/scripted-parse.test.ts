import { describe, expect, it } from "vitest";
import { getDataSources } from "@/adapters";
import { getTenant } from "@/config/tenant";
import type { ProjectType } from "@/domain/calculators";
import { answerToQuestion, findDims, itemName, parseIntent, runScriptedAgent, shortName } from "../scripted";
import type { AgentEvent, SessionState } from "../types";

/** QA 2026-09-28: phrasings the offline parser used to misread. */
const empty: SessionState = { basket: [] };
const on = (type: ProjectType): SessionState => ({
  basket: [],
  project: { type, title: "", inputs: {}, measurements: [], assumptions: [], estimate: { hoursMin: 1, hoursMax: 2, difficulty: 1, people: 1 }, safetyNotes: [] },
});

describe("new project requests", () => {
  it.each([
    ["gard 1,8 m înălțime și 25 m lungime", { lengthM: 25, heightM: 1.8 }],
    ["Gard înalt de 1,2 m, lung de 30 m", { lengthM: 30, heightM: 1.2 }],
    ["I need a 1.2m high fence, 20m long", { lengthM: 20, heightM: 1.2 }],
    ["Vreau un gard de 25 de metri", { lengthM: 25 }],
  ])("fence: height and length are not swapped (%s)", (msg, params) => {
    expect(parseIntent(msg, empty)).toMatchObject({ kind: "project", type: "fence", params });
  });

  it("reads the height next to its unit, not the next number ('2.7 m high, 2 doors')", () => {
    expect(parseIntent("Paint my living room 5 by 4 metres, 2.7 m high, 2 doors and 3 windows", empty)).toMatchObject({
      params: { lengthM: 5, widthM: 4, heightM: 2.7, doors: 2, windows: 3 },
    });
    expect(parseIntent("Vreau să vopsesc camera 4 x 3 m inaltime 2,6", empty)).toMatchObject({ params: { lengthM: 4, widthM: 3, heightM: 2.6 } });
  });

  it.each([
    ["terasă de 4 m lungime și 3 m lățime", 4, 3],
    ["deck 4 m long and 3 m wide", 4, 3],
    ["Vreau o terasă 400 x 300 cm", 4, 3],
  ])("reads dimensions written out or in cm (%s)", (msg, lengthM, widthM) => {
    expect(parseIntent(msg, empty)).toMatchObject({ kind: "project", type: "deck", params: { lengthM, widthM } });
  });

  it("reads a raised deck and areas in any unit", () => {
    expect(parseIntent("terasa 4 x 3 ridicată la 50 cm", empty)).toMatchObject({ params: { heightM: 0.5 } });
    expect(parseIntent("terasă 4 x 3, înălțime 50 cm", empty)).toMatchObject({ params: { heightM: 0.5 } });
    expect(parseIntent("gazon de 80 metri pătrați", empty)).toMatchObject({ kind: "project", type: "lawn", params: { areaM2: 80 } });
    expect(parseIntent("Vreau să vopsesc camera de 12 mp", empty)).toMatchObject({ kind: "project", type: "paint_room", params: { lengthM: 3.46, widthM: 3.46 } });
    expect(parseIntent("Vreau o terasă de 12 mp", empty)).toMatchObject({ params: { lengthM: 3.46, widthM: 3.46 } });
  });

  it("drywall length is the length, not the height", () => {
    expect(parseIntent("perete de rigips de 2,6 m înălțime și 4 m lungime", empty)).toMatchObject({ type: "drywall_partition", params: { lengthM: 4, heightM: 2.6 } });
  });

  it("kitchen 'faianță' means wall tiles, not only floor tiles", () => {
    expect(parseIntent("faianță în bucătărie 3 x 2", empty)).toMatchObject({ type: "tiling", params: { roomType: "kitchen", wallTileHeightM: 0.6, tileFloor: false } });
    expect(parseIntent("baie 2x2 faianță până la 1,2 m", empty)).toMatchObject({ type: "tiling", params: { wallTileHeightM: 1.2 } });
    expect(parseIntent("Retile my kitchen 3 by 2.5", empty)).toMatchObject({ kind: "project", type: "tiling" });
  });

  it("counts doors and windows in words, and 'fără uși'", () => {
    expect(parseIntent("zugrăvesc camera 4 x 3, trei uși și fără ferestre", empty)).toMatchObject({ params: { doors: 3, windows: 0 } });
  });

  it("dims helper", () => {
    expect(findDims("4,5 m pe 3")).toMatchObject({ a: 4.5, b: 3 });
    expect(findDims("450 x 300 cm")).toMatchObject({ a: 4.5, b: 3 });
    expect(findDims("fără dimensiuni")).toBeNull();
  });
});

describe("follow-ups on an existing project", () => {
  it.each([
    ["ridic-o la 50 cm", [{ op: "set_height", value: 0.5 }]],
    ["ridică terasa la 50 cm", [{ op: "set_height", value: 0.5 }]],
    ["înalț-o la 40 cm", [{ op: "set_height", value: 0.4 }]],
    ["Adaugă 3 trepte în față și ridic-o la 50 cm", [{ op: "set_height", value: 0.5 }, { op: "add_steps", count: 3 }]],
    ["scoate treptele", [{ op: "remove_steps" }]],
    ["terasa e de fapt pe beton", [{ op: "set_option", key: "base", value: "concrete_slab" }]],
  ])("deck: %s", (msg, edits) => {
    expect(parseIntent(msg, on("deck"))).toMatchObject({ kind: "sketch", edits });
  });

  it("a full new request with dimensions is still a new project, not a settings tweak", () => {
    expect(parseIntent("Vreau o terasă de 5 x 4 m pe beton", on("deck"))).toMatchObject({ kind: "project", params: { lengthM: 5, widthM: 4, base: "concrete_slab" } });
  });

  it("naming the project without dimensions doesn't reset it to the sizes card", () => {
    expect(parseIntent("terasa mea e în spatele casei", on("deck"))).toEqual({ kind: "unknown" });
  });

  it("other project types", () => {
    expect(parseIntent("fără tavan", on("paint_room"))).toMatchObject({ kind: "sketch", edits: [{ op: "set_option", key: "ceiling", value: false }] });
    expect(parseIntent("fă-o mai înaltă, 2,8 m", on("paint_room"))).toMatchObject({ kind: "sketch", edits: [{ op: "set_height", value: 2.8 }] });
    expect(parseIntent("fă-l de 5 m", on("drywall_partition"))).toMatchObject({ kind: "sketch", edits: [{ op: "resize", w: 5 }] });
    expect(parseIntent("fă-l 5 x 2,8", on("drywall_partition"))).toMatchObject({ kind: "sketch", edits: [{ op: "resize", w: 5, h: 2.8 }] });
    expect(parseIntent("fă-l de 30 m", on("fence"))).toMatchObject({ kind: "sketch", edits: [{ op: "resize", w: 30 }] });
    expect(parseIntent("fă-l de 120 cm înălțime", on("fence"))).toMatchObject({ kind: "sketch", edits: [{ op: "set_height", value: 1.2 }] });
    expect(parseIntent("mai adaugă o zonă de 3 x 3 în spate", on("lawn"))).toMatchObject({ kind: "sketch", edits: [{ op: "add_zone", side: "n", w: 3, d: 3 }] });
    expect(parseIntent("montaj diagonal", on("laminate_floor"))).toMatchObject({ kind: "sketch", edits: [{ op: "set_option", key: "pattern", value: "diagonal" }] });
    expect(parseIntent("o vreau din WPC", on("deck"))).toMatchObject({ kind: "choose" });
  });
});

describe("adding things and answering 'da'", () => {
  it("'adaugă o treaptă' is one step (singular 'treaptă' used to fall through to 'add every extra')", () => {
    expect(parseIntent("adaugă o treaptă în față", on("deck"))).toMatchObject({ kind: "sketch", edits: [{ op: "add_steps", count: 1 }] });
    expect(parseIntent("adaugă-le", on("deck"))).toEqual({ kind: "add_suggestions" });
    expect(parseIntent("adaugă o bancă", on("deck"))).toMatchObject({ kind: "add_suggestions", text: expect.any(String) });
  });

  it("'da' answers the question the last reply ended with", () => {
    const reply = (content: string) => [{ role: "user", content: "x" }, { role: "assistant", content }];
    const both = "…la **Atelier București Berceni** (9,9 km) e tot — mut lista acolo? Opțional: vrei să adaug și ferăstrău unghiular?";
    expect(answerToQuestion("Da", reply(both))).toEqual({ kind: "add_suggestions" });
    expect(answerToQuestion("da, te rog", reply("Varianta economică costă **2.664,40 lei**. La X nu ajunge stocul pentru plot; la **Atelier București Berceni** (9,9 km) e tot — mut lista acolo?"))).toEqual({
      kind: "move",
      text: "atelier bucuresti berceni",
    });
    expect(answerToQuestion("Yes please", reply("…**Atelier Timișoara 2** (3.4 km) has everything — shall I move your list there?"))).toMatchObject({ kind: "move" });
    expect(answerToQuestion("nu, mersi", reply(both))).toBeNull();
    expect(answerToQuestion("da", reply("Gata — 3 trepte de 1,5 m pe latura de sud."))).toBeNull();
  });

  it("an unknown 'adaugă X' offers the suggestions instead of adding them all", async () => {
    const tenant = getTenant("demo");
    const sources = getDataSources(tenant.id);
    const customer = (await sources.loyalty.getMember("WL-RO-100231"))!;
    let state: SessionState = empty;
    for await (const ev of runScriptedAgent({ sources, tenant, customer, message: "Vreau o terasă de 4 x 3 m", state, lang: "ro" })) if (ev.type === "state") state = ev.state;
    const events: AgentEvent[] = [];
    for await (const ev of runScriptedAgent({ sources, tenant, customer, message: "adaugă o bancă", state, lang: "ro" })) events.push(ev);
    expect(events.some((e) => e.type === "card" && e.card.kind === "quote")).toBe(false);
    expect(events.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("")).toMatch(/Pot adăuga extra-urile sugerate/);
  }, 20000);
});

describe("moving the list", () => {
  it("'Timișoara 2' is not 'Timișoara 1', and moving to the current store says so", async () => {
    const tenant = getTenant("demo");
    const sources = getDataSources(tenant.id);
    const customer = (await sources.loyalty.getMember("WL-RO-309877"))!; // James, home store Timișoara 1
    let state: SessionState = empty;
    const say = async (message: string) => {
      let text = "";
      for await (const ev of runScriptedAgent({ sources, tenant, customer, message, state, lang: "en" })) {
        if (ev.type === "state") state = ev.state;
        if (ev.type === "text") text += ev.delta;
      }
      return text;
    };
    await say("I want a 4 x 3 m deck in my garden");
    expect(await say("move my list to Timișoara 2")).toMatch(/^Moved your list to \*\*Atelier Timișoara 2/);
    expect(state.storeId).toBe("timisoara-2");
    expect(await say("move my list to Timisoara 2")).toMatch(/^Your list is already at/);
  }, 20000);
});

describe("a quality tier carried over to the next project", () => {
  it("is named in the reply ('placare baie (varianta premium) costă …')", async () => {
    const tenant = getTenant("demo");
    const sources = getDataSources(tenant.id);
    const customer = (await sources.loyalty.getMember("WL-RO-100231"))!;
    let state: SessionState = empty;
    let text = "";
    for (const message of ["Vreau să vopsesc dormitorul 4 x 3,5 m", "Vreau premium", "Refac baia 2,5 x 2 m"]) {
      text = "";
      for await (const ev of runScriptedAgent({ sources, tenant, customer, message, state, lang: "ro" })) {
        if (ev.type === "state") state = ev.state;
        if (ev.type === "text") text += ev.delta;
      }
    }
    expect(text).toMatch(/^Gata — placare baie \(varianta premium\) costă/);
  }, 20000);
});

describe("reply wording", () => {
  it("short names never end on a preposition", () => {
    expect(shortName("Genunchiere Protekt cu gel, mărime universală")).toBe("genunchiere Protekt");
    expect(shortName("Plot reglabil terasă Kronwald 60–100 mm")).toBe("plot reglabil terasă");
  });

  it("an out-of-range size gets an explanation, and a follow-up that isn't understood gets project-specific examples", async () => {
    const tenant = getTenant("demo");
    const sources = getDataSources(tenant.id);
    const customer = (await sources.loyalty.getMember("WL-RO-100231"))!;
    const reply = async (message: string, state: SessionState) => {
      const events: AgentEvent[] = [];
      for await (const ev of runScriptedAgent({ sources, tenant, customer, message, state, lang: "ro" })) events.push(ev);
      return events.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("");
    };
    expect(await reply("terasă 99 x 3", empty)).toMatch(/până la 30 m/);
    const text = await reply("terasa mea e în spatele casei", on("deck"));
    expect(text).toMatch(/Nu am înțeles ce să schimb/);
    expect(text).toMatch(/trepte/);
  }, 20000);

  it("English replies name products by what they are, not by a lower-cased brand", async () => {
    expect(itemName("Kronwald adjustable deck support 60–100 mm", "deck_support", "en")).toBe("adjustable deck support");
    expect(itemName("Gipsa CW profile 50 mm, 3 m", "cw_profile", "en")).toBe("CW metal stud");
    expect(itemName("Plot reglabil terasă Kronwald 60–100 mm", "deck_support", "ro")).toBe("plot reglabil terasă");
    const tenant = getTenant("demo");
    const sources = getDataSources(tenant.id);
    const customer = (await sources.loyalty.getMember("WL-RO-309877"))!;
    let text = "";
    for await (const ev of runScriptedAgent({ sources, tenant, customer, message: "I want to build a 4 x 3 m wooden deck in my garden, on soil.", state: empty, lang: "en" })) if (ev.type === "text") text += ev.delta;
    expect(text).not.toMatch(/\b(kronwald|toolcraft|voltmaster|protekt|verdea)\b/);
  }, 20000);

  it("distances use the reply language's decimal separator", async () => {
    const tenant = getTenant("demo");
    const sources = getDataSources(tenant.id);
    const customer = (await sources.loyalty.getMember("WL-RO-100231"))!;
    let text = "";
    for await (const ev of runScriptedAgent({ sources, tenant, customer, message: "Vreau o terasă de 4 x 3 m în curte", state: empty, lang: "ro" })) if (ev.type === "text") text += ev.delta;
    expect(text).not.toMatch(/\d\.\d km/);
    expect(text).not.toMatch(/le adaug\?/);
  }, 20000);
});
