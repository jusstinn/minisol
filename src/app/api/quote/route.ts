import { getDataSources } from "@/adapters";
import { priceBasket } from "@/agent/tools";
import { getTenant } from "@/config/tenant";
import type { BasketItem } from "@/domain/quote";

/**
 * Re-price a basket without the LLM — used when the customer edits the list
 * directly in the UI (qty steppers, "add suggestion", switch store).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { memberId?: string; items?: BasketItem[]; storeId?: string; tenant?: string; lang?: "ro" | "en" } | null;
  if (!body?.memberId || !Array.isArray(body.items)) return Response.json({ error: "memberId and items required" }, { status: 400 });
  const tenant = getTenant(body.tenant);
  const sources = getDataSources(tenant.id);
  const customer = await sources.loyalty.getMember(body.memberId);
  if (!customer) return Response.json({ error: "Unknown member" }, { status: 404 });
  // Round before filtering so 0.4 never becomes a zero-quantity line; roles are re-checked in the quote engine.
  const items = body.items
    .filter((i) => typeof i?.sku === "string")
    .slice(0, 80)
    .map((i) => ({ sku: i.sku, qty: Math.min(999, Math.round(Number(i.qty))), role: i.role, basis: typeof i.basis === "string" ? i.basis.slice(0, 200) : undefined }))
    .filter((i) => i.qty > 0);
  const stores = await sources.stores.list();
  const storeId = stores.some((s) => s.id === body.storeId) ? body.storeId! : customer.homeStoreId;
  const quote = await priceBasket(
    { sources, customer, state: { basket: items, storeId }, lang: body.lang ?? customer.language, now: new Date() },
    items,
    storeId,
  );
  return Response.json({ quote });
}
