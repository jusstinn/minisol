import type { DataSources } from "@/adapters/types";
import type { Tenant } from "@/config/tenant";
import type { Customer, Lang } from "@/domain/types";
import type { LlmClient, LlmEvent } from "./llm";
import { systemPrompt } from "./prompt";
import { TOOL_DEFINITIONS, TOOL_STATUS, executeTool } from "./tools";
import type { AgentEvent, SessionState } from "./types";

export interface RunOptions {
  llm: LlmClient;
  sources: DataSources;
  tenant: Tenant;
  customer: Customer;
  message: string;
  history: unknown[];
  state: SessionState;
  lang?: Lang;
  now?: Date;
  maxSteps?: number;
  signal?: AbortSignal;
}

/**
 * The agent loop: stream model output, execute tool calls against the data
 * sources, feed results back, repeat until the model answers without tools.
 * Emits UI events (text deltas, status, cards, state) as it goes.
 */
export async function* runAgent(opts: RunOptions): AsyncGenerator<AgentEvent> {
  const started = Date.now();
  const lang = opts.lang ?? opts.customer.language;
  const now = opts.now ?? new Date();
  let state: SessionState = { ...opts.state, basket: opts.state.basket ?? [] };
  const input: unknown[] = [...opts.llm.sanitizeHistory(opts.history), opts.llm.userMessage(opts.message)];
  const usage = { inputTokens: 0, outputTokens: 0 };
  const maxSteps = opts.maxSteps ?? 8;

  for (let step = 0; step < maxSteps; step++) {
    const instructions = systemPrompt({ today: now.toISOString().slice(0, 10), lang, state, tenant: opts.tenant });
    let completed: Extract<LlmEvent, { type: "completed" }> | undefined;

    for await (const ev of opts.llm.stream({ instructions, input, tools: TOOL_DEFINITIONS, signal: opts.signal })) {
      if (ev.type === "text") yield { type: "text", delta: ev.delta };
      else if (ev.type === "tool_start") {
        const label = TOOL_STATUS[ev.name]?.[lang] ?? ev.name;
        yield { type: "status", tool: ev.name, label };
      } else if (ev.type === "completed") completed = ev;
    }
    if (!completed) throw new Error("Model stream ended without completion");
    if (completed.usage) {
      usage.inputTokens += completed.usage.inputTokens;
      usage.outputTokens += completed.usage.outputTokens;
    }
    input.push(...completed.outputItems);
    if (completed.toolCalls.length === 0) break;

    // Sequential on purpose: tools like calculate_project update state that later calls read.
    // Plan/presentation tools run last so they see the final basket.
    const ordered = [...completed.toolCalls].sort((a, b) => Number(a.name === "present_plan") - Number(b.name === "present_plan"));
    for (const call of ordered) {
      const result = await executeTool(call.name, call.arguments, { sources: opts.sources, customer: opts.customer, state, lang, now });
      if (result.state) {
        state = result.state;
        yield { type: "state", state };
      }
      for (const card of result.cards ?? []) yield { type: "card", card };
      input.push(opts.llm.toolOutput(call.callId, JSON.stringify(result.forModel)));
    }
    if (step === maxSteps - 1) {
      yield { type: "text", delta: lang === "en" ? "\n\n(I stopped here — tell me what to adjust.)" : "\n\n(M-am oprit aici — spune-mi ce ajustăm.)" };
    }
  }

  yield { type: "history", items: opts.llm.sanitizeHistory(input) };
  yield { type: "done", usage, ms: Date.now() - started };
}
