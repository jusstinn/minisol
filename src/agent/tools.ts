import type { DataSources } from "@/adapters/types";
import { AISLES } from "@/data/stores";
import { CalculatorInputError, PROJECT_PARAM_DOCS, PROJECT_TYPES, calculateProject } from "@/domain/calculators";
import type { ProjectType } from "@/domain/calculators";
import { distanceKm } from "@/domain/geo";
import { LOYALTY } from "@/domain/loyalty";
import { eligibleOffers } from "@/domain/offers";
import { buildQuote } from "@/domain/quote";
import type { BasketItem, Quote } from "@/domain/quote";
import { resolveRequirements } from "@/domain/resolve";
import type { CategoryId, Customer, Lang, MaterialRole, Product, QualityTier } from "@/domain/types";
import { MATERIAL_ROLES } from "@/domain/types";
import { dec, int, lei } from "@/lib/format";
import type { Card, OwnedToolView, SessionState, StockStoreView, SuggestionView } from "./types";

export interface ToolContext {
  sources: DataSources;
  customer: Customer;
  state: SessionState;
  lang: Lang;
  now: Date;
}

export interface ToolResult {
  /** Compact JSON the model sees. */
  forModel: unknown;
  cards?: Card[];
  state?: SessionState;
}

type Handler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;

const CATEGORIES: CategoryId[] = [
  "paint", "flooring", "tiles", "building", "drywall", "insulation", "wood", "garden", "fencing",
  "tools", "power_tools", "fasteners", "adhesives", "safety", "electrical", "plumbing", "bathroom",
];
const QUALITIES: QualityTier[] = ["budget", "standard", "premium"];

let cardSeq = 0;
const cardId = (k: string) => `${k}-${Date.now().toString(36)}-${(cardSeq++).toString(36)}`;
const t = (lang: Lang, ro: string, en: string) => (lang === "en" ? en : ro);
const pn = (p: Product, lang: Lang) => (lang === "en" ? p.nameEn : p.name);
const nullable = (schema: Record<string, unknown>) => ({
  ...schema,
  type: [schema.type, "null"],
  ...(Array.isArray(schema.enum) ? { enum: [...schema.enum, null] } : {}),
});

// ───────────────────────────── tool schemas ─────────────────────────────

const PARAM_FIELDS: Record<string, Record<string, unknown>> = {
  lengthM: { type: "number", description: "Length in metres (room floor length, deck length, fence length, wall length)" },
  widthM: { type: "number", description: "Width in metres" },
  heightM: { type: "number", description: "Height in metres (room/wall height, fence height)" },
  areaM2: { type: "number", description: "Area in m² (lawn only, if no length/width)" },
  doors: { type: "integer", description: "Number of doors" },
  windows: { type: "integer", description: "Number of windows" },
  doorways: { type: "integer", description: "Doorways (laminate)" },
  paintCeiling: { type: "boolean", description: "Paint the ceiling too" },
  coats: { type: "integer", description: "Number of paint coats" },
  surface: { type: "string", enum: ["fresh_plaster", "repaint", "dark_to_light"] },
  pattern: { type: "string", enum: ["straight", "diagonal"] },
  subfloor: { type: "string", enum: ["concrete", "wood", "old_tiles"] },
  roomType: { type: "string", enum: ["bathroom", "kitchen", "other"] },
  tileFloor: { type: "boolean" },
  wallTileHeightM: { type: "number", description: "Height of wall tiling in m (0 = no wall tiles)" },
  largeFormat: { type: "boolean", description: "Tiles ≥ 60 cm" },
  base: { type: "string", enum: ["soil", "gravel", "concrete_slab"] },
  insulation: { type: "boolean" },
  doubleLayer: { type: "boolean" },
  wetRoom: { type: "boolean" },
  mode: { type: "string", enum: ["new", "overseed"] },
};

