import { getDataSources } from "@/adapters";
import { basketLook, priceBasket } from "@/agent/tools";
import { getTenant } from "@/config/tenant";
import { readJson } from "@/lib/body";
import { clientKey, rateLimit } from "@/lib/rateLimit";
import type { BasketItem } from "@/domain/quote";
import { requirePassLink } from "@/lib/passToken";
import { memberFromRequest } from "@/lib/session";

/**
 * Re-price a basket without the LLM — used when the customer edits the list
 * directly in the UI (qty steppers, "add suggestion", switch store).
 */
export async function POST(req: Request) {
  const limit = rateLimit(`quote:${clientKey(req)}`, 240, 10 * 60_000);
  if (!limit.ok) return Response.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterS) } });
  const parsed = await readJson(req, 256_000);
  if (!parsed.ok) return parsed.res;
  const body = parsed.body as { memberId?: string; items?: BasketItem[]; storeId?: string; tenant?: string; lang?: "ro" | "en" } | null;
  // In product mode (signed pass links) the member comes from the session, so memberId is not required.
  if (!body || !Array.isArray(body.items) || (!body.memberId && !requirePassLink())) {
    return Response.json({ error: "memberId and items required" }, { status: 400 });
  }
  const tenant = getTenant(body.tenant);
  const sources = getDataSources(tenant.id);
  const who = await memberFromRequest(req, sources, { tenantId: tenant.id, claimedMemberId: body.memberId });
  if (!who.ok) return Response.json({ error: who.error }, { status: who.status });
  const customer = who.customer;
  // Round before filtering so 0.4 never becomes a zero-quantity line; roles are re-checked in the quote engine.
  const items = body.items
    .filter((i) => typeof i?.sku === "string")
    .slice(0, 80)
    .map((i) => ({ sku: i.sku, qty: Math.min(999, Math.round(Number(i.qty))), role: i.role, basis: typeof i.basis === "string" ? i.basis.slice(0, 200) : undefined }))
    .filter((i) => i.qty > 0);
  const stores = await sources.stores.list();
  const storeId = stores.some((s) => s.id === body.storeId) ? body.storeId! : customer.homeStoreId;
  const [quote, look] = await Promise.all([
    priceBasket({ sources, customer, state: { basket: items, storeId }, lang: body.lang === "en" || body.lang === "ro" ? body.lang : customer.language, now: new Date() }, items, storeId),
    // So swapping an option re-draws the sketch with the new product.
    basketLook({ sources }, items),
  ]);
  return Response.json({ quote, look });
}
