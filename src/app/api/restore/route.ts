import { getDataSources } from "@/adapters";
import { restoreSharedProject } from "@/agent/restore";
import { getTenant } from "@/config/tenant";
import { requirePassLink } from "@/lib/passToken";
import { clientKey, rateLimit } from "@/lib/rateLimit";
import { memberFromRequest } from "@/lib/session";
import { MAX_TOKEN_CHARS, decodeSnapshot } from "@/lib/shareLink";

export const runtime = "nodejs";

/**
 * Reopen a project sent from another device ("Trimite pe telefon"): the link's snapshot is
 * decoded, sanitised and recalculated for the member opening it — no LLM call. In product mode
 * the member comes from the pass-link session like every other route (401 without one).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { memberId?: string; tenant?: string; lang?: "ro" | "en"; token?: unknown } | null;
  if (!body || typeof body.token !== "string" || body.token.length > MAX_TOKEN_CHARS || (!body.memberId && !requirePassLink())) {
    return Response.json({ error: "memberId and token required" }, { status: 400 });
  }
  const limit = rateLimit(`restore:${clientKey(req)}`, 30, 10 * 60_000);
  if (!limit.ok) return Response.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterS) } });

  const tenant = getTenant(body.tenant);
  const sources = getDataSources(tenant.id);
  const who = await memberFromRequest(req, sources, { tenantId: tenant.id, claimedMemberId: body.memberId });
  if (!who.ok) return Response.json({ error: who.error }, { status: who.status });

  const snap = await decodeSnapshot(body.token);
  if (!snap) return Response.json({ error: "This link doesn't contain a project" }, { status: 400 });
  const lang = body.lang === "en" || body.lang === "ro" ? body.lang : snap.lang;

  const r = await restoreSharedProject({ sources, customer: who.customer, tenant, lang, now: new Date() }, snap);
  if ("error" in r) return Response.json({ error: r.error }, { status: 422 });
  return Response.json(r);
}
