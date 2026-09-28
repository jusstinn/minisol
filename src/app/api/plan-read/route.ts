import { planReadAvailable, PlanReadError, planReaderFromEnv } from "@/agent/planReader";
import { getTenant } from "@/config/tenant";
import { PLAN_READ_MAX_BODY, validatePlanReadBody } from "@/lib/planRead";
import { clientKey, rateLimit } from "@/lib/rateLimit";
import { sessionFromRequest } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Optional "read the dimensions off my plan" with a vision model.
 * GET  → { available } so the UI only shows the button when a key is configured.
 * POST → { result } for one downscaled JPEG data URL (≤ 1.5 MB). 501 when AI is off.
 * The image is never logged or stored (store: false at the provider too).
 */

export async function GET(req: Request) {
  const tenant = getTenant(new URL(req.url).searchParams.get("tenant"));
  const who = sessionFromRequest(req, tenant.id);
  return Response.json({ available: who.ok && planReadAvailable() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > PLAN_READ_MAX_BODY + 1024) return Response.json({ error: "Image too large (max 1.5 MB)" }, { status: 413 });

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  if (raw.length > PLAN_READ_MAX_BODY + 1024) return Response.json({ error: "Image too large (max 1.5 MB)" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const tenantId = body && typeof body === "object" ? (body as { tenant?: unknown }).tenant : undefined;
  const tenant = getTenant(typeof tenantId === "string" ? tenantId : undefined);

  // Product mode (signed pass links): only a customer with a session may use it.
  const who = sessionFromRequest(req, tenant.id);
  if (!who.ok) return Response.json({ error: who.error }, { status: who.status });

  const v = validatePlanReadBody(body);
  if (!v.ok) return Response.json({ error: v.error }, { status: v.status });

  const reader = planReaderFromEnv();
  if (!reader) return Response.json({ error: "AI plan reading is not configured" }, { status: 501 });

  const ip = clientKey(req);
  const limit = rateLimit(`plan-read:${ip}`, Number(process.env.PLAN_READS_PER_10_MIN ?? 6), 10 * 60_000);
  if (!limit.ok) return Response.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterS) } });

  try {
    const result = await reader.read(v.value, req.signal);
    return Response.json({ result }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const status = e instanceof PlanReadError ? e.status : 502;
    // The message only — the request (and its image) is never logged.
    console.warn("[plan-read] failed:", e instanceof Error ? e.message : "unknown error");
    return Response.json({ error: e instanceof Error ? e.message : "Plan reading failed" }, { status });
  }
}
