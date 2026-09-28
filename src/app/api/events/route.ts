import { getTenant } from "@/config/tenant";
import { readJson } from "@/lib/body";
import { clientKey, rateLimit } from "@/lib/rateLimit";
import { MAX_BATCH, cleanUsageEvent, minuteOf } from "@/lib/usage";
import type { UsageRecord } from "@/lib/usage";
import { usageSink } from "@/lib/usageSink";

export const runtime = "nodejs";

/**
 * Anonymous usage events (see src/lib/usage.ts). Takes a small batch, keeps only declared
 * events and values, adds the tenant and the minute, and hands them to the sink. The IP is
 * used for rate limiting in memory only; nothing about the visitor is recorded.
 */
export async function POST(req: Request) {
  const sink = usageSink();
  if (!sink) return new Response(null, { status: 204 });
  const limit = rateLimit(`events:${clientKey(req)}`, 60, 60_000);
  if (!limit.ok) return new Response(null, { status: 429, headers: { "Retry-After": String(limit.retryAfterS) } });

  const parsed = await readJson(req, 16_000);
  if (!parsed.ok) return parsed.res;
  const body = parsed.body as { tenant?: unknown; events?: unknown } | null;
  if (!body || typeof body !== "object" || !Array.isArray(body.events)) return Response.json({ error: "events required" }, { status: 400 });

  const tenant = getTenant(body.tenant).id;
  const at = minuteOf(new Date());
  const records: UsageRecord[] = body.events
    .slice(0, MAX_BATCH)
    .map(cleanUsageEvent)
    .filter((e) => e !== null)
    .map((e) => ({ ...e, tenant, at }));
  if (records.length) await sink.record(records);
  return new Response(null, { status: 204 });
}
