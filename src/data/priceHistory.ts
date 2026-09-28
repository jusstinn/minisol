import type { Product } from "@/domain/types";

/**
 * Demo price history. A real retailer adapter takes the 30-day lowest price from the
 * retailer's pricing system; here every product gets a small, deterministic history
 * (seeded by its SKU, so it never changes between runs) so the price-display rules
 * (Directive 98/6/EC art. 6a, as amended by the Omnibus Directive) have something to act on:
 *
 * - most products: unchanged price for months;
 * - some: a promotion that ended within the last 30 days (lowest < today's price);
 * - some: a recent price increase (the old, lower price is still the 30-day lowest);
 * - some: a recent price cut (today's price is the lowest).
 */

export interface PricePoint {
  /** ISO date (YYYY-MM-DD) from which `price` applied. */
  from: string;
  /** RON incl. VAT, per sales unit. */
  price: number;
}

export const PRICE_WINDOW_DAYS = 30;

const DAY = 86_400_000;

/** FNV-1a → 32-bit seed. */
function seedOf(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: tiny deterministic PRNG in [0, 1). */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cents = (n: number) => Math.round(n * 100) / 100;
/** Shelf-style price: whole lei + ,90 above 10 lei, one decimal below. */
const shelf = (n: number) => (n >= 10 ? Math.floor(n) + 0.9 : Math.round(n * 10) / 10);
const isoDaysAgo = (today: Date, days: number) => new Date(today.getTime() - days * DAY).toISOString().slice(0, 10);

/** A price strictly below/above `price`, shelf-rounded where that keeps the direction. */
function moved(price: number, factor: number): number | undefined {
  const raw = price * factor;
  for (const c of [shelf(raw), cents(raw)]) {
    if (c > 0 && (factor < 1 ? c < price : c > price)) return c;
  }
  return undefined;
}

/** The product's price changes, oldest first; the last point is today's list price. */
export function priceHistory(p: Pick<Product, "sku" | "price">, today: Date = new Date()): PricePoint[] {
  const r = rng(seedOf(p.sku));
  const roll = r();
  const at = (days: number, price: number): PricePoint => ({ from: isoDaysAgo(today, days), price });
  const stable = [at(120, p.price)];

  if (roll < 0.62) return stable;

  if (roll < 0.78) {
    // A promotion (8–20 % off, 5–9 days) that ended 2–18 days ago.
    const promo = moved(p.price, 1 - (0.08 + r() * 0.12));
    const endedAgo = 2 + Math.floor(r() * 17);
    const lasted = 5 + Math.floor(r() * 5);
    if (promo === undefined) return stable;
    return [at(120, p.price), at(endedAgo + lasted, promo), at(endedAgo, p.price)];
  }

  if (roll < 0.9) {
    // Price went up 4–10 % some 5–25 days ago.
    const before = moved(p.price, 1 - (0.04 + r() * 0.06));
    if (before === undefined) return stable;
    return [at(120, before), at(5 + Math.floor(r() * 21), p.price)];
  }

  // Price came down 5–15 % some 3–20 days ago: today's price is the 30-day lowest.
  const before = moved(p.price, 1 + 0.05 + r() * 0.1);
  if (before === undefined) return stable;
  return [at(120, before), at(3 + Math.floor(r() * 18), p.price)];
}

/**
 * Lowest price applied in the `days` before `today`, today's price included — so it is
 * never above the current list price, which is what a reduction is announced against.
 */
export function lowestPriceInWindow(history: PricePoint[], today: Date = new Date(), days = PRICE_WINDOW_DAYS): number | undefined {
  if (history.length === 0) return undefined;
  const start = isoDaysAgo(today, days);
  const sorted = [...history].sort((a, b) => a.from.localeCompare(b.from));
  // The price in force at the window's start, plus every change inside it.
  let inForce = sorted[0];
  const changes: PricePoint[] = [];
  for (const pt of sorted) {
    if (pt.from <= start) inForce = pt;
    else changes.push(pt);
  }
  const prices = [...(inForce.from <= start ? [inForce.price] : []), ...changes.map((c) => c.price)];
  return prices.length ? Math.min(...prices) : undefined;
}

/** The product as a retailer feed would deliver it: with its 30-day lowest price attached. */
export function withPriceHistory(p: Product, today: Date = new Date()): Product {
  const low = lowestPriceInWindow(priceHistory(p, today), today);
  return low === undefined ? p : { ...p, lowestPrice30d: Math.min(low, p.price) };
}
