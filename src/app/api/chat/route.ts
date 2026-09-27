import { getDataSources } from "@/adapters";
import { createLlmFromEnv } from "@/agent/llm";
import type { LlmClient } from "@/agent/llm";
import { runAgent } from "@/agent/run";
import { runScriptedAgent } from "@/agent/scripted";
import type { AgentEvent, SessionState } from "@/agent/types";
import { getTenant } from "@/config/tenant";

export const runtime = "nodejs";
export const maxDuration = 90;

interface ChatBody {
  memberId?: string;
  message?: string;
  history?: unknown[];
  state?: SessionState;
  tenant?: string;
  lang?: "ro" | "en";
  /** "scripted" forces the offline demo agent (e.g. pitching without network). */
  mode?: "live" | "scripted";
}

/**
 * Streams agent events as NDJSON.
 * Live mode runs the LLM agent; if the model is unavailable (no key, rate limit,
 * outage) before anything was streamed, the turn falls back to the scripted agent
 * so the demo never dead-ends.
 */
export async function POST(req: Request) {
  let body: ChatBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const message = (body.message ?? "").trim().slice(0, 2000);
  if (!message) return Response.json({ error: "message is required" }, { status: 400 });

  const tenant = getTenant(body.tenant);
  const sources = getDataSources(tenant.id);
  const customer = await sources.loyalty.getMember(String(body.memberId ?? ""));
  if (!customer) return Response.json({ error: "Unknown member" }, { status: 404 });

  let llm: LlmClient | null = null;
  let offlineReason: string | undefined;
  if (body.mode === "scripted" || process.env.AGENT_MODE === "scripted") {
    offlineReason = "forced";
  } else {
    try {
      llm = createLlmFromEnv();
    } catch (e) {
      offlineReason = (e as Error).message;
    }
  }

  const state: SessionState = {
    basket: Array.isArray(body.state?.basket) ? body.state!.basket.slice(0, 80) : [],
    storeId: body.state?.storeId,
    quality: body.state?.quality,
    project: body.state?.project,
  };
  const history = Array.isArray(body.history) ? body.history : [];
  const lang = body.lang ?? customer.language;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (ev: AgentEvent) => controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
      const scripted = (reason?: string) =>
        runScriptedAgent({ sources, tenant, customer, message, state, lang, reason, history: llm ? llm.sanitizeHistory(history) : history });
      try {
        if (!llm) {
          for await (const ev of scripted(offlineReason)) send(ev);
          return;
        }
        let streamed = false;
        try {
          send({ type: "mode", mode: "live" });
          for await (const ev of runAgent({ llm, sources, tenant, customer, message, history, state, lang: body.lang, signal: req.signal })) {
            streamed = true;
            send(ev);
          }
        } catch (e) {
          if (streamed || req.signal.aborted) throw e;
          console.warn("[chat] live agent unavailable, falling back to scripted:", (e as Error).message);
          for await (const ev of scripted((e as Error).message.slice(0, 160))) send(ev);
        }
      } catch (e) {
        if (!req.signal.aborted) {
          console.error("[chat]", e);
          send({ type: "error", message: (e as Error).message });
          send({ type: "done", ms: 0 });
        }
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
