import type { BaseUnit, MaterialRole, Product, QualityTier, Requirement } from "./types";

/**
 * Turns calculator requirements ("18.4 l of interior_paint") into concrete catalog
 * lines ("1× 15 l + 1× 5 l of Pigmenta Premium"), choosing products by quality tier
 * and optimising pack sizes for the lowest price. Pure and deterministic.
 */

export interface ResolvedLine {
  sku: string;
  qty: number;
  role: MaterialRole;
  basis: string;
  isTool: boolean;
  /** How much of the base unit the customer actually needs. */
  needed: number;
  /** How much the chosen packs provide. */
  provided: number;
  unit: BaseUnit;
}

export interface Suggestion {
  role: MaterialRole;
  sku: string;
  qty: number;
  basis: string;
  isTool: boolean;
}

export interface SkippedRequirement {
  role: MaterialRole;
  reason: "owned" | "no_product" | "excluded";
  /** For "owned": what the customer already bought and when. */
  ownedSku?: string;
  ownedDate?: string;
}

export interface ResolveResult {
  lines: ResolvedLine[];
  suggestions: Suggestion[];
  skipped: SkippedRequirement[];
}

export interface ResolveOptions {
  quality?: QualityTier;
  /** Tool roles the customer already owns → role → purchase info. */
  owned?: Map<MaterialRole, { sku: string; date: string }>;
  includeOptional?: boolean;
  excludeRoles?: MaterialRole[];
  /** Force a specific product for a role (e.g. customer picked a colour). */
  preferSkus?: Partial<Record<MaterialRole, string>>;
}

const TIER_FALLBACK: Record<QualityTier, QualityTier[]> = {
  budget: ["budget", "standard", "premium"],
  standard: ["standard", "budget", "premium"],
  premium: ["premium", "standard", "budget"],
};

