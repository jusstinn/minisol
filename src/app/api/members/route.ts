import { getDataSources } from "@/adapters";
import { personaOf } from "@/adapters/demo";
import { getTenant } from "@/config/tenant";
import { LOYALTY } from "@/domain/loyalty";
import { memberSummary, sessionFromRequest } from "@/lib/session";
import { clientKey, rateLimit } from "@/lib/rateLimit";

/**
 * Demo: the member picker (simulates arriving from a wallet-pass deep link).
 * Product mode (REQUIRE_PASS_LINK=1): only the member of the signed pass-link session, 401 without one.
 */
export async function GET(req: Request) {
  const limit = rateLimit(`members:${clientKey(req)}`, 60, 10 * 60_000);
  if (!limit.ok) return Response.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterS) } });
  const tenant = getTenant(new URL(req.url).searchParams.get("tenant"));
  const sources = getDataSources(tenant.id);
  const loyalty = { tierThresholds: LOYALTY.tierThresholds, pointValueRon: LOYALTY.pointValueRon };

  const auth = sessionFromRequest(req, tenant.id);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (auth.session) {
    const [customer, stores] = await Promise.all([sources.loyalty.getMember(auth.session.memberId), sources.stores.list()]);
    if (!customer) return Response.json({ error: "Unknown member" }, { status: 404 });
    return Response.json({ tenant, loyalty, members: [memberSummary(customer, stores)] }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const [members, stores] = await Promise.all([sources.loyalty.listDemoMembers(), sources.stores.list()]);
  return Response.json({
    tenant,
    loyalty,
    members: members.map((m) => ({ ...memberSummary(m, stores), ...personaOf(m.memberId) })),
  });
}
