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

/**
 * Who is asking, for rate limits. On Vercel `x-forwarded-for` is set by the platform (not the
 * client). An IPv6 visitor usually controls a whole /64, so that prefix counts as one visitor.
 */
export function clientKey(req: Request): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip")?.trim() || "local";
  return ip.includes(":") ? ipv6Prefix64(ip) : ip;
}

/** "2001:db8:1:2:aaaa::1" → "2001:db8:1:2::/64" (handles "::" and IPv4-mapped addresses). */
export function ipv6Prefix64(ip: string): string {
  const addr = ip.replace(/^\[|\]$/g, "").split("%")[0].toLowerCase();
  const v4 = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) return v4[1];
  const [head, tail = ""] = addr.split("::");
  const h = head ? head.split(":") : [];
  const t = addr.includes("::") && tail ? tail.split(":") : [];
  const full = addr.includes("::") ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t] : h;
  return `${full.slice(0, 4).map((x) => x.replace(/^0+(?=.)/, "") || "0").join(":")}::/64`;
}
