import { afterEach, describe, expect, it, vi } from "vitest";
import { getDataSources } from "@/adapters";
import { parseIntent, replyLang, runScriptedAgent } from "@/agent/scripted";
import type { AgentEvent, Card, SessionState } from "@/agent/types";
import { getTenant } from "@/config/tenant";
import type { Lang } from "@/domain/types";
import { PROJECT_STARTERS } from "@/lib/i18n";
import { nextSteps, shortProductName, storeShortName } from "../nextSteps";
import type { NextStep } from "../nextSteps";
import type { Board } from "../useAgent";

const tenant = getTenant("demo");
const sources = getDataSources(tenant.id);

/** Run the offline agent without its pacing delays. */
async function run(message: string, state: SessionState, lang: Lang, memberId = "WL-RO-100231") {
  const customer = (await sources.loyalty.getMember(memberId))!;
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
  const states = events.filter((e): e is Extract<AgentEvent, { type: "state" }> => e.type === "state");
  const text = events.filter((e): e is Extract<AgentEvent, { type: "text" }> => e.type === "text").map((e) => e.delta).join("");
  const ui = events.filter((e): e is Extract<AgentEvent, { type: "ui" }> => e.type === "ui").map((e) => e.command);
  return { cards, state: states.at(-1)?.state ?? state, text, ui };
}

/** The board the client would show after these cards (same merge rules as useAgent.putCard). */
function boardOf(cards: Card[], prev: Board = { version: 0 }): Board {
  const b: Board = { ...prev };
  for (const c of cards) {
    const next = c.kind === "quote" && !c.choices && b.quote?.choices ? { ...c, choices: b.quote.choices } : c;
    (b as unknown as Record<string, unknown>)[c.kind] = next;
  }
  return b;
}

const FALLBACK = /Sunt asistentul tău|I'm your DIY project assistant|Nu am putut|I couldn't|Nu a mers|That didn't work|Ce produs să scot|Which item|Ce variantă preferi|Which option would you like|La ce magazin|Which store/;

afterEach(() => vi.useRealTimers());

describe("nextSteps helpers", () => {
  it("shortens product names to their generic words", () => {
    expect(shortProductName("Ferăstrău unghiular Voltmaster 1400 W, disc 210 mm", "ro")).toBe("ferăstrău unghiular");
    expect(shortProductName("Cutie de tăiere unghiuri cu fierăstrău Toolcraft 600 mm", "ro")).toBe("cutie de tăiere");
    expect(shortProductName("Voltmaster 1400 W mitre saw, 210 mm blade", "en")).toBe("mitre saw");
    expect(shortProductName("Kronwald black PVC post cap 9 × 9 cm", "en")).toBe("black PVC post cap");
    expect(shortProductName("Toolcraft mitre box with 600 mm saw", "en")).toBe("mitre box");
    expect(shortProductName("Genunchiere Protekt cu gel", "ro")).toBe("genunchiere");
  });

  it("names a store by what tells it apart", () => {
    const all = [
      { name: "HORNBACH București Militari", city: "București" },
      { name: "HORNBACH București Berceni", city: "București" },
      { name: "HORNBACH Brașov", city: "Brașov" },
      { name: "HORNBACH Timișoara 2 Calea Buziașului", city: "Timișoara" },
    ];
    expect(storeShortName("HORNBACH București Berceni", all, "București")).toBe("Berceni");
    expect(storeShortName("HORNBACH Brașov", all, "Brașov")).toBe("Brașov");
    expect(storeShortName("HORNBACH Timișoara 2 Calea Buziașului", all, "Timișoara")).toBe("Timișoara 2 Calea Buziașului");
  });

  it("returns nothing before there is a priced list", () => {
    expect(nextSteps({ board: {}, lang: "ro" })).toEqual([]);
  });
});

describe("nextSteps per project", () => {
  // Every starter project, in both languages: 3–5 chips, all understood by the offline agent, in the chip's language.
  const cases = PROJECT_STARTERS.flatMap((s) => [
    { id: s.id, lang: "ro" as Lang, prompt: s.promptRo },
    { id: s.id, lang: "en" as Lang, prompt: s.promptEn },
  ]);

  it.each(cases)("$id ($lang): 3–5 chips the offline agent understands", async ({ lang, prompt }) => {
    const first = await run(prompt, { basket: [] }, lang, lang === "en" ? "WL-RO-309877" : "WL-RO-100231");
    const board = boardOf(first.cards);
    const chips = nextSteps({ board, lang, lastCards: first.cards, asked: [prompt] });
    expect(chips.length).toBeGreaterThanOrEqual(3);
    expect(chips.length).toBeLessThanOrEqual(5);
    expect(new Set(chips.map((c) => c.id)).size).toBe(chips.length);
    for (const c of chips) {
      expect(parseIntent(c.text, first.state).kind, c.text).not.toBe("unknown");
      expect(replyLang(c.text, lang), c.text).toBe(lang);
    }
  }, 30000);
});

