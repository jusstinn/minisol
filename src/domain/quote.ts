import { artOf } from "./art";
import type { ArtSpec } from "./art";
import { distanceKm } from "./geo";
import { LOYALTY } from "./loyalty";
import type { CategoryId, Customer, Lang, MaterialRole, Offer, Product, Store } from "./types";

/**
 * Deterministic pricing: line totals, best offer per line, basket-level offers,
 * loyalty points, stock at the chosen store and alternatives. The LLM only ever
 * *reads* a Quote — it never does arithmetic on prices.
 */

export interface BasketItem {
  sku: string;
  qty: number;
  role?: MaterialRole;
  basis?: string;
  isTool?: boolean;
}

export type StockStatus = "in_stock" | "low" | "insufficient" | "out";

export interface QuoteLine {
  sku: string;
  name: string;
  brand: string;
  category: CategoryId;
  qty: number;
  salesUnit: string;
  unitPrice: number;
  lineTotal: number;
  discount: number;
  netTotal: number;
  offerId?: string;
  role?: MaterialRole;
  basis?: string;
  isTool: boolean;
  bulky: boolean;
  stock: { available: number; status: StockStatus };
  aisle: number;
  art: ArtSpec;
}

export interface AppliedDiscount {
  offerId: string;
  title: string;
  amount: number;
  kind: Offer["kind"];
}

export interface StoreAvailability {
  storeId: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  distanceKm: number;
  allInStock: boolean;
  missingCount: number;
}

export interface Quote {
  currency: "RON";
  storeId: string;
  storeName: string;
  lines: QuoteLine[];
  subtotal: number;
  discounts: AppliedDiscount[];
  discountTotal: number;
  total: number;
  points: {
    earned: number;
    balance: number;
    tierMultiplier: number;
    bonusNotes: string[];
    redeemablePoints: number;
    redeemableValue: number;
    totalIfRedeemed: number;
  };
  availability: {
    allInStock: boolean;
    missing: { sku: string; name: string; needed: number; available: number }[];
    /** All stores, nearest first. */
    alternatives: StoreAvailability[];
    /** City-level origin used for distances (member location or home store). */
    origin: { city: string; lat: number; lng: number };
  };
  categoryBreakdown: { category: CategoryId; amount: number }[];
  delivery: { fee: number; type: "courier" | "truck"; freeFrom: number | null };
  /** Personal nudges: offers the member is close to unlocking. */
  hints: QuoteHint[];
}

export interface QuoteHint {
  offerId: string;
  kind: "bundle_missing_free_item" | "threshold_close";
  title: string;
  /** For thresholds: RON still needed. For bundles: the role to add. */
  amountToGo?: number;
  role?: MaterialRole;
}

export interface QuoteDeps {
  products: Map<string, Product>;
  stores: Store[];
  stockOf: (storeId: string, sku: string) => number;
  aisleOf: (product: Product) => number;
}

const money = (n: number) => Math.round(n * 100) / 100;

function stockStatus(available: number, qty: number): StockStatus {
  if (available <= 0) return "out";
  if (available < qty) return "insufficient";
  if (available - qty < 5) return "low";
  return "in_stock";
}

/** Offers match on catalogue data only — never on client-supplied basket fields. */
function offerAppliesToLine(o: Offer, p: Product): boolean {
  if (o.kind === "percent_category") return Boolean(o.categories?.includes(p.category));
  if (o.kind === "percent_role") return p.roles.some((r) => o.roles?.includes(r));
  return false;
}

/** Best single percentage discount a product gets from these offers (same rule as quote lines). */
export function bestPercentOff(p: Product, offers: Offer[]): number {
  let best = 0;
  for (const o of offers) {
    if ((o.kind === "percent_category" || o.kind === "percent_role") && offerAppliesToLine(o, p)) best = Math.max(best, o.percent ?? 0);
  }
  return best;
}

