import type { Customer, Offer, Product, Store } from "../types";

let n = 10000000;
export function product(p: Partial<Product> & Pick<Product, "roles" | "price" | "content">): Product {
  n += 7919;
  return {
    sku: String(n),
    name: p.name ?? `Produs ${n}`,
    nameEn: p.nameEn ?? `Product ${n}`,
    brand: p.brand ?? "Testa",
    category: p.category ?? "paint",
    salesUnit: p.salesUnit ?? "buc",
    quality: p.quality ?? "standard",
    specs: p.specs ?? {},
    description: "",
    descriptionEn: "",
    rating: p.rating ?? 4.5,
    isTool: p.isTool ?? false,
    ...p,
  } as Product;
}

export const paint = (litres: number, price: number, extra: Partial<Product> = {}) =>
  product({
    name: `Vopsea lavabilă Testa albă, ${litres} l`,
    roles: ["interior_paint"],
    price,
    content: { amount: litres, unit: "l" },
    specs: { coverageM2PerL: 10 },
    category: "paint",
    ...extra,
  });

export const STORES_FIXTURE: Store[] = [
  { id: "a", name: "Store A", city: "București", lat: 44.43, lng: 26.0, openingHours: "", services: [] },
  { id: "b", name: "Store B", city: "București", lat: 44.36, lng: 26.12, openingHours: "", services: [] },
  { id: "c", name: "Store C", city: "Cluj-Napoca", lat: 46.77, lng: 23.63, openingHours: "", services: [] },
];

export function customer(over: Partial<Customer> = {}): Customer {
  return {
    memberId: "WL-TEST",
    firstName: "Test",
    tier: "Silver",
    points: 1000,
    homeStoreId: "a",
    location: { city: "București", lat: 44.42, lng: 26.03 },
    language: "ro",
    memberSince: "2024-01-01",
    segments: [],
    purchases: [],
    consent: { personalization: true, location: true },
    walletPass: { platform: "apple", installedAt: "2024-01-01" },
    ...over,
  };
}

export function offer(o: Partial<Offer> & Pick<Offer, "id" | "kind">): Offer {
  return {
    title: o.id,
    titleEn: o.id,
    eligibility: {},
    validUntil: "2099-01-01",
    reason: "",
    reasonEn: "",
    ...o,
  };
}