describe("every chip does what it says (offline agent)", () => {
  const scenarios: { name: string; prompt: string; lang: Lang; member: string }[] = [
    { name: "deck RO (short at Militari, has suggestions)", prompt: PROJECT_STARTERS[0].promptRo, lang: "ro", member: "WL-RO-100231" },
    { name: "deck EN", prompt: PROJECT_STARTERS[0].promptEn, lang: "en", member: "WL-RO-309877" },
    { name: "fence RO", prompt: PROJECT_STARTERS[4].promptRo, lang: "ro", member: "WL-RO-204518" },
    { name: "fence EN", prompt: PROJECT_STARTERS[4].promptEn, lang: "en", member: "WL-RO-309877" },
    { name: "bathroom RO", prompt: PROJECT_STARTERS[3].promptRo, lang: "ro", member: "WL-RO-100231" },
    { name: "drywall EN", prompt: PROJECT_STARTERS[5].promptEn, lang: "en", member: "WL-RO-309877" },
    { name: "paving path RO", prompt: PROJECT_STARTERS.find((s) => s.id === "paving")!.promptRo, lang: "ro", member: "WL-RO-100231" },
    { name: "paving path EN", prompt: PROJECT_STARTERS.find((s) => s.id === "paving")!.promptEn, lang: "en", member: "WL-RO-309877" },
    { name: "paved patio RO", prompt: "Terasă din pavele 4 × 3 m", lang: "ro", member: "WL-RO-204518" },
  ];

  it.each(scenarios)("$name", async ({ prompt, lang, member }) => {
    const first = await run(prompt, { basket: [] }, lang, member);
    const board = boardOf(first.cards);
    const chips = nextSteps({ board, lang, lastCards: first.cards, asked: [prompt], max: 12 });
    expect(chips.length).toBeGreaterThan(0);
    for (const chip of chips) await expectChipWorks(chip, first.state, board, lang, member);
  }, 60000);

  it("offers undo right after a change, and undo works", async () => {
    const first = await run(PROJECT_STARTERS[0].promptRo, { basket: [] }, "ro");
    const steps = await run("Adaugă trepte", first.state, "ro");
    const board = boardOf(steps.cards, boardOf(first.cards));
    const chips = nextSteps({ board, lang: "ro", lastCards: steps.cards, asked: [PROJECT_STARTERS[0].promptRo, "Adaugă trepte"] });
    expect(chips.map((c) => c.id)).toContain("fix.undo");
    // Steps exist now: no "add steps" chip any more.
    expect(chips.map((c) => c.id)).not.toContain("deck.steps");
    const undo = await run(chips.find((c) => c.id === "fix.undo")!.text, steps.state, "ro");
    const layout = undo.state.project?.layout;
    expect(layout && layout.type === "deck" ? layout.steps.length : -1).toBe(0);
  }, 30000);

  it("never repeats what the customer already asked", async () => {
    const first = await run(PROJECT_STARTERS[0].promptRo, { basket: [] }, "ro");
    const board = boardOf(first.cards);
    const before = nextSteps({ board, lang: "ro", lastCards: first.cards });
    const after = nextSteps({ board, lang: "ro", lastCards: first.cards, asked: [before[0].text.toUpperCase()] });
    expect(after.map((c) => c.id)).not.toContain(before[0].id);
  }, 30000);
});

