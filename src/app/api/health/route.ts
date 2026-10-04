import OpenAI from "openai";
import { modelSpec } from "@/agent/models";
import { requirePassLink } from "@/lib/passToken";
import { clientKey, rateLimit } from "@/lib/rateLimit";
import { siteLogin } from "@/lib/siteLogin";

export const runtime = "nodejs";

type Ai = "live" | "not_configured" | "key_invalid" | "model_unavailable" | "rate_limited" | "unreachable" | "off";

const cached = new Map<string, { at: number; ai: Ai }>();

/** Is this model usable right now? A key/model check that spends no tokens (models.retrieve). */
async function aiStatus(model: string): Promise<Ai> {
  if (process.env.AGENT_MODE === "scripted") return "off";
  const key = process.env.OPENAI_API_KEY;
  if (!key) return "not_configured";
  const hit = cached.get(model);
  if (hit && Date.now() - hit.at < 60_000) return hit.ai;
  let ai: Ai;
  try {
    await new OpenAI({ apiKey: key, maxRetries: 0, timeout: 8_000 }).models.retrieve(model);
    ai = "live";
  } catch (e) {
    const status = (e as { status?: number }).status;
    ai = status === 401 ? "key_invalid" : status === 404 ? "model_unavailable" : status === 429 ? "rate_limited" : "unreachable";
  }
  cached.set(model, { at: Date.now(), ai });
  return ai;
}

/**
 * Pre-demo check: is the AI live, and how is the site protected? Behind the site sign-in when it's on
 * (src/proxy.ts). Nothing secret is returned — states only.
 */
export async function GET(req: Request) {
  const limit = rateLimit(`health:${clientKey(req)}`, 20, 10 * 60_000);
  if (!limit.ok) return Response.json({ error: "Too many requests" }, { status: 429 });
  const shared = Boolean((process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL) && (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN));
  const chat = modelSpec("chat")!;
  const plan = modelSpec("plan");
  return Response.json(
    {
      ai: await aiStatus(chat.model),
      model: chat.model,
      plan: plan ? { model: plan.model, ai: await aiStatus(plan.model) } : null,
      signIn: Boolean(siteLogin()),
      passLinks: requirePassLink(),
      counters: shared ? "shared" : "per-instance",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
