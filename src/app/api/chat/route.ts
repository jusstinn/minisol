import { getDataSources } from "@/adapters";
import { createLlmFromEnv } from "@/agent/llm";
import type { LlmClient } from "@/agent/llm";
import { runAgent } from "@/agent/run";
import { runScriptedAgent } from "@/agent/scripted";
import { sanitizeState } from "@/agent/state";
import type { AgentEvent, SessionState } from "@/agent/types";
import { getTenant } from "@/config/tenant";
import { readJson } from "@/lib/body";
import { createHash } from "node:crypto";
import { historyKey, openHistory, sealHistory } from "@/agent/historySeal";
import { allowAiTurn, recordAiTokens } from "@/lib/budget";
import { clientKey, rateLimit } from "@/lib/rateLimit";
import { memberFromRequest } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 90;

interface ChatBody {
  memberId?: string;
  message?: string;
  history?: unknown[];
  /** The signature the server sent with that history. */
  historySig?: unknown;
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
  // History + state round-trip from the browser: a couple of MB at most, never parse more.
  const parsed = await readJson(req, 2_000_000);
  if (!parsed.ok) return parsed.res;
  const body = parsed.body as ChatBody;
  // Valid JSON is not necessarily an object ("null", "[]", 5): never let a TypeError become a 500.
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Expected a JSON object" }, { status: 400 });
  const message = (typeof body.message === "string" ? body.message : "").trim().slice(0, 2000);
  if (!message) return Response.json({ error: "message is required" }, { status: 400 });

  const ip = clientKey(req);
  const hard = rateLimit(`all:${ip}`, 60, 10 * 60_000);
  if (!hard.ok) return Response.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(hard.retryAfterS) } });

  const tenant = getTenant(body.tenant);
  const sources = getDataSources(tenant.id);
  // Product mode: the member comes from the pass-link session; body.memberId is ignored.
  const who = await memberFromRequest(req, sources, { tenantId: tenant.id, claimedMemberId: body.memberId });
  if (!who.ok) return Response.json({ error: who.error }, { status: who.status });
  const customer = who.customer;
  const memberId = who.session?.memberId;

  let llm: LlmClient | null = null;
  let offlineReason: string | undefined;
  if (body.mode === "scripted" || process.env.AGENT_MODE === "scripted") {
    offlineReason = "forced";
  } else if (!process.env.OPENAI_API_KEY) {
    offlineReason = "OPENAI_API_KEY is not set";
  } else {
    // Protect the model budget (src/lib/budget.ts): over a limit, degrade to the offline agent, don't fail.
    const allowed = await allowAiTurn({ ip, tenant: tenant.id, memberId });
    if (!allowed.ok) offlineReason = allowed.reason;
    else {
      try {
        llm = createLlmFromEnv();
      } catch (e) {
        offlineReason = (e as Error).message;
      }
    }
  }

  // Session state comes from the browser: validate it before any tool sees it.
  const stores = await sources.stores.list();
  const state = sanitizeState(body.state, stores.map((s) => s.id));
  // History comes back from the browser: only a history this server signed is used as is (see
  // historySeal.ts); an edited one keeps just the customer's own messages. With no model configured
  // there is nothing to protect, and the offline agent gets it as it was (bounded).
  const key = historyKey();
  const rawHistory = Array.isArray(body.history) ? body.history.slice(-120) : [];
  const history = key ? openHistory(rawHistory, body.historySig, key).items : rawHistory;
  const bodyLang = body.lang === "ro" || body.lang === "en" ? body.lang : undefined;
  const lang = bodyLang ?? customer.language;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (ev: AgentEvent) => {
        const out = ev.type === "history" && key ? { ...ev, sig: sealHistory(ev.items, key) } : ev;
        controller.enqueue(encoder.encode(JSON.stringify(out) + "\n"));
      };
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
          const safetyId = createHash("sha256").update(`${tenant.id}:${customer.memberId}`).digest("hex").slice(0, 32);
          const onUsage = (tokens: number) => void recordAiTokens({ tenant: tenant.id, memberId }, tokens);
          for await (const ev of runAgent({ llm, sources, tenant, customer, message, history, state, lang: bodyLang, signal: req.signal, safetyId, onUsage })) {
            // Status lines alone (e.g. the prefilled profile lookup) don't commit us to the live agent.
            if (ev.type !== "status" && ev.type !== "mode") streamed = true;
            send(ev);
          }
        } catch (e) {
          if (streamed || req.signal.aborted) throw e;
          // The provider's message stays in the log (it can name the account); the customer gets a generic reason.
          console.warn("[chat] live agent unavailable, falling back to scripted:", (e as Error).message);
          for await (const ev of scripted("AI temporarily unavailable")) send(ev);
        }
      } catch (e) {
        if (!req.signal.aborted) {
          console.error("[chat]", e);
          send({ type: "error", message: lang === "en" ? "Something went wrong. Please try again." : "Ceva n-a mers. Te rog încearcă din nou." });
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
