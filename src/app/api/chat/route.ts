import { getDataSources } from "@/adapters";
import { createLlmFromEnv } from "@/agent/llm";
import type { LlmClient } from "@/agent/llm";
import { runAgent } from "@/agent/run";
import { runScriptedAgent } from "@/agent/scripted";
import { sanitizeState } from "@/agent/state";
import type { AgentEvent, SessionState } from "@/agent/types";
import { getTenant } from "@/config/tenant";
import { clientKey, rateLimit } from "@/lib/rateLimit";
import { memberFromRequest } from "@/lib/session";

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
  // Valid JSON is not necessarily an object ("null", "[]", 5): never let a TypeError become a 500.
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Expected a JSON object" }, { status: 400 });
  const message = (typeof body.message === "string" ? body.message : "").trim().slice(0, 2000);
  if (!message) return Response.json({ error: "message is required" }, { status: 400 });

  const tenant = getTenant(body.tenant);
  const sources = getDataSources(tenant.id);
  // Product mode: the member comes from the pass-link session; body.memberId is ignored.
  const who = await memberFromRequest(req, sources, { tenantId: tenant.id, claimedMemberId: body.memberId });
  if (!who.ok) return Response.json({ error: who.error }, { status: who.status });
  const customer = who.customer;

  const ip = clientKey(req);
  const hard = rateLimit(`all:${ip}`, 60, 10 * 60_000);
  if (!hard.ok) return Response.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(hard.retryAfterS) } });

  let llm: LlmClient | null = null;
  let offlineReason: string | undefined;
  if (body.mode === "scripted" || process.env.AGENT_MODE === "scripted") {
    offlineReason = "forced";
  } else if (!rateLimit(`llm:${ip}`, Number(process.env.LLM_TURNS_PER_10_MIN ?? 12), 10 * 60_000).ok) {
    // Protect the model budget on a public demo: degrade to the offline agent, don't fail.
    offlineReason = "per-visitor AI limit reached";
  } else {
    try {
      llm = createLlmFromEnv();
    } catch (e) {
      offlineReason = (e as Error).message;
    }
  }

  // Session state comes from the browser: validate it before any tool sees it.
  const stores = await sources.stores.list();
  const state = sanitizeState(body.state, stores.map((s) => s.id));
  // The scripted agent echoes history back: keep it as bounded as the live client's sanitiser does.
  const history = Array.isArray(body.history) ? body.history.slice(-120) : [];
  const bodyLang = body.lang === "ro" || body.lang === "en" ? body.lang : undefined;
  const lang = bodyLang ?? customer.language;

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
          for await (const ev of runAgent({ llm, sources, tenant, customer, message, history, state, lang: bodyLang, signal: req.signal })) {
            // Status lines alone (e.g. the prefilled profile lookup) don't commit us to the live agent.
            if (ev.type !== "status" && ev.type !== "mode") streamed = true;
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
