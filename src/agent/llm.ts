import OpenAI from "openai";

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
}

export interface LlmClient {
  stream(req: LlmRequest): AsyncIterable<LlmEvent>;
  userMessage(text: string): unknown;
  toolOutput(callId: string, output: string): unknown;
  /** Make stored history safe & portable for the next turn. */
  sanitizeHistory(items: unknown[]): unknown[];
}

const ALLOWED_ROLES = new Set(["user", "assistant"]);

export class OpenAIResponsesClient implements LlmClient {
  private client: OpenAI;
  constructor(
    apiKey: string,
    private model: string,
    private reasoningEffort: "none" | "minimal" | "low" | "medium" | "high" = "low",
  ) {
    this.client = new OpenAI({ apiKey });
  }

  private get isReasoningModel() {
    return /^(gpt-5|gpt-6|o\d)/.test(this.model);
  }

  async *stream(req: LlmRequest): AsyncIterable<LlmEvent> {
    const body = {
      model: this.model,
      instructions: req.instructions,
      input: req.input,
      tools: req.tools,
      parallel_tool_calls: true,
      store: false,
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
    for (const raw of items.slice(-120)) {
      if (!raw || typeof raw !== "object") continue;
      const it = raw as Record<string, unknown>;
      if (it.type === "function_call" && typeof it.call_id === "string" && typeof it.name === "string") {
        clean.push({ type: "function_call", call_id: it.call_id, name: it.name, arguments: String(it.arguments ?? "{}") });
      } else if (it.type === "function_call_output" && typeof it.call_id === "string") {
        const out = String(it.output ?? "");
        clean.push({ type: "function_call_output", call_id: it.call_id, output: out.length > 6000 ? out.slice(0, 6000) + "…[truncated]" : out });
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
    // Start at a user message.
    const first = paired.findIndex((i) => i.role === "user");
    return first >= 0 ? paired.slice(first) : [];
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

export function createLlmFromEnv(): LlmClient {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const model = process.env.OPENAI_MODEL ?? "gpt-5.4-mini";
  const effort = (process.env.OPENAI_REASONING_EFFORT as "low") ?? "low";
  return new OpenAIResponsesClient(key, model, effort);
}
