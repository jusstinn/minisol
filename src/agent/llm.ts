import OpenAI from "openai";
import { ModelBusyError, estimateTokens, modelSpec, reserve, settle } from "./models";
import type { ModelSpec } from "./models";

/**
 * Minimal provider-neutral streaming interface the agent loop depends on.
 * OpenAI (Responses API) is implemented here; a Claude/Azure/Bedrock client
 * only needs to implement the same three methods.
 */

export interface ToolCall {
  callId: string;
  name: string;
  arguments: string;
}

export type LlmEvent =
  | { type: "text"; delta: string }
  /** The model is at its per-minute limit: waiting this many seconds before the call. */
  | { type: "waiting"; seconds: number }
  | { type: "tool_start"; name: string }
  | {
      type: "completed";
      /** Provider items to append to the conversation input. */
      outputItems: unknown[];
      toolCalls: ToolCall[];
      usage?: { inputTokens: number; outputTokens: number };
    };

export interface LlmRequest {
  instructions: string;
  input: unknown[];
  tools: unknown[];
  signal?: AbortSignal;
  /** A stable, anonymous id for the customer (a hash), so OpenAI can flag abuse per user, not per key. */
  safetyId?: string;
}

export interface LlmClient {
  stream(req: LlmRequest): AsyncIterable<LlmEvent>;
  userMessage(text: string): unknown;
  /** A tool call the server already made on the model's behalf (prefilled turn). */
  toolCall(callId: string, name: string, args: string): unknown;
  toolOutput(callId: string, output: string): unknown;
  /** Make stored history safe & portable for the next turn. */
  sanitizeHistory(items: unknown[]): unknown[];
}

const ALLOWED_ROLES = new Set(["user", "assistant"]);
/** Longest we wait for a model's next minute before giving up on it for this turn. */
const MAX_WAIT_MS = 20_000;
/** History that goes back to the model each turn: at most this many items and characters. */
const HISTORY_MAX_ITEMS = 60;
const HISTORY_MAX_CHARS = 40_000;

export class OpenAIResponsesClient implements LlmClient {
  private client: OpenAI;
  constructor(
    apiKey: string,
    private model: string,
    private reasoningEffort: "none" | "minimal" | "low" | "medium" | "high" = "low",
    private maxOutputTokens = 2500,
    /** Rate limits to respect for this model (src/agent/models.ts); none → no local governing. */
    private limits?: ModelSpec,
  ) {
    // One retry, 30 s: a stuck call must not hold the turn (or multiply the bill).
    this.client = new OpenAI({ apiKey, maxRetries: 1, timeout: 30_000 });
  }

  private get isReasoningModel() {
    return /^(gpt-5|gpt-6|o\d)/.test(this.model);
  }

  async *stream(req: LlmRequest): AsyncIterable<LlmEvent> {
    // Stay inside the model's own limits: wait a few seconds for the next minute, or give up here
    // (the turn then falls back) rather than meet a 429 from OpenAI half-way through.
    const estimate = this.limits ? estimateTokens([req.instructions, req.input, req.tools], Math.min(this.maxOutputTokens, 1500)) : 0;
    if (this.limits) {
      let r = await reserve(this.limits, estimate);
      if (!r.ok && "waitMs" in r && r.waitMs <= MAX_WAIT_MS) {
        yield { type: "waiting", seconds: Math.ceil(r.waitMs / 1000) };
        await new Promise((res) => setTimeout(res, r.ok ? 0 : (r as { waitMs: number }).waitMs));
        r = await reserve(this.limits, estimate);
      }
      if (!r.ok) throw new ModelBusyError("reason" in r ? r.reason : `${this.model}: per-minute limit`);
    }
    const body = {
      model: this.model,
      instructions: req.instructions,
      input: req.input,
      tools: req.tools,
      parallel_tool_calls: true,
      store: false,
      // A ceiling per model call (reasoning included): a reply here is a few sentences; this stops
      // anyone using the assistant to write essays on our key.
      max_output_tokens: this.maxOutputTokens,
      ...(req.safetyId ? { safety_identifier: req.safetyId } : {}),
      stream: true as const,
      ...(this.isReasoningModel
        ? {
            reasoning: { effort: this.reasoningEffort },
            include: ["reasoning.encrypted_content" as const],
            text: { verbosity: "low" as const },
          }
        : { temperature: 0.4 }),
    };
    const stream = await this.client.responses.create(body as unknown as OpenAI.Responses.ResponseCreateParamsStreaming, {
      signal: req.signal,
    });
    for await (const ev of stream) {
      switch (ev.type) {
        case "response.output_text.delta":
          yield { type: "text", delta: ev.delta };
          break;
        case "response.output_item.added":
          if (ev.item.type === "function_call") yield { type: "tool_start", name: ev.item.name };
          break;
        case "response.completed":
        case "response.incomplete": {
          const output = ev.response.output ?? [];
          const toolCalls: ToolCall[] = output
            .filter((i): i is OpenAI.Responses.ResponseFunctionToolCall => i.type === "function_call")
            .map((i) => ({ callId: i.call_id, name: i.name, arguments: i.arguments }));
          if (this.limits && ev.response.usage) await settle(this.limits, estimate, ev.response.usage.input_tokens + ev.response.usage.output_tokens);
          yield {
            type: "completed",
            outputItems: output as unknown[],
            toolCalls,
            usage: ev.response.usage
              ? { inputTokens: ev.response.usage.input_tokens, outputTokens: ev.response.usage.output_tokens }
              : undefined,
          };
          return;
        }
        case "response.failed":
          throw new Error(ev.response.error?.message ?? "Model response failed");
        case "error":
          throw new Error(ev.message ?? "Model stream error");
      }
    }
  }