async function expectChipWorks(chip: NextStep, state: SessionState, board: Board, lang: Lang, member: string) {
  const r = await run(chip.text, state, lang, member);
  expect(r.text, `${chip.id}: ${chip.text}`).not.toMatch(FALLBACK);
  expect(r.text.length, chip.text).toBeGreaterThan(10);
  const quote = board.quote!.quote;
  switch (chip.id.split(".")[0]) {
    case "deck":
    case "fence":
    case "tiling":
    case "paint":
    case "drywall":
    case "laminate":
    case "lawn":
    case "paving":
      // A shape edit: the sketch changed and a change receipt came back.
      expect(r.cards.map((c) => c.kind), chip.text).toContain("change");
      break;
  }
  switch (chip.id) {
    case "fix.move": {
      const best = quote.availability.alternatives.find((a) => a.allInStock && a.distanceKm <= 60 && a.storeId !== quote.storeId)!;
      expect(r.state.storeId, chip.text).toBe(best.storeId);
      break;
    }
    case "basket.add": {
      const q = r.cards.find((c): c is Extract<Card, { kind: "quote" }> => c.kind === "quote")!;
      const added = q.quote.lines.filter((l) => !quote.lines.some((o) => o.sku === l.sku));
      expect(added.map((l) => l.sku), chip.text).toEqual([board.quote!.suggestions[0].sku]);
      break;
    }
    case "basket.wpc": {
      const q = r.cards.find((c): c is Extract<Card, { kind: "quote" }> => c.kind === "quote")!;
      expect(q.quote.lines.find((l) => l.role === "deck_board")?.name, chip.text).toMatch(/WPC/);
      break;
    }
    case "basket.cheaper":
      expect(r.state.quality, chip.text).toBe("budget");
      break;
    case "money.points":
      expect(r.ui.some((u) => u.redeemPoints === true), chip.text).toBe(true);
      break;
    case "money.offers":
      expect(r.cards.map((c) => c.kind), chip.text).toContain("offers");
      break;
    case "info.stock":
      expect(r.cards.map((c) => c.kind), chip.text).toContain("stock");
      break;
    case "look.real":
      expect(r.ui.some((u) => u.view === "real"), chip.text).toBe(true);
      break;
    default:
      if (chip.id.startsWith("look.")) expect(r.ui.some((u) => u.highlight === chip.id.slice(5)), chip.text).toBe(true);
  }
}

describe("laying-pattern chips", () => {
  const change = (cards: Card[]) => cards.find((c): c is Extract<Card, { kind: "change" }> => c.kind === "change")?.change;
  const quoteTotal = (cards: Card[]) => cards.find((c): c is Extract<Card, { kind: "quote" }> => c.kind === "quote")?.quote.total;

  it("walks a deck from straight to diagonal to a frame, each with a priced change card", async () => {
    const first = await run(PROJECT_STARTERS[0].promptRo, { basket: [] }, "ro");
    let board = boardOf(first.cards);
    let chip = nextSteps({ board, lang: "ro", lastCards: first.cards, max: 12 }).find((c) => c.id === "deck.boards")!;
    expect(chip.text).toBe("Deck pe diagonală");
    const diag = await run(chip.text, first.state, "ro");
    const c1 = change(diag.cards)!;
    expect(c1.totalBefore).toBe(quoteTotal(first.cards));
    expect(c1.totalAfter).toBe(quoteTotal(diag.cards));
    expect(c1.delta).toBeGreaterThan(0);
    expect(c1.delta).toBeCloseTo(c1.totalAfter - c1.totalBefore, 2);
    board = boardOf(diag.cards, board);
    chip = nextSteps({ board, lang: "ro", lastCards: diag.cards, max: 12 }).find((c) => c.id === "deck.boards")!;
    expect(chip.text).toBe("Deck cu ramă");
    const framed = await run(chip.text, diag.state, "ro");
    const layout = framed.state.project?.layout;
    expect(layout?.type === "deck" ? layout.boards : undefined).toBe("frame");
    expect(change(framed.cards)?.delta).toBeCloseTo(change(framed.cards)!.totalAfter - change(framed.cards)!.totalBefore, 2);
  }, 60000);

  it("suggests herringbone pavers, then basketweave, in both languages", async () => {
    for (const lang of ["ro", "en"] as const) {
      // A 12 m² patio: the extra 5% of herringbone is more than the rounding to whole packs.
      const prompt = lang === "en" ? "Paved patio 4 × 3 m" : "Terasă din pavele 4 × 3 m";
      const first = await run(prompt, { basket: [] }, lang, lang === "en" ? "WL-RO-309877" : "WL-RO-100231");
      const chip = nextSteps({ board: boardOf(first.cards), lang, lastCards: first.cards, max: 12 }).find((c) => c.id === "paving.bond")!;
      expect(chip.text).toBe(lang === "en" ? "Herringbone pavers" : "Pavele în spic");
      const r = await run(chip.text, first.state, lang, lang === "en" ? "WL-RO-309877" : "WL-RO-100231");
      const layout = r.state.project?.layout;
      expect(layout?.type === "paving" ? layout.bond : undefined).toBe("herringbone");
      // Herringbone wastes more pavers than a running bond: the change card shows a higher total.
      expect(change(r.cards)!.delta).toBeGreaterThan(0);
      const next = nextSteps({ board: boardOf(r.cards, boardOf(first.cards)), lang, lastCards: r.cards, max: 12 }).find((c) => c.id === "paving.bond")!;
      expect(next.text).toBe(lang === "en" ? "Basketweave pavers" : "Pavele în coș");
    }
  }, 60000);
});