export const TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    name: "get_customer_context",
    description:
      "Read the signed-in WalletLoop member's loyalty context: tier, points, home store, city, interests, recent purchases and tools they already own. Call once at the start of a conversation.",
    strict: true,
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    type: "function" as const,
    name: "calculate_project",
    description:
      "Calculate materials for a DIY project from its dimensions, pick products from the catalogue, price everything with the member's offers and check stock. REPLACES the current basket. Tools the member already owns are skipped automatically. Parameters per project type:\n" +
      Object.entries(PROJECT_PARAM_DOCS)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join("\n") +
      "\nSet every parameter that does not apply (or that you don't know, to use the default) to null.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        projectType: { type: "string", enum: [...PROJECT_TYPES] },
        params: {
          type: "object",
          properties: Object.fromEntries(Object.entries(PARAM_FIELDS).map(([k, v]) => [k, nullable(v)])),
          required: Object.keys(PARAM_FIELDS),
          additionalProperties: false,
        },
        quality: { type: ["string", "null"], enum: [...QUALITIES, null], description: "Product quality tier. Default standard." },
        storeId: { type: ["string", "null"], description: "Store to price/check stock for. Default: member's home store." },
        includeOptional: { type: ["boolean", "null"], description: "Also add optional items (primer, oil, ladder…) instead of only suggesting them." },
      },
      required: ["projectType", "params", "quality", "storeId", "includeOptional"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "modify_basket",
    description:
      "Change the current basket: add/remove products, set quantities, replace a product with an alternative (quantity is converted automatically for different pack sizes), and/or move the basket to another store. Returns the re-priced quote.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        operations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              op: { type: "string", enum: ["add", "remove", "set_qty", "replace"] },
              sku: { type: "string" },
              qty: { type: ["number", "null"] },
              withSku: { type: ["string", "null"], description: "For replace: the new SKU" },
            },
            required: ["op", "sku", "qty", "withSku"],
            additionalProperties: false,
          },
        },
        storeId: { type: ["string", "null"], description: "Move the basket to this store (null = keep)" },
      },
      required: ["operations", "storeId"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "search_products",
    description:
      "Search the catalogue (Romanian or English keywords). Use to show alternatives, answer product questions, or find items not covered by a project calculator. Returns SKUs, prices and stock at the current store.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        role: { type: ["string", "null"], enum: [...(Object.keys(MATERIAL_ROLES) as MaterialRole[]), null] },
        category: { type: ["string", "null"], enum: [...CATEGORIES, null] },
        quality: { type: ["string", "null"], enum: [...QUALITIES, null] },
        maxPrice: { type: ["number", "null"] },
      },
      required: ["query", "role", "category", "quality", "maxPrice"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "check_stock",
    description:
      "Check stock of products across the nearest stores (defaults to everything in the basket). Use when the member asks where to buy, or when something is out of stock at their store.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        skus: { type: ["array", "null"], items: { type: "string" }, description: "null = whole basket" },
      },
      required: ["skus"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_offers",
    description: "List the WalletLoop offers this member can use right now, with the personal reason for each.",
    strict: true,
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    type: "function" as const,
    name: "present_plan",
    description:
      "Show the member a step-by-step project plan card. Call after calculate_project. Steps must be practical and specific to their project and products; tips should be pro tips; include safety warnings when relevant. Write in the member's language.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        summary: { type: "string", description: "One or two sentences." },
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              detail: { type: "string" },
              duration: { type: ["string", "null"], description: "e.g. '2 h', '1 zi', 'overnight drying'" },
            },
            required: ["title", "detail", "duration"],
            additionalProperties: false,
          },
        },
        tips: { type: "array", items: { type: "string" } },
        safetyWarnings: { type: "array", items: { type: "string" } },
      },
      required: ["title", "summary", "steps", "tips", "safetyWarnings"],
      additionalProperties: false,
    },
  },
];

export const TOOL_STATUS: Record<string, { ro: string; en: string }> = {
  get_customer_context: { ro: "Citesc profilul tău WalletLoop", en: "Reading your WalletLoop profile" },
  calculate_project: { ro: "Calculez materialele și prețul", en: "Calculating materials and price" },
  modify_basket: { ro: "Actualizez lista de cumpărături", en: "Updating your shopping list" },
  search_products: { ro: "Caut în catalog", en: "Searching the catalogue" },
  check_stock: { ro: "Verific stocul în magazine", en: "Checking stock in stores" },
  get_offers: { ro: "Caut ofertele tale personalizate", en: "Finding your personal offers" },
  present_plan: { ro: "Desenez planul proiectului", en: "Drawing up your project plan" },
};

