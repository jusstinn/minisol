import { getDataSources } from "@/adapters";
import { priceBasket } from "@/agent/tools";
import { getTenant } from "@/config/tenant";
import type { BasketItem } from "@/domain/quote";

/**
 * Re-price a basket without the LLM — used when the customer edits the list
 * directly in the UI (qty steppers, "add suggestion", switch store).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { memberId?: string; items?: BasketItem[]; storeId?: string; tenant?: string } | null;
  if (!body?.memberId || !Array.isArray(body.items)) return Response.json({ error: "memberId and items required" }, { status: 400 });
  const tenant = getTenant(body.tenant);
  const sources = getDataSources(tenant.id);
  const customer = await sources.loyalty.getMember(body.memberId);
  if (!customer) return Response.json({ error: "Unknown member" }, { status: 404 });
  const items = body.items
    .filter((i) => typeof i?.sku === "string" && Number(i.qty) > 0)
    .slice(0, 80)
    .map((i) => ({ sku: i.sku, qty: Math.min(999, Math.round(Number(i.qty))), role: i.role, basis: i.basis, isTool: i.isTool }));
  const storeId = body.storeId ?? customer.homeStoreId;
  const quote = await priceBasket(
    { sources, customer, state: { basket: items, storeId }, lang: customer.language, now: new Date() },
    items,
    storeId,
  );
  return Response.json({ quote });
}
