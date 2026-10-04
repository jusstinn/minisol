import type { Product } from "@/domain/types";

/**
 * Deterministic demo inventory: the same store+SKU always yields the same quantity,
 * so demos are reproducible without a stock database. Replace via InventoryProvider.
 */

function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 100000) / 100000;
}

const STORE_SIZE: Record<string, number> = {
  "buc-militari": 1.2,
  "buc-berceni": 1.0,
  "buc-colentina": 1.0,
  "buc-balotesti": 0.8,
  cluj: 1.0,
  "timisoara-1": 1.0,
  "timisoara-2": 0.7,
  brasov: 0.9,
  sibiu: 0.7,
  oradea: 0.7,
  constanta: 0.8,
};

export function demoStock(storeId: string, product: Product): number {
  const key = `${storeId}:${product.sku}`;
  const r = hash01(key);
  if (r < 0.05) return 0; // ~5% out of stock
  const size = STORE_SIZE[storeId] ?? 0.8;
  const r2 = hash01(key + "#q");
  let base: number;
  if (product.isTool) base = 3 + r2 * 22;
  else if (product.bulky) base = 25 + r2 * 380;
  else base = 12 + r2 * 140;
  if (r < 0.12) base = 1 + r2 * 4; // ~7% low stock
  return Math.max(0, Math.round(base * size));
}
