import catalogJson from "@/data/catalog.json";
import { CUSTOMER_SEEDS } from "@/data/customers";
import { OFFERS } from "@/data/offers";
import { withPriceHistory } from "@/data/priceHistory";
import { demoStock } from "@/data/stock";
import { STORES } from "@/data/stores";
import { chooseLine } from "@/domain/resolve";
import { scoreProduct } from "@/domain/search";
import type { Customer, Product } from "@/domain/types";
import { MATERIAL_ROLES } from "@/domain/types";
import type { Tenant } from "@/config/tenant";
import type { DataSources, ProductQuery } from "./types";

/**
 * Demo catalogue as the retailer feed would deliver it, with each product's 30-day lowest
 * price attached (seeded demo history; a production adapter takes it from the retailer).
 * The seeded history is relative to today, so the lowest price does not depend on the date.
 */
export const DEMO_CATALOG = (catalogJson as unknown as Product[]).map((p) => withPriceHistory(p));
const BY_SKU = new Map(DEMO_CATALOG.map((p) => [p.sku, p]));

function buildCustomers(): Customer[] {
  return CUSTOMER_SEEDS.map((seed) => {
    const { persona: _p, personaEn: _pe, purchases, ...rest } = seed;
    const home = STORES.find((s) => s.id === seed.homeStoreId)!;
    return {
      ...rest,
      // Without location consent we only know the home store, never the member's position.
      location: seed.consent.location ? seed.location : { city: home.city, lat: home.lat, lng: home.lng },
      purchases: purchases.map((p) => ({
        date: p.date,
        storeId: p.storeId,
        items: p.items.flatMap((it) => {
          const unit = MATERIAL_ROLES[it.role].unit;
          const line = chooseLine({ role: it.role, quantity: 1, unit, basis: "", isTool: false }, DEMO_CATALOG, it.quality ?? "standard");
          return line[0] ? [{ sku: line[0].sku, qty: it.qty }] : [];
        }),
      })),
    };
  });
}

let customers: Customer[] | undefined;
function allCustomers() {
  customers ??= buildCustomers();
  return customers;
}

export function personaOf(memberId: string) {
  const s = CUSTOMER_SEEDS.find((c) => c.memberId === memberId);
  return s ? { persona: s.persona, personaEn: s.personaEn } : undefined;
}

export function createDemoSources(tenant: Tenant): DataSources {
  const stores = STORES.map((s) => ({ ...s, name: `${tenant.storePrefix} ${s.name}` }));
  return {
    catalog: {
      async get(sku) {
        return BY_SKU.get(sku);
      },
      async getMany(skus) {
        return skus.map((s) => BY_SKU.get(s)).filter((p): p is Product => Boolean(p));
      },
      async byRoles(roles) {
        const set = new Set(roles);
        return DEMO_CATALOG.filter((p) => p.roles.some((r) => set.has(r)));
      },
      async search(q: ProductQuery) {
        let pool = DEMO_CATALOG;
        if (q.role) pool = pool.filter((p) => p.roles.includes(q.role!));
        if (q.category) pool = pool.filter((p) => p.category === q.category);
        if (q.quality) pool = pool.filter((p) => p.quality === q.quality);
        if (q.maxPrice) pool = pool.filter((p) => p.price <= q.maxPrice!);
        const scored = pool
          .map((p) => ({ p, s: q.text ? scoreProduct(p, q.text) : 1 }))
          .filter((x) => x.s > 0.34)
          .sort((a, b) => b.s - a.s || b.p.rating - a.p.rating);
        return scored.slice(0, q.limit ?? 8).map((x) => x.p);
      },
    },
    inventory: {
      async stock(storeIds, skus) {
        const out = new Map<string, number>();
        for (const st of storeIds) {
          for (const sku of skus) {
            const p = BY_SKU.get(sku);
            if (p) out.set(`${st}:${sku}`, demoStock(st, p));
          }
        }
        return out;
      },
    },
    stores: {
      async list() {
        return stores;
      },
    },
    loyalty: {
      async getMember(memberId) {
        return allCustomers().find((c) => c.memberId === memberId);
      },
      async getOffers() {
        return OFFERS;
      },
      async listDemoMembers() {
        return allCustomers();
      },
    },
  };
}