// ───────────────────────────── helpers ─────────────────────────────

async function priceBasket(ctx: ToolContext, items: BasketItem[], storeId: string): Promise<Quote> {
  const { sources, customer } = ctx;
  const skus = [...new Set(items.map((i) => i.sku))];
  const [products, stores, offers] = await Promise.all([
    sources.catalog.getMany(skus),
    sources.stores.list(),
    sources.loyalty.getOffers(customer.memberId),
  ]);
  const stock = await sources.inventory.stock(stores.map((s) => s.id), skus);
  return buildQuote(
    items,
    { customer, storeId, offers: eligibleOffers(offers, customer, ctx.now), lang: ctx.lang },
    {
      products: new Map(products.map((p) => [p.sku, p])),
      stores,
      stockOf: (st, sku) => stock.get(`${st}:${sku}`) ?? 0,
      aisleOf: (p) => AISLES[p.category] ?? 1,
    },
  );
}

/** What the model needs from a quote — the UI renders the full card. */
function quoteForModel(q: Quote, lang: Lang) {
  const best = q.availability.alternatives.find((a) => a.allInStock && a.distanceKm <= 60);
  return {
    // Pre-formatted strings: copy these verbatim instead of composing numbers.
    display: {
      total: lei(q.total, lang),
      saved: q.discountTotal > 0 ? lei(q.discountTotal, lang) : null,
      pointsEarned: int(q.points.earned, lang),
      payWithPoints: q.points.redeemableValue > 0 ? lei(q.points.redeemableValue, lang) : null,
      nearestStoreWithEverything: best ? `${best.name} (${dec(best.distanceKm, lang, 1)} km)` : null,
    },
    store: { id: q.storeId, name: q.storeName },
    lines: q.lines.map((l) => ({
      sku: l.sku,
      name: l.name,
      qty: l.qty,
      unit: l.salesUnit,
      unitPrice: l.unitPrice,
      net: l.netTotal,
      stock: l.stock.status,
      tool: l.isTool || undefined,
    })),
    subtotal: q.subtotal,
    discounts: q.discounts.map((d) => ({ title: d.title, amount: d.amount })),
    total: q.total,
    currency: "RON",
    points: {
      earned: q.points.earned,
      earnedValueRon: Math.round(q.points.earned * LOYALTY.pointValueRon * 100) / 100,
      balance: q.points.balance,
      canRedeem: q.points.redeemablePoints,
      redeemValue: q.points.redeemableValue,
      totalIfRedeemed: q.points.totalIfRedeemed,
      bonus: q.points.bonusNotes,
    },
    allInStockAtStore: q.availability.allInStock,
    missingAtStore: q.availability.missing,
    // Only nearby stores are a realistic pickup alternative; beyond that, suggest delivery or swaps.
    storesWithEverything: q.availability.alternatives.filter((a) => a.allInStock && a.distanceKm <= 60).slice(0, 3).map((a) => ({ id: a.storeId, name: a.name, km: a.distanceKm })),
    delivery: q.delivery,
    offerHints: q.hints.map((h) =>
      h.kind === "threshold_close"
        ? `Add ${h.amountToGo} RON more to unlock: ${h.title}`
        : `Bundle unlocked but the free item (${h.role}) is not in the basket: ${h.title}`,
    ),
  };
}

async function ownedTools(ctx: ToolContext): Promise<Map<MaterialRole, { sku: string; date: string }>> {
  const owned = new Map<MaterialRole, { sku: string; date: string }>();
  const skus = ctx.customer.purchases.flatMap((p) => p.items.map((i) => i.sku));
  const products = new Map((await ctx.sources.catalog.getMany(skus)).map((p) => [p.sku, p]));
  for (const purchase of ctx.customer.purchases) {
    for (const it of purchase.items) {
      const p = products.get(it.sku);
      if (!p?.isTool) continue;
      for (const r of p.roles) owned.set(r, { sku: p.sku, date: purchase.date });
    }
  }
  return owned;
}