  userMessage(text: string) {
    return { role: "user", content: text };
  }

  toolCall(callId: string, name: string, args: string) {
    return { type: "function_call", call_id: callId, name, arguments: args };
  }

  toolOutput(callId: string, output: string) {
    return { type: "function_call_output", call_id: callId, output };
  }

  /**
   * History comes back from the browser, so treat it as untrusted: keep only
   * user/assistant messages and complete function_call ↔ output pairs, drop
   * reasoning items (not needed across turns) and shrink old tool outputs.
   */
  sanitizeHistory(items: unknown[]): unknown[] {
    if (!Array.isArray(items)) return [];
    const clean: Record<string, unknown>[] = [];
    for (const raw of items.slice(-HISTORY_MAX_ITEMS)) {
      if (!raw || typeof raw !== "object") continue;
      const it = raw as Record<string, unknown>;
      const callId = typeof it.call_id === "string" && it.call_id.length <= 64 ? it.call_id : null;
      if (it.type === "function_call" && callId && typeof it.name === "string" && /^[a-z_]{1,40}$/.test(it.name)) {
        const args = String(it.arguments ?? "{}");
        if (args.length <= 4000) clean.push({ type: "function_call", call_id: callId, name: it.name, arguments: args });
      } else if (it.type === "function_call_output" && callId) {
        const out = String(it.output ?? "");
        clean.push({ type: "function_call_output", call_id: callId, output: out.length > 9000 ? out.slice(0, 9000) + "…[truncated]" : out });
      } else if ((it.type === "message" || it.type === undefined) && ALLOWED_ROLES.has(String(it.role))) {
        const text = extractText(it.content);
        if (text) clean.push({ role: it.role, content: text });
      }
    }
    // Drop orphaned calls/outputs so the API never sees an unmatched pair.
    const calls = new Set(clean.filter((i) => i.type === "function_call").map((i) => i.call_id));
    const outputs = new Set(clean.filter((i) => i.type === "function_call_output").map((i) => i.call_id));
    const paired = clean.filter((i) => {
      if (i.type === "function_call") return outputs.has(i.call_id);
      if (i.type === "function_call_output") return calls.has(i.call_id);
      return true;
    });
    // A size budget for the whole history: drop the oldest items until it fits (the session
    // state carries the project, so old turns are the cheapest thing to lose).
    let size = paired.reduce((n, i) => n + JSON.stringify(i).length, 0);
    let from = 0;
    while (size > HISTORY_MAX_CHARS && from < paired.length) size -= JSON.stringify(paired[from++]).length;
    const kept = paired.slice(from);
    // Start at a user message (which also drops a call whose output was cut away, or vice versa).
    const first = kept.findIndex((i) => i.role === "user");
    return first >= 0 ? kept.slice(first) : [];
  }
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content.slice(0, 8000);
  if (Array.isArray(content)) {
    return content
      .map((c) => (c && typeof c === "object" && "text" in c ? String((c as { text: unknown }).text) : ""))
      .join("")
      .slice(0, 8000);
  }
  return "";
}

/** The conversation model (OPENAI_MODEL), governed by its rate limits (OPENAI_RPM / _TPM / _RPD). */
export function createLlmFromEnv(): LlmClient {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const spec = modelSpec("chat")!;
  const cap = Number(process.env.LLM_MAX_OUTPUT_TOKENS);
  return new OpenAIResponsesClient(key, spec.model, spec.effort, Number.isFinite(cap) && cap > 0 ? cap : 2500, spec);
}
