import { getDataSources } from "@/adapters";
import { createLlmFromEnv } from "@/agent/llm";
import { runAgent } from "@/agent/run";
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
}

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

  let llm;
  try {
    llm = createLlmFromEnv();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 503 });
  }

  const state: SessionState = {
    basket: Array.isArray(body.state?.basket) ? body.state!.basket.slice(0, 80) : [],
    storeId: body.state?.storeId,
    quality: body.state?.quality,
    project: body.state?.project,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (ev: AgentEvent) => controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
      try {
        for await (const ev of runAgent({
          llm,
          sources,
          tenant,
          customer,
          message,
          history: Array.isArray(body.history) ? body.history : [],
          state,
          lang: body.lang,
          signal: req.signal,
        })) {
          send(ev);
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