function highlights(p: Product): string[] {
  return Object.entries(p.specs)
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${typeof v === "boolean" ? (v ? "da" : "nu") : v}`);
}

function cleanParams(params: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (params && typeof params === "object") {
    for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined) out[k] = v;
  }
  return out;
}

async function storeIdOrDefault(ctx: ToolContext, requested: unknown): Promise<{ id: string; error?: string }> {
  const fallback = ctx.state.storeId ?? ctx.customer.homeStoreId;
  if (typeof requested !== "string" || !requested) return { id: fallback };
  const stores = await ctx.sources.stores.list();
  const hit = stores.find((s) => s.id === requested) ?? stores.find((s) => s.name.toLowerCase().includes(requested.toLowerCase()));
  return hit ? { id: hit.id } : { id: fallback, error: `Unknown store "${requested}". Valid ids: ${stores.map((s) => s.id).join(", ")}` };
}

// ───────────────────────────── handlers ─────────────────────────────

const handlers: Record<string, Handler> = {
  async get_customer_context(_args, ctx) {
    const { customer: c, sources } = ctx;
    const stores = await sources.stores.list();
    const home = stores.find((s) => s.id === c.homeStoreId);
    const owned = await ownedTools(ctx);
    const skus = c.purchases.flatMap((p) => p.items.map((i) => i.sku));
    const products = new Map((await sources.catalog.getMany(skus)).map((p) => [p.sku, p]));
    return {
      forModel: {
        // Data minimisation: no name, email, phone or exact location is ever sent to the model.
        tier: c.tier,
        points: c.points,
        pointsValueRon: Math.round(c.points * LOYALTY.pointValueRon * 100) / 100,
        tierPointsMultiplier: LOYALTY.tierMultiplier[c.tier],
        homeStore: home ? { id: home.id, name: home.name, city: home.city } : null,
        city: c.location.city,
        preferredLanguage: c.language,
        memberSinceYear: c.memberSince.slice(0, 4),
        interests: c.consent.personalization ? c.segments : [],
        personalizationConsent: c.consent.personalization,
        recentPurchases: c.consent.personalization
          ? c.purchases.map((p) => ({ date: p.date, items: p.items.map((i) => products.get(i.sku)?.name ?? i.sku) }))
          : "not shared (no personalisation consent)",
        ownedTools: [...owned.entries()].map(([role, o]) => ({ tool: MATERIAL_ROLES[role].labelEn, since: o.date })),
        allStores: stores.map((s) => ({ id: s.id, name: s.name, km: distanceKm(c.location, s) })).sort((a, b) => a.km - b.km),
        loyaltyRules: `1 point per RON × tier multiplier; 100 points = ${LOYALTY.redeemBlock * LOYALTY.pointValueRon} RON; max ${LOYALTY.maxRedeemShare * 100}% of a basket payable with points.`,
      },
    };
  },

  async calculate_project(args, ctx) {
    const type = args.projectType as ProjectType;
    const quality = (QUALITIES.includes(args.quality as QualityTier) ? args.quality : ctx.state.quality ?? "standard") as QualityTier;
    let calc;
    try {
      calc = calculateProject(type, cleanParams(args.params), ctx.lang);
    } catch (e) {
      if (e instanceof CalculatorInputError) return { forModel: { error: e.message, hint: "Ask the customer for the missing/invalid dimension." } };
      throw e;
    }
    const store = await storeIdOrDefault(ctx, args.storeId);
    const roles = [...new Set(calc.requirements.map((r) => r.role))];
    const [catalog, owned] = await Promise.all([ctx.sources.catalog.byRoles(roles), ownedTools(ctx)]);
    const resolved = resolveRequirements(calc.requirements, catalog, {
      quality,
      owned,
      includeOptional: args.includeOptional === true,
    });
    const basket: BasketItem[] = resolved.lines.map((l) => ({ sku: l.sku, qty: l.qty, role: l.role, basis: l.basis, isTool: l.isTool }));
    // If a WalletLoop bundle makes an optional item free, include it — the member would want it.
    const offers = eligibleOffers(await ctx.sources.loyalty.getOffers(ctx.customer.memberId), ctx.customer, ctx.now);
    for (const o of offers) {
      if (o.kind !== "bundle_free_role" || !o.bundle) continue;
      const units = basket.filter((b) => b.role === o.bundle!.requiresRole).reduce((s, b) => s + b.qty, 0);
      const idx = resolved.suggestions.findIndex((s) => s.role === o.bundle!.freeRole);
      if (units >= o.bundle.requiresQty && idx >= 0) {
        const s = resolved.suggestions.splice(idx, 1)[0];
        basket.push({ sku: s.sku, qty: s.qty, role: s.role, basis: s.basis, isTool: s.isTool });
      }
    }
    const quote = await priceBasket(ctx, basket, store.id);
    const bySku = new Map(catalog.map((p) => [p.sku, p]));

    const suggestions: SuggestionView[] = resolved.suggestions.map((s) => {
      const p = bySku.get(s.sku)!;
      return { sku: s.sku, name: pn(p, ctx.lang), qty: s.qty, unitPrice: p.price, total: Math.round(p.price * s.qty * 100) / 100, basis: s.basis, isTool: s.isTool };
    });
    const ownedProducts = await ctx.sources.catalog.getMany(resolved.skipped.filter((s) => s.ownedSku).map((s) => s.ownedSku!));
    const ownedViews: OwnedToolView[] = resolved.skipped
      .filter((s) => s.reason === "owned")
      .map((s) => ({
        roleLabel: t(ctx.lang, MATERIAL_ROLES[s.role].label, MATERIAL_ROLES[s.role].labelEn),
        productName: (() => { const op = ownedProducts.find((p) => p.sku === s.ownedSku); return op ? pn(op, ctx.lang) : ""; })(),
        date: s.ownedDate ?? "",
      }));

    const project = {
      type,
      title: calc.title,
      inputs: calc.inputs,
      measurements: calc.measurements,
      assumptions: calc.assumptions,
      estimate: calc.estimate,
      safetyNotes: calc.safetyNotes,
    };
    const state: SessionState = { ...ctx.state, basket, storeId: store.id, quality, project };
    return {
      state,
      cards: [
        { kind: "project", id: cardId("project"), project },
        { kind: "quote", id: cardId("quote"), quote, suggestions, owned: ownedViews },
      ],
      forModel: {
        storeWarning: store.error,
        project: { title: calc.title, inputsUsed: calc.inputs, measurements: calc.measurements, assumptions: calc.assumptions, estimate: calc.estimate, safetyNotes: calc.safetyNotes },
        quality,
        quote: quoteForModel(quote, ctx.lang),
        ownedToolsSkipped: ownedViews.map((o) => `${o.roleLabel} (${o.productName}, bought ${o.date})`),
        optionalSuggestions: suggestions.map((s) => ({ sku: s.sku, name: s.name, qty: s.qty, total: s.total, why: s.basis })),
        unavailableRoles: resolved.skipped.filter((s) => s.reason === "no_product").map((s) => s.role),
        uiNote: "The customer now sees a 3D blueprint + measurements card and the full priced shopping list card. Do not repeat the list in text.",
      },
    };
  },

  async modify_basket(args, ctx) {
    const ops = Array.isArray(args.operations) ? (args.operations as Record<string, unknown>[]) : [];
    let basket = [...ctx.state.basket];
    const errors: string[] = [];
    const changes: string[] = [];
    const involved = ops.flatMap((o) => [o.sku, o.withSku]).filter((s): s is string => typeof s === "string");
    const known = new Map((await ctx.sources.catalog.getMany([...involved, ...basket.map((b) => b.sku)])).map((p) => [p.sku, p]));

    for (const o of ops) {
      const sku = String(o.sku);
      const idx = basket.findIndex((b) => b.sku === sku);
      const qty = typeof o.qty === "number" ? Math.round(o.qty) : undefined;
      switch (o.op) {
        case "add": {
          const p = known.get(sku);
          if (!p) { errors.push(`Unknown SKU ${sku}`); break; }
          const n = qty && qty > 0 ? qty : 1;
          if (idx >= 0) basket[idx] = { ...basket[idx], qty: basket[idx].qty + n };
          else basket.push({ sku, qty: n, role: p.roles[0], isTool: p.isTool });
          changes.push(`+${n} ${pn(p, ctx.lang)}`);
          break;
        }
        case "remove":
          if (idx < 0) { errors.push(`SKU ${sku} is not in the basket`); break; }
          changes.push(`removed ${known.get(sku)?.name ?? sku}`);
          basket = basket.filter((b) => b.sku !== sku);
          break;
        case "set_qty":
          if (idx < 0) { errors.push(`SKU ${sku} is not in the basket`); break; }
          if (!qty || qty <= 0) { basket = basket.filter((b) => b.sku !== sku); changes.push(`removed ${sku}`); break; }
          basket[idx] = { ...basket[idx], qty };
          changes.push(`${known.get(sku)?.name ?? sku} → ${qty}`);
          break;
        case "replace": {
          const withSku = typeof o.withSku === "string" ? o.withSku : "";
          const oldP = known.get(sku);
          const newP = known.get(withSku);
          if (idx < 0 || !oldP) { errors.push(`SKU ${sku} is not in the basket`); break; }
          if (!newP) { errors.push(`Unknown SKU ${withSku}`); break; }
          // Keep the same amount of material when pack sizes differ (e.g. 10 l → 15 l buckets).
          const sameUnit = oldP.content.unit === newP.content.unit && !oldP.isTool;
          const newQty = qty ?? (sameUnit ? Math.max(1, Math.ceil((basket[idx].qty * oldP.content.amount) / newP.content.amount - 1e-9)) : basket[idx].qty);
          basket[idx] = { ...basket[idx], sku: withSku, qty: newQty, isTool: newP.isTool };
          changes.push(`${oldP.name} → ${newQty}× ${newP.name}`);
          break;
        }
        default:
          errors.push(`Unknown op ${String(o.op)}`);
      }
    }
    const store = await storeIdOrDefault(ctx, args.storeId);
    if (store.error) errors.push(store.error);
    const quote = await priceBasket(ctx, basket, store.id);
    const state: SessionState = { ...ctx.state, basket, storeId: store.id };
    return {
      state,
      cards: [{ kind: "quote", id: cardId("quote"), quote, suggestions: [], owned: [] }],
      forModel: { changes, errors: errors.length ? errors : undefined, quote: quoteForModel(quote, ctx.lang) },
    };
  },

  async search_products(args, ctx) {
    const products = await ctx.sources.catalog.search({
      text: String(args.query ?? ""),
      role: (args.role as MaterialRole) ?? undefined,
      category: (args.category as CategoryId) ?? undefined,
      quality: (args.quality as QualityTier) ?? undefined,
      maxPrice: typeof args.maxPrice === "number" ? args.maxPrice : undefined,
      limit: 6,
    });
    const storeId = ctx.state.storeId ?? ctx.customer.homeStoreId;
    const stock = await ctx.sources.inventory.stock([storeId], products.map((p) => p.sku));
    const views = products.map((p) => ({
      sku: p.sku,
      name: pn(p, ctx.lang),
      brand: p.brand,
      price: p.price,
      salesUnit: p.salesUnit,
      quality: p.quality,
      rating: p.rating,
      highlights: highlights(p),
      stockAtStore: stock.get(`${storeId}:${p.sku}`) ?? 0,
    }));
    return {
      cards: views.length ? [{ kind: "products", id: cardId("products"), query: String(args.query ?? ""), products: views }] : [],
      forModel: {
        results: products.map((p, i) => ({
          sku: p.sku,
          name: pn(p, ctx.lang),
          price: p.price,
          per: p.salesUnit,
          content: `${p.content.amount} ${p.content.unit}`,
          quality: p.quality,
          rating: p.rating,
          specs: p.specs,
          stockAtStore: views[i].stockAtStore,
        })),
        note: products.length === 0 ? "No matches. Try other keywords (Romanian works best) or a role filter." : undefined,
      },
    };
  },

  async check_stock(args, ctx) {
    const skus = (Array.isArray(args.skus) && args.skus.length ? (args.skus as string[]) : ctx.state.basket.map((b) => b.sku)).slice(0, 40);
    if (skus.length === 0) return { forModel: { error: "Basket is empty and no SKUs given." } };
    const needed = new Map(ctx.state.basket.map((b) => [b.sku, b.qty]));
    const [stores, products] = await Promise.all([ctx.sources.stores.list(), ctx.sources.catalog.getMany(skus)]);
    const stock = await ctx.sources.inventory.stock(stores.map((s) => s.id), skus);
    const selected = ctx.state.storeId ?? ctx.customer.homeStoreId;
    const views: StockStoreView[] = stores
      .map((s) => {
        const items = products.map((p) => ({ sku: p.sku, name: pn(p, ctx.lang), needed: needed.get(p.sku) ?? 1, available: stock.get(`${s.id}:${p.sku}`) ?? 0 }));
        return {
          storeId: s.id,
          name: s.name,
          city: s.city,
          lat: s.lat,
          lng: s.lng,
          distanceKm: distanceKm(ctx.customer.location, s),
          isHome: s.id === ctx.customer.homeStoreId,
          isSelected: s.id === selected,
          items,
          allInStock: items.every((i) => i.available >= i.needed),
        };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);
    return {
      cards: [{ kind: "stock", id: cardId("stock"), stores: views }],
      forModel: {
        stores: views.slice(0, 6).map((v) => ({
          id: v.storeId,
          name: v.name,
          km: v.distanceKm,
          allInStock: v.allInStock,
          short: v.items.filter((i) => i.available < i.needed).map((i) => ({ sku: i.sku, name: i.name, needed: i.needed, available: i.available })),
        })),
      },
    };
  },

  async get_offers(_args, ctx) {
    const all = await ctx.sources.loyalty.getOffers(ctx.customer.memberId);
    const eligible = eligibleOffers(all, ctx.customer, ctx.now);
    const basketSkus = ctx.state.basket.map((b) => b.sku);
    let applied = new Set<string>();
    if (basketSkus.length) {
      const q = await priceBasket(ctx, ctx.state.basket, ctx.state.storeId ?? ctx.customer.homeStoreId);
      applied = new Set(q.discounts.map((d) => d.offerId).concat(q.points.bonusNotes.length ? eligible.filter((o) => q.points.bonusNotes.includes(o.title)).map((o) => o.id) : []));
    }
    const views = eligible.map((o) => ({
      id: o.id,
      title: t(ctx.lang, o.title, o.titleEn),
      reason: t(ctx.lang, o.reason, o.reasonEn),
      validUntil: o.validUntil,
      kind: o.kind,
      appliesNow: applied.has(o.id),
    }));
    return {
      cards: views.length ? [{ kind: "offers", id: cardId("offers"), offers: views }] : [],
      forModel: {
        offers: views.map((v) => ({ title: v.title, why: v.reason, until: v.validUntil, appliedToCurrentBasket: v.appliesNow })),
        personalizationConsent: ctx.customer.consent.personalization,
      },
    };
  },

  async present_plan(args) {
    const plan = {
      title: String(args.title ?? ""),
      summary: String(args.summary ?? ""),
      steps: (Array.isArray(args.steps) ? args.steps : []).slice(0, 14).map((s: Record<string, unknown>) => ({
        title: String(s.title ?? ""),
        detail: String(s.detail ?? ""),
        duration: typeof s.duration === "string" ? s.duration : null,
      })),
      tips: (Array.isArray(args.tips) ? args.tips : []).map(String).slice(0, 8),
      safetyWarnings: (Array.isArray(args.safetyWarnings) ? args.safetyWarnings : []).map(String).slice(0, 6),
    };
    return { cards: [{ kind: "plan", id: cardId("plan"), plan }], forModel: { shown: true } };
  },
};

export async function executeTool(name: string, rawArgs: string, ctx: ToolContext): Promise<ToolResult> {
  const handler = handlers[name];
  if (!handler) return { forModel: { error: `Unknown tool ${name}` } };
  let args: Record<string, unknown>;
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    return { forModel: { error: "Arguments were not valid JSON" } };
  }
  try {
    return await handler(args, ctx);
  } catch (e) {
    console.error(`[tool ${name}]`, e);
    return { forModel: { error: `Tool failed: ${(e as Error).message}` } };
  }
}

export { priceBasket };