export function buildQuote(
  items: BasketItem[],
  ctx: { customer: Customer; storeId: string; offers: Offer[]; lang?: Lang },
  deps: QuoteDeps,
): Quote {
  const store =
    deps.stores.find((s) => s.id === ctx.storeId) ?? deps.stores.find((s) => s.id === ctx.customer.homeStoreId) ?? deps.stores[0];

  // Merge duplicate SKUs so one product = one line.
  const merged = new Map<string, BasketItem>();
  for (const it of items) {
    const p = deps.products.get(it.sku);
    const qty = Math.min(999, Math.round(Number(it.qty)));
    if (!p || !(qty > 0)) continue;
    // A basket item's role is only a hint from the client: keep it only if the product really has it.
    const role = it.role && p.roles.includes(it.role) ? it.role : p.roles[0];
    const prev = merged.get(it.sku);
    merged.set(it.sku, prev ? { ...prev, qty: Math.min(999, prev.qty + qty) } : { ...it, role, qty, isTool: p.isTool });
  }

  const ot = (o: Offer) => (ctx.lang === "en" ? o.titleEn : o.title);
  const percentOffers = ctx.offers.filter((o) => o.kind === "percent_category" || o.kind === "percent_role");
  const lines: QuoteLine[] = [...merged.values()].map((it) => {
    const p = deps.products.get(it.sku)!;
    const lineTotal = money(p.price * it.qty);
    // Best single percentage offer per line — offers never stack on one line.
    let best: { offer: Offer; amount: number } | undefined;
    for (const o of percentOffers) {
      if (!offerAppliesToLine(o, p)) continue;
      const amount = money((lineTotal * (o.percent ?? 0)) / 100);
      if (!best || amount > best.amount) best = { offer: o, amount };
    }
    const available = deps.stockOf(store.id, p.sku);
    return {
      sku: p.sku,
      name: ctx.lang === "en" ? p.nameEn : p.name,
      brand: p.brand,
      category: p.category,
      qty: it.qty,
      salesUnit: p.salesUnit,
      unitPrice: p.price,
      lineTotal,
      discount: best?.amount ?? 0,
      netTotal: money(lineTotal - (best?.amount ?? 0)),
      offerId: best?.offer.id,
      role: it.role,
      basis: it.basis,
      isTool: p.isTool,
      bulky: Boolean(p.bulky),
      stock: { available, status: stockStatus(available, it.qty) },
      aisle: deps.aisleOf(p),
      art: artOf(p),
    };
  });

  const subtotal = money(lines.reduce((s, l) => s + l.lineTotal, 0));
  const discounts: AppliedDiscount[] = [];
  const byOffer = new Map<string, number>();
  for (const l of lines) if (l.offerId) byOffer.set(l.offerId, money((byOffer.get(l.offerId) ?? 0) + l.discount));
  for (const [offerId, amount] of byOffer) {
    const o = ctx.offers.find((x) => x.id === offerId)!;
    discounts.push({ offerId, title: ot(o), amount, kind: o.kind });
  }

  const hints: QuoteHint[] = [];

  // Bundle: buy N units of role A → one unit of the cheapest role-B line free.
  for (const o of ctx.offers.filter((x) => x.kind === "bundle_free_role" && x.bundle)) {
    const b = o.bundle!;
    const has = (l: QuoteLine, role: MaterialRole) => deps.products.get(l.sku)!.roles.includes(role);
    const units = lines.filter((l) => has(l, b.requiresRole)).reduce((s, l) => s + l.qty, 0);
    if (units < b.requiresQty) continue;
    const freeCandidates = lines.filter((l) => has(l, b.freeRole) && l.qty > 0);
    if (freeCandidates.length === 0) {
      hints.push({ offerId: o.id, kind: "bundle_missing_free_item", title: ot(o), role: b.freeRole });
      continue;
    }
    const cheapest = freeCandidates.reduce((a, c) => (c.unitPrice < a.unitPrice ? c : a));
    const unitNet = money(cheapest.netTotal / cheapest.qty);
    cheapest.discount = money(cheapest.discount + unitNet);
    cheapest.netTotal = money(cheapest.netTotal - unitNet);
    discounts.push({ offerId: o.id, title: ot(o), amount: unitNet, kind: o.kind });
  }

  const afterLineDiscounts = money(lines.reduce((s, l) => s + l.netTotal, 0));

  // Best basket-threshold offer only.
  const threshold = ctx.offers
    .filter((o) => o.kind === "fixed_threshold" && afterLineDiscounts >= (o.minSpend ?? Infinity))
    .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))[0];
  if (threshold) discounts.push({ offerId: threshold.id, title: ot(threshold), amount: threshold.amount ?? 0, kind: threshold.kind });
  // Nudge towards a better threshold offer that is within reach (≤ 20% away).
  for (const o of ctx.offers.filter((x) => x.kind === "fixed_threshold" && (x.amount ?? 0) > (threshold?.amount ?? 0))) {
    const gap = (o.minSpend ?? 0) - afterLineDiscounts;
    if (gap > 0 && gap <= (o.minSpend ?? 0) * 0.2) {
      hints.push({ offerId: o.id, kind: "threshold_close", title: ot(o), amountToGo: money(gap) });
    }
  }

  const discountTotal = money(discounts.reduce((s, d) => s + d.amount, 0));
  const total = money(Math.max(0, subtotal - discountTotal));

  // Loyalty points: base × tier multiplier, plus category bonus multipliers.
  const tierMultiplier = LOYALTY.tierMultiplier[ctx.customer.tier];
  const share = afterLineDiscounts > 0 ? total / afterLineDiscounts : 0; // spread basket discount across lines
  let earned = 0;
  const bonusNotes: string[] = [];
  const multipliers = ctx.offers.filter((o) => o.kind === "points_multiplier");
  for (const l of lines) {
    const net = l.netTotal * share;
    let pts = net * LOYALTY.pointsPerRon * tierMultiplier;
    const m = multipliers.find((o) => o.categories?.includes(l.category));
    if (m?.multiplier) {
      pts *= m.multiplier;
      if (!bonusNotes.includes(ot(m))) bonusNotes.push(ot(m));
    }
    earned += pts;
  }
  earned = Math.floor(earned);

  const maxRedeemValue = total * LOYALTY.maxRedeemShare;
  const blocks = Math.min(
    Math.floor(ctx.customer.points / LOYALTY.redeemBlock),
    Math.floor(maxRedeemValue / (LOYALTY.redeemBlock * LOYALTY.pointValueRon)),
  );
  const redeemablePoints = Math.max(0, blocks * LOYALTY.redeemBlock);
  const redeemableValue = money(redeemablePoints * LOYALTY.pointValueRon);

  // Availability at the chosen store and at the nearest alternatives.
  const missing = lines
    .filter((l) => l.stock.status === "out" || l.stock.status === "insufficient")
    .map((l) => ({ sku: l.sku, name: l.name, needed: l.qty, available: l.stock.available }));
  const alternatives = deps.stores
    .map((s) => {
      const missingCount = lines.filter((l) => deps.stockOf(s.id, l.sku) < l.qty).length;
      return {
        storeId: s.id,
        name: s.name,
        city: s.city,
        lat: s.lat,
        lng: s.lng,
        distanceKm: distanceKm(ctx.customer.location, s),
        allInStock: missingCount === 0,
        missingCount,
      };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const cats = new Map<CategoryId, number>();
  for (const l of lines) cats.set(l.category, money((cats.get(l.category) ?? 0) + l.netTotal));
  const categoryBreakdown = [...cats.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);

  const bulky = lines.some((l) => l.bulky);
  const delivery = bulky
    ? { fee: total >= 3000 ? 0 : 149, type: "truck" as const, freeFrom: 3000 }
    : { fee: total >= 250 ? 0 : 19.99, type: "courier" as const, freeFrom: 250 };

  return {
    currency: "RON",
    storeId: store.id,
    storeName: store.name,
    lines,
    subtotal,
    discounts,
    discountTotal,
    total,
    points: {
      earned,
      balance: ctx.customer.points,
      tierMultiplier,
      bonusNotes,
      redeemablePoints,
      redeemableValue,
      totalIfRedeemed: money(total - redeemableValue),
    },
    availability: { allInStock: missing.length === 0, missing, alternatives, origin: ctx.customer.location },
    categoryBreakdown,
    delivery,
    hints,
  };
}
