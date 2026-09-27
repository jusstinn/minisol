/**
 * Best-effort fixed-window rate limiter (per server instance). Protects the LLM
 * budget on a public demo; use a shared store (e.g. Upstash/Redis) in production.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterS: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
    return { ok: true, retryAfterS: 0 };
  }
  b.count++;
  return { ok: b.count <= limit, retryAfterS: Math.ceil((b.resetAt - now) / 1000) };
}

export function clientKey(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}
