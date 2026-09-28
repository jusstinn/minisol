import { getDataSources } from "@/adapters";
import { getTenant } from "@/config/tenant";
import { AISLES } from "@/data/stores";
import { productDetail } from "@/domain/detail";
import type { StockAtStore } from "@/domain/detail";
import { sessionFromRequest } from "@/lib/session";
import { clientKey, rateLimit } from "@/lib/rateLimit";

/**
 * Product sheet ("fișă tehnică"): names and description in the reader's language,
 * the full spec table, packshot + technical sketch spec, and stock at a store.
 *
 * GET /api/product?sku=11938736&tenant=hornbach&lang=ro&storeId=buc-militari
 */
export async function GET(req: Request) {
  const limit = rateLimit(`product:${clientKey(req)}`, 300, 10 * 60_000);
  if (!limit.ok) return Response.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterS) } });
  const q = new URL(req.url).searchParams;
  const tenant = getTenant(q.get("tenant"));
  // Product mode: only customers who arrived through a signed pass link (no member data here, just the gate).
  const auth = sessionFromRequest(req, tenant.id);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const sku = (q.get("sku") ?? "").trim();
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(sku)) return Response.json({ error: "sku is required (letters, digits, - or _)" }, { status: 400 });
  const langParam = q.get("lang");
  if (langParam !== null && langParam !== "ro" && langParam !== "en") return Response.json({ error: "lang must be ro or en" }, { status: 400 });
  const storeParam = q.get("storeId");
  if (storeParam !== null && !/^[A-Za-z0-9_-]{1,64}$/.test(storeParam)) return Response.json({ error: "invalid storeId" }, { status: 400 });

  const sources = getDataSources(tenant.id);
  const product = await sources.catalog.get(sku);
  if (!product) return Response.json({ error: "Unknown product" }, { status: 404 });

  let stock: StockAtStore | null = null;
  if (storeParam) {
    const store = (await sources.stores.list()).find((s) => s.id === storeParam);
    if (!store) return Response.json({ error: "Unknown store" }, { status: 404 });
    const units = await sources.inventory.stock([store.id], [product.sku]);
    stock = { storeId: store.id, storeName: store.name, available: units.get(`${store.id}:${product.sku}`) ?? 0, aisle: AISLES[product.category] ?? 1 };
  }

  return Response.json(
    { product: productDetail(product, langParam ?? "ro", stock) },
    // Specs are static per SKU; stock changes, so keep the browser cache short and private.
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
