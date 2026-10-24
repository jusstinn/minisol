import { afterEach, describe, expect, it, vi } from "vitest";
import { getDataSources } from "@/adapters";
import { getTenant } from "@/config/tenant";
import type { Lang } from "@/domain/types";
import { parseBudget, parseIntent, runScriptedAgent } from "../scripted";
import type { AgentEvent, BudgetView, Card, SessionState } from "../types";

const empty: SessionState = { basket: [] };
const deck: SessionState = {
  basket: [],
  project: { type: "deck", title: "", inputs: {}, measurements: [], assumptions: [], estimate: { hoursMin: 1, hoursMax: 2, difficulty: 1, people: 1 }, safetyNotes: [] },
};

describe("budgets in plain words (offline parser)", () => {
  it.each([
    ["am un buget de 3.000 lei", 3000],
    ["Bugetul meu e 2500", 2500],
    ["buget: 4 500 lei", 4500],
    ["am doar 1800 lei", 1800],
    ["maxim 3.000,50 lei", 3000.5],
    ["nu vreau să dau mai mult de 2.000 lei", 2000],
    ["My budget is 3,000 lei", 3000],
    ["I have 2500 lei for this", 2500],
    ["up to 1,500 lei please", 1500],
    ["terasă 4 x 3 m", undefined],
    ["adaugă 2 trepte", undefined],
    ["buget de 20 lei", undefined], // too small to be a project budget
  ])("%s", (msg, amount) => {
    const t = msg.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    expect(parseBudget(t)).toBe(amount);
  });

  it("is a budget for the project on screen, and 'apply' applies it", () => {
    expect(parseIntent("Am un buget de 3.000 lei", deck)).toEqual({ kind: "budget", amount: 3000, apply: false });
    expect(parseIntent("Aplică varianta pentru bugetul de 3.000 lei", deck)).toEqual({ kind: "budget", amount: 3000, apply: true });
    expect(parseIntent("Apply the version for my 3,000 lei budget", deck)).toEqual({ kind: "budget", amount: 3000, apply: true });
    // "budget" here is the amount, not a request for the budget range.
    expect(parseIntent("my budget is 3000 lei", deck)).toMatchObject({ kind: "budget" });
  });

  it("with a new project, the project comes first and carries the budget", () => {
    expect(parseIntent("Vreau o terasă din lemn de 4 x 3 m, am un buget de 3.000 lei", empty)).toMatchObject({
      kind: "project",
      type: "deck",
      params: { lengthM: 4, widthM: 3 },
      budget: 3000,
    });
    expect(parseIntent("I want a 4 x 3 m deck, budget 3000 lei", empty)).toMatchObject({ kind: "project", quality: undefined, budget: 3000 });
    expect(parseIntent("am un buget de 3000 lei", empty)).toEqual({ kind: "budget", amount: 3000, apply: false });
  });
});

describe("fitting a project to a budget, end to end (offline agent)", () => {
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
    const verified = events.find((e): e is Extract<AgentEvent, { type: "verified" }> => e.type === "verified");
    return { cards, text, verified, state: events.filter((e): e is Extract<AgentEvent, { type: "state" }> => e.type === "state").at(-1)?.state ?? state };
  }
  const budgetOf = (cards: Card[]): BudgetView | undefined => cards.filter((c): c is Extract<Card, { kind: "budget" }> => c.kind === "budget").at(-1)?.budget;
  const quoteOf = (cards: Card[]) => cards.filter((c): c is Extract<Card, { kind: "quote" }> => c.kind === "quote").at(-1)!;

  it("tier → lean → smaller, each priced by the engine, applied on request", async () => {
    const first = await run("Vreau o terasă din lemn de 4 x 3 m în curte, pe pământ.", empty);
    const full = quoteOf(first.cards).quote.total;
    const tiers = quoteOf(first.cards).tiers!;
    const budgetTier = tiers.find((t) => t.quality === "budget")!.total;

    // Enough for the budget tier: same sketch, cheaper products. Nothing changes until applied.
    const a = await run(`Am un buget de ${Math.ceil(budgetTier) + 10} lei`, first.state);
    const ba = budgetOf(a.cards)!;
    expect(ba).toMatchObject({ fit: "tier", quality: "budget", current: full, applied: false });
    expect(ba.total).toBeLessThanOrEqual(ba.amount);
    expect(ba.applyText).toMatch(/^Aplică varianta pentru bugetul de/);
    expect(a.cards.map((c) => c.kind)).toEqual(["budget"]);
    expect(a.verified?.ok).toBe(true);

    // Far less: a smaller deck, same proportions.
    const small = await run("Am doar 1.500 lei", first.state);
    const bs = budgetOf(small.cards)!;
    expect(bs.fit).toBe("smaller");
    expect(bs.size).toMatch(/^\d+(,\d)? × \d+(,\d)? m$/);
    expect(bs.total).toBeLessThanOrEqual(1500);
    expect(small.text).toContain(bs.size!);
    expect(small.verified?.ok).toBe(true);

    // Applying it redraws the sketch and the list, and the new total really fits.
    const applied = await run(bs.applyText!, first.state);
    expect(applied.cards.map((c) => c.kind)).toEqual(["project", "quote", "change", "budget"]);
    expect(budgetOf(applied.cards)).toMatchObject({ fit: "smaller", applied: true });
    expect(quoteOf(applied.cards).quote.total).toBeLessThanOrEqual(1500);
    expect(applied.state.quality).toBe("budget");
    expect(applied.text).toMatch(/^Gata/);
    expect(applied.verified?.ok).toBe(true);

    // A budget that's already enough says so.
    const fits = await run(`my budget is ${Math.ceil(full) + 500} lei`, first.state, "en");
    expect(budgetOf(fits.cards)).toMatchObject({ fit: "fits" });
    expect(fits.text).toMatch(/already fits/);
  }, 30_000);

  it("a room can't shrink: it says what the leanest version costs", async () => {
    const first = await run("Vreau să vopsesc dormitorul de 4 x 3,5 m, înălțime 2,6 m", empty);
    const r = await run("Am un buget de 100 lei", first.state);
    expect(budgetOf(r.cards)).toMatchObject({ fit: "over" });
    expect(r.text).toMatch(/Nici varianta cea mai economică/);
    expect(r.verified?.ok).toBe(true);
  }, 30_000);

  it("a new project with a budget is drawn, then fitted", async () => {
    const r = await run("Vreau o terasă din lemn de 4 x 3 m, am un buget de 2.000 lei", empty);
    expect(r.cards.map((c) => c.kind)).toEqual(expect.arrayContaining(["project", "quote", "plan", "budget"]));
    expect(r.text).toMatch(/Cu \*\*2\.000,00 lei\*\*|Nici varianta/);
    expect(r.verified?.ok).toBe(true);
  }, 30_000);
});