/** "Vopsea X albă, 10 l" → "vopsea x albă" so pack sizes of one product line group together. */
export function productLineKey(p: Product): string {
  const stem = p.name
    .toLowerCase()
    .replace(/[,\s–-]*\d+([.,]\d+)?\s*(l|ml|kg|g|m²|m2|m|buc|bucăți)\b\.?/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return `${p.brand}|${p.roles.join(",")}|${p.quality}|${stem}`;
}

function coverageOf(p: Product, unit: BaseUnit): number | undefined {
  const key = unit === "l" ? "coverageM2PerL" : unit === "kg" ? "coverageM2PerKg" : undefined;
  if (!key) return undefined;
  const v = p.specs[key];
  return typeof v === "number" && v > 0 ? v : undefined;
}

function matchesSpecs(p: Product, match: Requirement["match"]): boolean {
  if (!match) return true;
  return Object.entries(match).every(([k, want]) => {
    const have = p.specs[k];
    if (have === undefined) return false;
    if (typeof want === "number" && typeof have === "number") return Math.abs(have - want) < 1e-6;
    return String(have).toLowerCase() === String(want).toLowerCase();
  });
}

/**
 * Cheapest combination of pack sizes whose total content ≥ needed.
 * Small bounded search — lines have at most a handful of sizes.
 */
export function optimisePacks(needed: number, packs: Product[]): { sku: string; qty: number }[] {
  const sizes = [...packs].sort((a, b) => b.content.amount - a.content.amount);
  if (sizes.length === 1 || needed <= 0) {
    const p = sizes[0];
    return [{ sku: p.sku, qty: Math.max(1, Math.ceil(needed / p.content.amount - 1e-9)) }];
  }
  let best: { cost: number; counts: number[]; over: number } | null = null;
  const counts = new Array(sizes.length).fill(0);
  // Cheapest price per unit among sizes i..end: a lower bound on what the rest will cost.
  const minUnitFrom = sizes.map((_, i) => Math.min(...sizes.slice(i).map((p) => p.price / p.content.amount)));
  const search = (i: number, remaining: number, cost: number) => {
    const bound = i < sizes.length ? cost + Math.max(0, remaining) * minUnitFrom[i] : cost;
    if (best && bound >= best.cost + 1e-9) return;
    if (remaining <= 1e-9) {
      const over = -remaining;
      if (!best || cost < best.cost - 1e-9 || (Math.abs(cost - best.cost) < 1e-9 && over < best.over)) {
        best = { cost, counts: [...counts], over };
      }
      return;
    }
    if (i >= sizes.length) return;
    const p = sizes[i];
    const max = Math.ceil(remaining / p.content.amount - 1e-9);
    for (let n = max; n >= 0; n--) {
      counts[i] = n;
      search(i + 1, remaining - n * p.content.amount, cost + n * p.price);
    }
    counts[i] = 0;
  };
  search(0, needed, 0);
  const result = best as { counts: number[] } | null;
  if (!result) return [{ sku: sizes[0].sku, qty: Math.ceil(needed / sizes[0].content.amount - 1e-9) }];
  return sizes.map((p, i) => ({ sku: p.sku, qty: result.counts[i] })).filter((x) => x.qty > 0);
}

/** Pick the product line for a requirement, honouring quality tier and spec matches. */
export function chooseLine(req: Requirement, catalog: Product[], quality: QualityTier, preferSku?: string): Product[] {
  const all = catalog.filter((p) => p.roles.includes(req.role));
  if (all.length === 0) return [];
  if (preferSku) {
    const pref = all.find((p) => p.sku === preferSku);
    if (pref) {
      const key = productLineKey(pref);
      return all.filter((p) => productLineKey(p) === key);
    }
  }
  const matching = all.filter((p) => matchesSpecs(p, req.match));
  const pool = matching.length > 0 ? matching : all;
  const tierOrder = req.isTool ? TIER_FALLBACK.standard : (TIER_FALLBACK[quality] ?? TIER_FALLBACK.standard);
  for (const tier of tierOrder) {
    const inTier = pool.filter((p) => p.quality === tier);
    if (inTier.length === 0) continue;
    const lines = new Map<string, Product[]>();
    for (const p of inTier) {
      const k = productLineKey(p);
      lines.set(k, [...(lines.get(k) ?? []), p]);
    }
    // Best-rated line; tie-break on price per base unit.
    const ranked = [...lines.values()].sort((a, b) => {
      const ra = Math.max(...a.map((p) => p.rating));
      const rb = Math.max(...b.map((p) => p.rating));
      if (Math.abs(rb - ra) > 0.05) return rb - ra;
      const ua = Math.min(...a.map((p) => p.price / p.content.amount));
      const ub = Math.min(...b.map((p) => p.price / p.content.amount));
      return ua - ub;
    });
    return ranked[0];
  }
  return [];
}

/** Structural members are bought in one length: mixing 3 m and 4 m deck boards makes no sense on site. */
const SINGLE_LENGTH: MaterialRole[] = ["deck_board", "deck_joist", "fence_post"];

function packsFor(req: Requirement, needed: number, line: Product[]): { sku: string; qty: number }[] {
  if (!SINGLE_LENGTH.includes(req.role) || line.length === 1) return optimisePacks(needed, line);
  const best = line
    .map((p) => ({ sku: p.sku, qty: Math.max(1, Math.ceil(needed / p.content.amount - 1e-9)), cost: p.price * Math.ceil(needed / p.content.amount - 1e-9) }))
    .sort((a, b) => a.cost - b.cost)[0];
  return [{ sku: best.sku, qty: best.qty }];
}

export interface LineOption {
  key: string;
  /** Representative product (largest pack) for name/specs/art. */
  product: Product;
  items: { sku: string; qty: number }[];
  /** Amount of the base unit the packs provide. */
  provided: number;
}

/**
 * Every product line that can do this requirement's job, each with the packs
 * the customer would need for *their* project (coverage-aware, pack-optimised).
 * Spec matches (e.g. fence height) are strict here: a 1.2 m panel is not an
 * alternative to a 1.8 m one.
 */
export function lineOptions(req: Requirement, catalog: Product[]): LineOption[] {
  const all = catalog.filter((p) => p.roles.includes(req.role));
  const matching = all.filter((p) => matchesSpecs(p, req.match));
  const pool = req.match && matching.length > 0 ? matching : all;
  const lines = new Map<string, Product[]>();
  for (const p of pool) {
    const k = req.isTool ? p.sku : productLineKey(p);
    lines.set(k, [...(lines.get(k) ?? []), p]);
  }
  return [...lines.entries()].map(([key, line]) => {
    const product = [...line].sort((a, b) => b.content.amount - a.content.amount)[0];
    const items = req.isTool ? [{ sku: line[0].sku, qty: req.quantity }] : packsFor(req, neededAmount(req, line), line);
    const provided = items.reduce((s, it) => s + it.qty * (line.find((p) => p.sku === it.sku)?.content.amount ?? 0), 0);
    return { key, product, items, provided: Math.round(provided * 100) / 100 };
  });
}

export function neededAmount(req: Requirement, line: Product[]): number {
  if (req.areaToCover) {
    const coverage = Math.min(...line.map((p) => coverageOf(p, req.unit) ?? Infinity));
    if (Number.isFinite(coverage)) return Math.round((req.areaToCover / coverage) * 100) / 100;
  }
  if (req.scaleBySpec) {
    const v = line[0].specs[req.scaleBySpec.key];
    if (typeof v === "number" && v > 0) return Math.round(((req.quantity * req.scaleBySpec.reference) / v) * 100) / 100;
  }
  return req.quantity;
}

export function resolveRequirements(reqs: Requirement[], catalog: Product[], opts: ResolveOptions = {}): ResolveResult {
  const quality = opts.quality ?? "standard";
  const out: ResolveResult = { lines: [], suggestions: [], skipped: [] };
  const exclude = new Set(opts.excludeRoles ?? []);

  for (const req of reqs) {
    if (exclude.has(req.role)) {
      out.skipped.push({ role: req.role, reason: "excluded" });
      continue;
    }
    const owned = req.isTool ? opts.owned?.get(req.role) : undefined;
    if (owned) {
      out.skipped.push({ role: req.role, reason: "owned", ownedSku: owned.sku, ownedDate: owned.date });
      continue;
    }
    const line = chooseLine(req, catalog, quality, opts.preferSkus?.[req.role]);
    if (line.length === 0) {
      out.skipped.push({ role: req.role, reason: "no_product" });
      continue;
    }
    const needed = req.isTool ? req.quantity : neededAmount(req, line);
    const packs = req.isTool ? [{ sku: line[0].sku, qty: req.quantity }] : packsFor(req, needed, line);

    if (req.optional && !opts.includeOptional) {
      for (const pk of packs) {
        out.suggestions.push({ role: req.role, sku: pk.sku, qty: pk.qty, basis: req.basis, isTool: Boolean(req.isTool) });
      }
      continue;
    }
    for (const pk of packs) {
      const product = line.find((p) => p.sku === pk.sku)!;
      out.lines.push({
        sku: pk.sku,
        qty: pk.qty,
        role: req.role,
        basis: req.basis,
        isTool: Boolean(req.isTool),
        needed,
        provided: Math.round(pk.qty * product.content.amount * 100) / 100,
        unit: req.unit,
      });
    }
  }
  return out;
}
