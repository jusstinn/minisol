import { describe, expect, it } from "vitest";
import { getDataSources } from "@/adapters";
import { getTenant } from "@/config/tenant";
import type { LlmClient, LlmEvent, LlmRequest } from "../llm";
import { runAgent } from "../run";
import type { AgentEvent } from "../types";

/** A stand-in model: records what it was sent and answers with `reply(input)`. */
function fakeLlm(reply: (input: unknown[]) => string | Error) {
  const requests: LlmRequest[] = [];
  const llm: LlmClient = {
    async *stream(req): AsyncIterable<LlmEvent> {
      requests.push({ ...req, input: [...req.input] });
      const r = reply(req.input);
      if (r instanceof Error) throw r;
      yield { type: "text", delta: r };
      yield { type: "completed", outputItems: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: r }] }], toolCalls: [] };
    },
    userMessage: (text) => ({ role: "user", content: text }),
    toolCall: (callId, name, args) => ({ type: "function_call", call_id: callId, name, arguments: args }),
    toolOutput: (callId, output) => ({ type: "function_call_output", call_id: callId, output }),
    sanitizeHistory: (items) => items,
  };
  return { llm, requests };
}

async function collect(gen: AsyncGenerator<AgentEvent>) {
  const events: AgentEvent[] = [];
  for await (const ev of gen) events.push(ev);
  return events;
}

describe("fast first answer", async () => {
  const tenant = getTenant("demo");
  const sources = getDataSources(tenant.id);
  const customer = (await sources.loyalty.getMember("WL-RO-100231"))!;
  const message = "Vreau o terasă de 4 x 3 m pe pământ";

  it("shows the sketch and the priced list before the model says anything, in one model call", async () => {
    let total = "";
    const { llm, requests } = fakeLlm((input) => {
      const out = input.find((i) => (i as { call_id?: string }).call_id === "pre_calc" && (i as { type: string }).type === "function_call_output") as { output: string };
      total = JSON.parse(out.output).quote.display.total;
      return `Gata: **${total}**.`;
    });
    const events = await collect(runAgent({ llm, sources, tenant, customer, message, history: [], state: { basket: [] } }));
    const firstText = events.findIndex((e) => e.type === "text");
    const kinds = events.slice(0, firstText).filter((e) => e.type === "card").map((e) => (e as Extract<AgentEvent, { type: "card" }>).card.kind);
    expect(kinds).toEqual(["project", "quote"]);
    expect(requests).toHaveLength(1);
    const names = requests[0].input.filter((i) => (i as { type?: string }).type === "function_call").map((i) => (i as { name: string }).name);
    expect(names).toEqual(["get_customer_context", "calculate_project"]);
    expect(requests[0].instructions).toMatch(/ALREADY calculated/);
    expect(events.find((e) => e.type === "verified")).toMatchObject({ ok: true });
  });

  it("finishes the turn without the model if it fails after the list is shown", async () => {
    const { llm } = fakeLlm(() => new Error("429 rate limit"));
    const events = await collect(runAgent({ llm, sources, tenant, customer, message, history: [], state: { basket: [] } }));
    expect(events.some((e) => e.type === "card" && e.card.kind === "plan")).toBe(true);
    const text = events.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("");
    expect(text).toMatch(/lei/);
    expect(events.at(-1)?.type).toBe("done");
  });

  it("leaves vague requests to the model", async () => {
    const { llm, requests } = fakeLlm(() => "Ce dimensiuni are terasa?");
    const events = await collect(runAgent({ llm, sources, tenant, customer, message: "Vreau o terasă", history: [], state: { basket: [] } }));
    expect(events.some((e) => e.type === "card")).toBe(false);
    const names = requests[0].input.filter((i) => (i as { type?: string }).type === "function_call").map((i) => (i as { name: string }).name);
    expect(names).toEqual(["get_customer_context"]);
  });
});

describe("plan policy per retailer", async () => {
  const { executeTool } = await import("../tools");
  const sources = getDataSources("demo");
  const customer = (await sources.loyalty.getMember("WL-RO-100231"))!;
  const now = new Date();
  const calc = await executeTool(
    "calculate_project",
    JSON.stringify({ projectType: "deck", params: { lengthM: 4, widthM: 3 }, quality: null, storeId: null, includeOptional: null, keepSketch: null }),
    { sources, customer, state: { basket: [] }, lang: "ro", now },
  );
  const args = JSON.stringify({ title: "Plan AI", summary: "s", steps: [{ title: "Pas inventat", detail: "d", duration: null }], tips: ["Sfat AI"], safetyWarnings: [] });

  it("an 'approved' retailer shows its reviewed plan, with the model's tips labelled as AI", async () => {
    const r = await executeTool("present_plan", args, { sources, customer, state: calc.state!, lang: "ro", now, tenant: getTenant("hornbach") });
    const plan = r.cards?.[0].kind === "plan" ? r.cards[0].plan : undefined;
    expect(plan?.source).toBe("template");
    expect(plan?.approvedBy).toBe("HORNBACH");
    expect(plan?.steps.some((s) => s.title === "Pas inventat")).toBe(false);
    expect(plan?.aiTips).toEqual(["Sfat AI"]);
  });

  it("an 'ai' retailer shows the model's plan, marked as AI", async () => {
    const r = await executeTool("present_plan", args, { sources, customer, state: calc.state!, lang: "ro", now, tenant: getTenant("demo") });
    const plan = r.cards?.[0].kind === "plan" ? r.cards[0].plan : undefined;
    expect(plan?.source).toBe("ai");
    expect(plan?.steps[0].title).toBe("Pas inventat");
  });
});

describe("modify_basket understands how models actually phrase a swap", async () => {
  const { executeTool } = await import("../tools");
  const sources = getDataSources("demo");
  const customer = (await sources.loyalty.getMember("WL-RO-100231"))!;
  const now = new Date();
  const calc = await executeTool(
    "calculate_project",
    JSON.stringify({ projectType: "deck", params: { lengthM: 4, widthM: 3 }, quality: null, storeId: null, includeOptional: null, keepSketch: null }),
    { sources, customer, state: { basket: [] }, lang: "ro", now },
  );
  const current = calc.state!.basket.find((b) => b.role === "deck_board")!.sku;
  const cases = [
    { op: "choose", sku: "11018655", qty: null, withSku: null },
    { op: "choose", sku: current, qty: null, withSku: "11018655" },
    { op: "choose", sku: current, qty: null, withSku: "11018655 · Deck WPC compozit gri Kronwald 25 × 140 mm" },
    { op: "choose", sku: "WPC gri", qty: null, withSku: null },
  ];
  it.each(cases)("%o → WPC boards, re-sized", async (op) => {
    const r = await executeTool("modify_basket", JSON.stringify({ operations: [op], storeId: null }), { sources, customer, state: calc.state!, lang: "ro", now });
    const boards = r.state!.basket.filter((b) => b.role === "deck_board");
    expect(boards.map((b) => b.sku)).toEqual(["11018655"]);
    expect((r.forModel as { errors?: string[] }).errors).toBeUndefined();
  });
});
