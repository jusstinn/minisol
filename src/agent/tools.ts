import type { DataSources } from "@/adapters/types";
import { AISLES } from "@/data/stores";
import { CalculatorInputError, PROJECT_PARAM_DOCS, PROJECT_TYPES, calculateProject } from "@/domain/calculators";
import type { CalculationResult, ProjectType } from "@/domain/calculators";
import { SIDES, SketchEditError, applyOps, defaultLayout, describeLayout, layoutParams } from "@/domain/layout";
import type { Layout, SketchOp } from "@/domain/layout";
import { distanceKm } from "@/domain/geo";
import { LOYALTY } from "@/domain/loyalty";
import { eligibleOffers } from "@/domain/offers";
import { bestPercentOff, buildQuote } from "@/domain/quote";
import type { BasketItem, Quote } from "@/domain/quote";
import { artOf } from "@/domain/art";
import { lookForBasket } from "@/domain/look";
import { sizeHelp } from "@/domain/sizes";
import type { Look } from "@/domain/look";
import { specHighlights } from "@/domain/specs";
import { lineOptions, productLineKey, resolveRequirements } from "@/domain/resolve";
import type { CategoryId, Customer, Lang, MaterialRole, Offer, Product, QualityTier, Requirement } from "@/domain/types";
import { MATERIAL_ROLES } from "@/domain/types";
import { dec, int, lei } from "@/lib/format";
import type { Card, ChoiceGroup, OwnedToolView, ProjectSnapshot, QualityOption, SessionState, SketchChange, StockStoreView, SuggestedItem, SuggestionView, UiCommand } from "./types";

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
  /** Screen changes (view, highlight, panels) — no data changes. */
  ui?: UiCommand;
}

/** A sketch edit, or "undo" (step back to the previous layout). */
export type EditOp = SketchOp | { op: "undo" };

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

export const PARAM_FIELDS: Record<string, Record<string, unknown>> = {
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
        keepSketch: {
          type: ["boolean", "null"],
          description: "true when re-running the SAME project only to change quality tier, store or optional items: keeps the customer's edited sketch (L-shapes, steps, gates…) and ignores params.",
        },
      },
      required: ["projectType", "params", "quality", "storeId", "includeOptional", "keepSketch"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "edit_sketch",
    description:
      "Change the shape of the current project's sketch — the materials, quantities and price are recalculated from it, keeping the products the customer already chose. " +
      "Use for: resizing (resize), L/U shapes (add_zone attaches a rectangle to a side of an existing zone; remove_zone), deck height (set_height, metres) and steps (add_steps / remove_steps; count defaults to height ÷ 17 cm), " +
      "doors/windows/gates (add_opening / move_opening / remove_opening; fence gates: width 1 = pedestrian, 3 = driveway, on a segment index), fence corners (add_fence_segment with turn left/right/straight; set_segment_length; remove_fence_segment), " +
      "wall-tile height per wall (set_wall_tiles, wall n/e/s/w or all, value in m; 0 = none), and options (set_option key/value: base, direction, pattern, subfloor, ceiling, coats, surface, floor, largeFormat, insulation, doubleLayer, mode). " +
      "undo reverts the last sketch change (alone, nothing else in the same call). Sides/walls: n = back, s = front, e = right, w = left as seen in the sketch. Zone ids and segment indexes are in the state section of your instructions. Set unused fields to null. Several edits can be sent at once.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        edits: {
          type: "array",
          items: {
            type: "object",
            properties: {
              op: {
                type: "string",
                enum: ["resize", "add_zone", "remove_zone", "add_steps", "remove_steps", "set_height", "add_opening", "remove_opening", "move_opening", "set_wall_tiles", "add_fence_segment", "set_segment_length", "remove_fence_segment", "set_option", "undo"],
              },
              zone: { type: ["string", "null"], description: "Zone id (A, B…). resize/add_zone/add_steps/remove_zone; null = first zone" },
              w: { type: ["number", "null"], description: "Width in m (east–west). resize, add_zone; for walls/fences: total length" },
              d: { type: ["number", "null"], description: "Depth in m (north–south). resize, add_zone" },
              h: { type: ["number", "null"], description: "Room/wall height in m (resize)" },
              side: { type: ["string", "null"], enum: [...SIDES, null], description: "Side of the zone for add_zone / add_steps" },
              align: { type: ["string", "null"], enum: ["start", "center", "end", null], description: "add_zone: where along that side (start = north/west end)" },
              width: { type: ["number", "null"], description: "Width in m of steps, door, window or gate" },
              count: { type: ["integer", "null"], description: "Number of steps" },
              value: { type: ["number", "null"], description: "set_height (m above ground for decks; m for rooms/walls/fences), set_wall_tiles (m)" },
              option: { type: ["string", "null"], description: "set_option value, e.g. \"gravel\", \"diagonal\", \"true\", \"3\"" },
              kind: { type: ["string", "null"], enum: ["door", "window", "gate", null] },
              wall: { type: ["string", "null"], description: "Wall n/e/s/w (or 'all' for set_wall_tiles)" },
              pos: { type: ["number", "null"], description: "Position along the wall/segment, 0..1 (0.5 = middle)" },
              id: { type: ["string", "null"], description: "Opening/gate id for move/remove (null = the last one of that kind)" },
              segment: { type: ["integer", "null"], description: "Fence segment index (0 = first)" },
              length: { type: ["number", "null"], description: "Fence segment length in m" },
              turn: { type: ["string", "null"], enum: ["left", "right", "straight", null] },
              key: { type: ["string", "null"], description: "set_option key" },
            },
            required: ["op", "zone", "w", "d", "h", "side", "align", "width", "count", "value", "option", "kind", "wall", "pos", "id", "segment", "length", "turn", "key"],
            additionalProperties: false,
          },
        },
      },
      required: ["edits"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "modify_basket",
    description:
      "Change the shopping list: add/remove products, set quantities, choose another option for a job, handle the optional suggestions, and/or move the list to another store. Returns the re-priced quote. " +
      "Ops: add (a suggested SKU with qty null gets the suggested quantity and leaves the suggestions), remove, set_qty, " +
      "choose (switch the product doing a job to another option — any SKU from productOptions; quantities are re-sized for THIS project, prefer it over replace), " +
      "replace (swap one SKU for another, quantity converted for pack sizes), dismiss_suggestion (stop suggesting that SKU).",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        operations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              op: { type: "string", enum: ["add", "remove", "set_qty", "replace", "choose", "dismiss_suggestion"] },
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
    name: "suggest_sizes",
    description:
      "When the customer doesn't know their measurements (or only says 'small'/'big' and you're unsure), show typical sizes for the project, measuring tips and a pace-counting estimator they can tap. Then ask them to pick one or measure — they can fine-tune in the sketch later.",
    strict: true,
    parameters: {
      type: "object",
      properties: { projectType: { type: "string", enum: [...PROJECT_TYPES] } },
      required: ["projectType"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "control_view",
    description:
      "Change what the customer SEES (no data changes): the 3D sketch view (blueprint / real / exploded layers), highlight one material in the sketch and the list (a role id from the shopping list, e.g. deck_joist, fence_post, wall_tiles; null clears), open the plan editor, scroll to a panel (sketch, list, stock, offers, plan), open the cart or the wallet shopping list, open a product's technical sheet, show the total paid with points. Use it whenever the customer asks to see, show, open or point out something. Set unused fields to null.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        view: { type: ["string", "null"], enum: ["blueprint", "real", "exploded", null] },
        highlight: { type: ["string", "null"], description: "Role id to highlight (e.g. deck_joist), \"none\" to clear, null to leave as is" },
        editor: { type: ["boolean", "null"], description: "Open (true) / close (false) the plan editor" },
        panel: { type: ["string", "null"], enum: ["sketch", "list", "stock", "offers", "plan", "cart", "wallet", null] },
        product: { type: ["string", "null"], description: "SKU whose technical sheet to open" },
        redeemPoints: { type: ["boolean", "null"], description: "Show totals paid partly with points (true) or not (false)" },
      },
      required: ["view", "highlight", "editor", "panel", "product", "redeemPoints"],
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
  edit_sketch: { ro: "Redesenez schița și recalculez", en: "Redrawing the sketch and recalculating" },
  control_view: { ro: "Îți arăt pe schiță", en: "Showing you" },
  suggest_sizes: { ro: "Pregătesc dimensiuni tipice", en: "Preparing typical sizes" },
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

/** How the basket's products look in the 3D sketch. */
export async function basketLook(ctx: Pick<ToolContext, "sources">, items: BasketItem[]): Promise<Look> {
  const products = await ctx.sources.catalog.getMany(items.map((i) => i.sku));
  return lookForBasket(items, new Map(products.map((p) => [p.sku, p])));
}

/** What the model needs from a quote — the UI renders the full card. */
function quoteForModel(q: Quote, lang: Lang) {
  const best = q.availability.alternatives.find((a) => a.allInStock && a.distanceKm <= 60);
  return {
    // Pre-formatted strings: copy these verbatim instead of composing numbers.
    display: {
      total: lei(q.total, lang),
      // Measured against the 30-day lowest prices (what the list shows as "you save").
      saved: q.saving > 0 ? lei(q.saving, lang) : null,
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

const packLabel = (p: Product, qty: number) =>
  p.content.unit === "buc" && p.content.amount === 1 ? `${qty} ${p.salesUnit}` : `${qty} × ${p.content.amount.toLocaleString("ro-RO")} ${p.content.unit}`;

/**
 * Alternatives for every job in the basket, each sized for this project and priced
 * with the member's line-level offers — the "options" drawer on each shopping-list line.
 */
async function projectChoices(
  ctx: ToolContext,
  requirements: Requirement[],
  basket: BasketItem[],
  catalog: Product[],
  offers: Offer[],
  storeId: string,
): Promise<ChoiceGroup[]> {
  const bySku = new Map(catalog.map((p) => [p.sku, p]));
  const groups = requirements
    .filter((req) => basket.some((b) => b.role === req.role))
    .map((req) => ({ req, options: lineOptions(req, catalog) }))
    .filter((g) => g.options.length > 1);
  const skus = [...new Set(groups.flatMap((g) => g.options.flatMap((o) => o.items.map((it) => it.sku))))];
  const stock = await ctx.sources.inventory.stock([storeId], skus);
  return groups.map(({ req, options }) => ({
    role: req.role,
    label: t(ctx.lang, MATERIAL_ROLES[req.role].label, MATERIAL_ROLES[req.role].labelEn),
    basis: req.basis,
    options: options
      .map((o) => {
        const listTotal = o.items.reduce((s, it) => s + bySku.get(it.sku)!.price * it.qty, 0);
        const percentOff = bestPercentOff(o.product, offers);
        return {
          key: o.key,
          sku: o.product.sku,
          name: pn(o.product, ctx.lang).replace(/,\s*[\d.,]+\s*(l|kg|m²|m|buc)\s*$/i, ""),
          brand: o.product.brand,
          quality: o.product.quality,
          rating: o.product.rating,
          highlights: highlights(o.product, ctx.lang).slice(0, 3),
          packLabel: o.items.map((it) => packLabel(bySku.get(it.sku)!, it.qty)).join(" + "),
          items: o.items,
          listTotal: Math.round(listTotal * 100) / 100,
          percentOff,
          total: Math.round(listTotal * (1 - percentOff / 100) * 100) / 100,
          inStock: o.items.every((it) => (stock.get(`${storeId}:${it.sku}`) ?? 0) >= it.qty),
          art: artOf(o.product),
        };
      })
      .sort((a, b) => a.total - b.total)
      .slice(0, 6),
  }));
}

const highlights = (p: Product, lang: Lang) => specHighlights(p, lang);

/** One entry per SKU (a replace can otherwise leave duplicates that edit inconsistently). */
export function mergeBasket(items: BasketItem[]): BasketItem[] {
  const out = new Map<string, BasketItem>();
  for (const it of items) {
    const prev = out.get(it.sku);
    out.set(it.sku, prev ? { ...prev, qty: Math.min(999, prev.qty + it.qty) } : { ...it });
  }
  return [...out.values()];
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

/** Suggestion cards for the SKUs still on offer. */
async function suggestionViews(ctx: ToolContext, items: SuggestedItem[]): Promise<SuggestionView[]> {
  if (!items.length) return [];
  const products = new Map((await ctx.sources.catalog.getMany(items.map((i) => i.sku))).map((p) => [p.sku, p]));
  return items
    .filter((i) => products.has(i.sku))
    .map((i) => {
      const p = products.get(i.sku)!;
      return { sku: i.sku, name: pn(p, ctx.lang), qty: i.qty, unitPrice: p.price, total: Math.round(p.price * i.qty * 100) / 100, basis: i.basis ?? "", isTool: i.isTool };
    });
}

/**
 * The option (product line, sized for this project) that contains `sku` — what the
 * options drawer would offer for that job. Used by modify_basket "choose".
 */
async function sizedOption(
  ctx: ToolContext,
  sku: string,
): Promise<{ role: MaterialRole; label: string; basis: string; isTool: boolean; items: { sku: string; qty: number }[] } | { error: string }> {
  const project = ctx.state.project;
  if (!project) return { error: "No project yet — choose needs a calculated project (use add/replace instead)." };
  const [p] = await ctx.sources.catalog.getMany([sku]);
  if (!p) return { error: `Unknown SKU ${sku}` };
  let reqs: CalculationResult["requirements"];
  try {
    reqs = calculateProject(project.type, { ...project.inputs, ...layoutParams(project.layout ?? defaultLayout(project.type, project.inputs)) }, ctx.lang).requirements;
  } catch {
    return { error: "The project could not be recalculated." };
  }
  const req = reqs.find((r) => p.roles.includes(r.role));
  if (!req) return { error: `${p.name} doesn't do any job in this project.` };
  const options = lineOptions(req, await ctx.sources.catalog.byRoles([req.role]));
  const opt = options.find((o) => o.items.some((it) => it.sku === sku)) ?? options.find((o) => o.key === (req.isTool ? p.sku : productLineKey(p)));
  if (!opt) return { error: `${p.name} doesn't fit this project (e.g. wrong size/height).` };
  return {
    role: req.role,
    label: t(ctx.lang, MATERIAL_ROLES[req.role].label, MATERIAL_ROLES[req.role].labelEn),
    basis: req.basis,
    isTool: Boolean(req.isTool),
    items: opt.items,
  };
}

// ───────────────────────── project pricing ─────────────────────────

interface ProjectRunOptions {
  quality: QualityTier;
  storeId: string;
  includeOptional: boolean;
  layout: Layout;
  revision: number;
  sketched?: boolean;
  /** Keep these products for their roles (the customer's picks survive a sketch edit). */
  preferSkus?: Partial<Record<MaterialRole, string>>;
  /** Roles the customer removed from the list — don't bring them back. */
  excludeRoles?: MaterialRole[];
  /** Optional roles the customer added — keep them in the basket, re-sized. */
  keepOptional?: Set<MaterialRole>;
  /** Hand-added lines unrelated to the calculation, carried over unchanged. */
  carry?: BasketItem[];
  layoutHistory?: Layout[];
  /** Which optional roles may still be suggested (e.g. not the ones the customer dismissed). */
  suggestRole?: (role: MaterialRole) => boolean;
}

/** Resolve products, price every tier, build the options drawer — shared by calculate_project and edit_sketch. */
async function priceProject(ctx: ToolContext, calc: CalculationResult, o: ProjectRunOptions) {
  const roles = [...new Set(calc.requirements.map((r) => r.role))];
  const [catalog, owned] = await Promise.all([ctx.sources.catalog.byRoles(roles), ownedTools(ctx)]);
  const offers = eligibleOffers(await ctx.sources.loyalty.getOffers(ctx.customer.memberId), ctx.customer, ctx.now);
  const basketFor = (tier: QualityTier) => {
    const res = resolveRequirements(calc.requirements, catalog, {
      quality: tier,
      owned,
      includeOptional: o.includeOptional,
      excludeRoles: o.excludeRoles,
      preferSkus: tier === o.quality ? o.preferSkus : undefined,
    });
    const items: BasketItem[] = res.lines.map((l) => ({ sku: l.sku, qty: l.qty, role: l.role, basis: l.basis, isTool: l.isTool }));
    const take = (i: number) => {
      const sg = res.suggestions.splice(i, 1)[0];
      items.push({ sku: sg.sku, qty: sg.qty, role: sg.role, basis: sg.basis, isTool: sg.isTool });
    };
    for (let i = res.suggestions.length - 1; i >= 0; i--) if (o.keepOptional?.has(res.suggestions[i].role)) take(i);
    // If a WalletLoop bundle makes an optional item free, include it — the member would want it.
    for (const of of offers) {
      if (of.kind !== "bundle_free_role" || !of.bundle) continue;
      const units = items.filter((b) => b.role === of.bundle!.requiresRole).reduce((s, b) => s + b.qty, 0);
      const idx = res.suggestions.findIndex((sg) => sg.role === of.bundle!.freeRole);
      if (units >= of.bundle.requiresQty && idx >= 0) take(idx);
    }
    return { resolved: res, basket: mergeBasket([...items, ...(o.carry ?? [])]) };
  };
  const { resolved, basket } = basketFor(o.quality);
  const quote = await priceBasket(ctx, basket, o.storeId);
  // Price the other quality tiers too, so the customer can compare and switch instantly.
  const tiers: QualityOption[] = await Promise.all(
    QUALITIES.map(async (tier) => {
      if (tier === o.quality) return { quality: tier, total: quote.total, basket };
      const alt = basketFor(tier).basket;
      return { quality: tier, total: (await priceBasket(ctx, alt, o.storeId)).total, basket: alt };
    }),
  );
  const bySku = new Map(catalog.map((p) => [p.sku, p]));
  const choices = await projectChoices(ctx, calc.requirements, basket, catalog, offers, o.storeId);
  const look = lookForBasket(basket, new Map(catalog.map((p) => [p.sku, p])));
  const suggested = resolved.suggestions.filter((sg) => !o.suggestRole || o.suggestRole(sg.role));
  const suggestions: SuggestionView[] = suggested.map((sg) => {
    const p = bySku.get(sg.sku)!;
    return { sku: sg.sku, name: pn(p, ctx.lang), qty: sg.qty, unitPrice: p.price, total: Math.round(p.price * sg.qty * 100) / 100, basis: sg.basis, isTool: sg.isTool };
  });
  const ownedProducts = await ctx.sources.catalog.getMany(resolved.skipped.filter((x) => x.ownedSku).map((x) => x.ownedSku!));
  const ownedViews: OwnedToolView[] = resolved.skipped
    .filter((x) => x.reason === "owned")
    .map((x) => {
      const op = ownedProducts.find((p) => p.sku === x.ownedSku);
      return { roleLabel: t(ctx.lang, MATERIAL_ROLES[x.role].label, MATERIAL_ROLES[x.role].labelEn), productName: op ? pn(op, ctx.lang) : "", date: x.ownedDate ?? "" };
    });
  const project: ProjectSnapshot = {
    type: calc.projectType,
    title: calc.title,
    inputs: calc.inputs,
    measurements: calc.measurements,
    assumptions: calc.assumptions,
    estimate: calc.estimate,
    safetyNotes: calc.safetyNotes,
    layout: o.layout,
    sketched: o.sketched,
    revision: o.revision,
    layoutHistory: o.layoutHistory ?? [],
  };
  const state: SessionState = {
    ...ctx.state,
    basket,
    storeId: o.storeId,
    quality: o.quality,
    project,
    suggestions: suggested.map((sg) => ({ sku: sg.sku, qty: sg.qty, role: sg.role, basis: sg.basis, isTool: sg.isTool })),
  };
  return {
    state,
    project,
    basket,
    look,
    quote,
    tiers,
    choices,
    suggestions,
    owned: ownedViews,
    ownedRoles: new Set(owned.keys()),
    unavailable: resolved.skipped.filter((x) => x.reason === "no_product").map((x) => x.role),
  };
}

const signedLei = (v: number, lang: Lang) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${lei(Math.abs(v), lang)}`;

/**
 * Apply sketch edits (from the agent or the plan editor), recompute the materials
 * from the new geometry and re-price — keeping the products the customer picked,
 * leaving out what they removed. Returns the updated cards plus a change card
 * with the per-line and total price difference.
 */
export async function applySketchEdit(ctx: ToolContext, edits: EditOp[], source: SketchChange["source"]): Promise<ToolResult & { error?: string }> {
  const prev = ctx.state.project;
  if (!prev) return { error: "no_project", forModel: { error: "There is no project yet — call calculate_project first." } };
  const layout0 = prev.layout ?? defaultLayout(prev.type, prev.inputs);
  if (!edits.length) return { error: "no_edits", forModel: { error: "No edits given.", sketch: describeLayout(layout0) } };
  const history = prev.layoutHistory ?? [];
  const undo = edits.some((e) => e.op === "undo");
  if (undo && !history.length) {
    const msg = ctx.lang === "en" ? "There is no earlier version of the sketch to go back to." : "Nu există o versiune anterioară a schiței.";
    return { error: msg, forModel: { error: msg } };
  }

  let edited: ReturnType<typeof applyOps>;
  let calc: CalculationResult;
  try {
    edited = undo
      ? { layout: history[history.length - 1], changes: [ctx.lang === "en" ? "Went back to the previous version of the sketch" : "Am revenit la versiunea anterioară a schiței"] }
      : applyOps(layout0, edits as SketchOp[], ctx.lang);
    calc = calculateProject(prev.type, { ...prev.inputs, ...layoutParams(edited.layout) }, ctx.lang);
  } catch (e) {
    if (e instanceof SketchEditError || e instanceof CalculatorInputError) {
      return { error: e.message, forModel: { error: e.message, sketch: describeLayout(layout0), hint: "Nothing was changed. Fix the edit or ask the customer." } };
    }
    throw e;
  }

  // What the customer has now — their picks and removals should survive the edit.
  const basket0 = ctx.state.basket;
  let prevReqs: CalculationResult["requirements"] = [];
  try {
    prevReqs = calculateProject(prev.type, { ...prev.inputs, ...layoutParams(layout0) }, ctx.lang).requirements;
  } catch {
    /* previous geometry no longer valid — treat everything as fresh */
  }
  const inBasket = new Set(basket0.map((b) => b.role).filter(Boolean) as MaterialRole[]);
  const projectRoles = new Set([...prevReqs, ...calc.requirements].map((r) => r.role));
  const preferSkus: Partial<Record<MaterialRole, string>> = {};
  for (const b of basket0) if (b.role && !preferSkus[b.role]) preferSkus[b.role] = b.sku;
  const owned = await ownedTools(ctx);
  const removedByCustomer = prevReqs.filter((r) => !r.optional && !inBasket.has(r.role) && !owned.has(r.role)).map((r) => r.role);
  const keepOptional = new Set(prevReqs.filter((r) => r.optional && inBasket.has(r.role)).map((r) => r.role));
  const carry = basket0.filter((b) => !b.role || !projectRoles.has(b.role));

  // Keep suggesting only what was still on offer (not dismissed/added), plus anything new to this shape.
  const stillSuggested = new Set((ctx.state.suggestions ?? []).map((sg) => sg.role));
  const optionalBefore = new Set(prevReqs.filter((r) => r.optional).map((r) => r.role));
  const storeId = ctx.state.storeId ?? ctx.customer.homeStoreId;
  const quality = ctx.state.quality ?? "standard";
  const [quote0, r] = await Promise.all([
    priceBasket(ctx, basket0, storeId),
    priceProject(ctx, calc, {
      quality,
      storeId,
      includeOptional: false,
      layout: edited.layout,
      revision: (prev.revision ?? 0) + 1,
      sketched: true,
      preferSkus,
      excludeRoles: removedByCustomer,
      keepOptional,
      carry,
      layoutHistory: undo ? history.slice(0, -1) : [...history, layout0].slice(-10),
      suggestRole: (role) => stillSuggested.has(role) || !optionalBefore.has(role),
    }),
  ]);

  // Per-role difference in the material's own unit (metres of board, litres…), so a switch
  // from 3 m to 4 m boards still reads naturally, with the net price change.
  const products = new Map((await ctx.sources.catalog.getMany([...quote0.lines, ...r.quote.lines].map((l) => l.sku))).map((p) => [p.sku, p]));
  const byRole = (q: Quote) => {
    const m = new Map<string, { amount: number; net: number; names: Set<string>; unit: string; role?: MaterialRole }>();
    for (const l of q.lines) {
      const p = products.get(l.sku);
      const k = l.role ?? l.sku;
      const piece = !p || (p.content.unit === "buc" && p.content.amount === 1);
      const cur = m.get(k) ?? { amount: 0, net: 0, names: new Set<string>(), unit: piece ? l.salesUnit : p!.content.unit, role: l.role };
      cur.amount += piece ? l.qty : l.qty * p!.content.amount;
      cur.net += l.netTotal;
      cur.names.add(l.name);
      m.set(k, cur);
    }
    return m;
  };
  const a = byRole(quote0);
  const b = byRole(r.quote);
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const lines: SketchChange["lines"] = [];
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(k);
    const y = b.get(k);
    const deltaRon = r2((y?.net ?? 0) - (x?.net ?? 0));
    const sameProducts = x && y && [...x.names].join("|") === [...y.names].join("|");
    if (sameProducts && r2(x.amount) === r2(y.amount) && Math.abs(deltaRon) < 0.01) continue;
    const role = (y?.role ?? x?.role) as MaterialRole;
    const name = [...(y ?? x)!.names][0];
    lines.push({
      role,
      label: role && MATERIAL_ROLES[role] ? t(ctx.lang, MATERIAL_ROLES[role].label, MATERIAL_ROLES[role].labelEn) : name,
      name,
      beforeName: x && y && !sameProducts ? [...x.names][0] : undefined,
      unit: (y ?? x)!.unit,
      before: r2(x?.amount ?? 0),
      after: r2(y?.amount ?? 0),
      deltaRon,
    });
  }
  lines.sort((p, q) => Math.abs(q.deltaRon) - Math.abs(p.deltaRon));
  const change: SketchChange = {
    edits: edited.changes,
    lines,
    totalBefore: quote0.total,
    totalAfter: r.quote.total,
    delta: Math.round((r.quote.total - quote0.total) * 100) / 100,
    source,
  };

  return {
    state: r.state,
    cards: [
      { kind: "project", id: cardId("project"), project: r.project },
      { kind: "quote", id: cardId("quote"), quote: r.quote, suggestions: r.suggestions, owned: r.owned, tiers: r.tiers, quality, choices: r.choices, look: r.look },
      { kind: "change", id: cardId("change"), change },
    ],
    forModel: {
      applied: edited.changes,
      sketch: describeLayout(edited.layout),
      project: { title: calc.title, measurements: calc.measurements, safetyNotes: calc.safetyNotes },
      display: { totalBefore: lei(quote0.total, ctx.lang), totalAfter: lei(r.quote.total, ctx.lang), difference: signedLei(change.delta, ctx.lang) },
      materialChanges: lines.map((l) => ({ what: l.label, product: l.name, switchedFrom: l.beforeName, from: l.before, to: l.after, unit: l.unit, price: signedLei(l.deltaRon, ctx.lang) })),
      quote: quoteForModel(r.quote, ctx.lang),
      uiNote:
        "The sketch redrew itself (new parts glow) and a change card shows every material and price difference. Reply in 1–2 sentences: what changed and display.difference / display.totalAfter verbatim. Mention a safety note only if it is new (e.g. railings above 60 cm).",
    },
  };
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
    let calc: CalculationResult;
    let layout: Layout;
    const prev = ctx.state.project;
    const keep = args.keepSketch === true && prev?.type === type && prev.layout ? prev : undefined;
    try {
      if (keep) {
        layout = keep.layout!;
        calc = calculateProject(type, { ...keep.inputs, ...layoutParams(layout) }, ctx.lang);
      } else {
        // Validate/default the plain inputs, derive the editable sketch, then compute from the sketch
        // so the quantities and the drawing come from the very same geometry.
        const first = calculateProject(type, cleanParams(args.params), ctx.lang);
        layout = defaultLayout(type, first.inputs);
        calc = calculateProject(type, { ...first.inputs, ...layoutParams(layout) }, ctx.lang);
      }
    } catch (e) {
      if (e instanceof CalculatorInputError) return { forModel: { error: e.message, hint: "Ask the customer for the missing/invalid dimension." } };
      throw e;
    }
    const store = await storeIdOrDefault(ctx, args.storeId);
    const r = await priceProject(ctx, calc, {
      quality,
      storeId: store.id,
      includeOptional: args.includeOptional === true,
      layout,
      revision: keep ? (keep.revision ?? 0) : 0,
      sketched: keep?.sketched,
      layoutHistory: keep?.layoutHistory,
    });
    return {
      state: r.state,
      cards: [
        { kind: "project", id: cardId("project"), project: r.project },
        { kind: "quote", id: cardId("quote"), quote: r.quote, suggestions: r.suggestions, owned: r.owned, tiers: r.tiers, quality, choices: r.choices, look: r.look },
      ],
      forModel: {
        storeWarning: store.error,
        project: { title: calc.title, inputsUsed: calc.inputs, measurements: calc.measurements, assumptions: calc.assumptions, estimate: calc.estimate, safetyNotes: calc.safetyNotes },
        sketch: describeLayout(layout),
        quality,
        quote: quoteForModel(r.quote, ctx.lang),
        ownedToolsSkipped: r.owned.map((o) => `${o.roleLabel} (${o.productName}, bought ${o.date})`),
        optionalSuggestions: r.suggestions.map((s) => ({ sku: s.sku, name: s.name, qty: s.qty, total: s.total, why: s.basis })),
        // The customer can browse these in the "options" drawer on each line; mention a notable saving/upgrade if useful.
        productOptions: r.choices.map((g) => ({
          for: g.label,
          role: g.role,
          options: g.options.map((o) => ({ sku: o.sku, name: o.name, quality: o.quality, total: o.total, inStock: o.inStock, items: o.items })),
        })),
        unavailableRoles: r.unavailable,
        uiNote: "The customer now sees the project card (3D sketch + measurements) and the full priced shopping list card. Do not repeat the list in text. The sketch can be reshaped with edit_sketch.",
      },
    };
  },

  async edit_sketch(args, ctx) {
    const edits = (Array.isArray(args.edits) ? (args.edits as Record<string, unknown>[]) : []).map((e) =>
      e.op === "set_option" && e.option != null ? { ...e, value: e.option } : e,
    ) as unknown as EditOp[];
    return applySketchEdit(ctx, edits, "agent");
  },

  async suggest_sizes(args, ctx) {
    const type = args.projectType as ProjectType;
    if (!PROJECT_TYPES.includes(type)) return { forModel: { error: `Unknown project type ${String(args.projectType)}` } };
    const help = sizeHelp(type, ctx.lang);
    return {
      cards: [{ kind: "sizes", id: cardId("sizes"), projectType: type, help }],
      forModel: {
        shown: help.presets.map((p) => p.label),
        note: "The customer sees these presets, measuring tips and a pace estimator as tappable buttons. Ask in one sentence which fits, or to pace it out — don't repeat the list.",
      },
    };
  },

  async control_view(args, ctx) {
    const ui: UiCommand = {};
    if (args.view === "blueprint" || args.view === "real" || args.view === "exploded") ui.view = args.view;
    if (args.highlight === "none") ui.highlight = null;
    else if (typeof args.highlight === "string" && args.highlight) {
      const role = args.highlight as MaterialRole;
      if (!MATERIAL_ROLES[role]) return { forModel: { error: `Unknown role "${args.highlight}". Use a role id from the shopping list.` } };
      ui.highlight = role;
      // Lifting the layers apart makes one material easy to see.
      if (!ui.view) ui.view = "exploded";
    }
    if (typeof args.editor === "boolean") {
      if (args.editor && !ctx.state.project) return { forModel: { error: "There is no project sketch yet." } };
      ui.editor = args.editor;
    }
    if (["sketch", "list", "stock", "offers", "plan", "cart", "wallet"].includes(String(args.panel))) ui.panel = args.panel as UiCommand["panel"];
    if (typeof args.product === "string" && args.product) {
      const [p] = await ctx.sources.catalog.getMany([args.product]);
      if (!p) return { forModel: { error: `Unknown SKU ${args.product}` } };
      ui.product = p.sku;
    }
    if (typeof args.redeemPoints === "boolean") ui.redeemPoints = args.redeemPoints;
    if (!Object.keys(ui).length) return { forModel: { error: "Nothing to show — set at least one field." } };
    return { ui, forModel: { shown: ui, note: "Done on screen; mention it in a few words." } };
  },

  async modify_basket(args, ctx) {
    const ops = Array.isArray(args.operations) ? (args.operations as Record<string, unknown>[]) : [];
    let basket = [...ctx.state.basket];
    let suggestions = [...(ctx.state.suggestions ?? [])];
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
          const sug = suggestions.find((sg) => sg.sku === sku);
          const n = qty && qty > 0 ? qty : sug?.qty ?? 1;
          if (idx >= 0) basket[idx] = { ...basket[idx], qty: basket[idx].qty + n };
          else basket.push({ sku, qty: n, role: sug?.role ?? p.roles[0], basis: sug?.basis, isTool: p.isTool });
          suggestions = suggestions.filter((sg) => sg.sku !== sku);
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
          basket[idx] = { ...basket[idx], qty: Math.min(999, qty) };
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
          basket[idx] = { ...basket[idx], sku: withSku, qty: newQty, role: newP.roles[0], isTool: newP.isTool };
          changes.push(`${oldP.name} → ${newQty}× ${newP.name}`);
          break;
        }
        case "choose": {
          const opt = await sizedOption(ctx, sku);
          if ("error" in opt) { errors.push(opt.error); break; }
          // The chosen option takes the place of whatever did that job, sized for this project.
          const at = basket.findIndex((b) => b.role === opt.role);
          const others = basket.filter((b) => b.role !== opt.role);
          const chosen = opt.items.map((it) => ({ sku: it.sku, qty: it.qty, role: opt.role, basis: opt.basis, isTool: opt.isTool }));
          basket = at < 0 ? [...others, ...chosen] : [...others.slice(0, at), ...chosen, ...others.slice(at)];
          suggestions = suggestions.filter((sg) => sg.role !== opt.role);
          changes.push(`${opt.label} → ${opt.items.map((it) => `${it.qty}× ${it.sku}`).join(" + ")}`);
          break;
        }
        case "dismiss_suggestion":
          if (!suggestions.some((sg) => sg.sku === sku)) { errors.push(`SKU ${sku} is not among the suggestions`); break; }
          suggestions = suggestions.filter((sg) => sg.sku !== sku);
          changes.push(`no longer suggesting ${known.get(sku)?.name ?? sku}`);
          break;
        default:
          errors.push(`Unknown op ${String(o.op)}`);
      }
    }
    basket = mergeBasket(basket);
    const store = await storeIdOrDefault(ctx, args.storeId);
    if (store.error) errors.push(store.error);
    const [quote, views, look] = await Promise.all([priceBasket(ctx, basket, store.id), suggestionViews(ctx, suggestions), basketLook(ctx, basket)]);
    const state: SessionState = { ...ctx.state, basket, storeId: store.id, suggestions };
    return {
      state,
      cards: [{ kind: "quote", id: cardId("quote"), quote, suggestions: views, owned: [], look }],
      forModel: {
        changes,
        errors: errors.length ? errors : undefined,
        quote: quoteForModel(quote, ctx.lang),
        remainingSuggestions: views.map((v) => ({ sku: v.sku, name: v.name, qty: v.qty, total: v.total })),
      },
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
      highlights: highlights(p, ctx.lang),
      stockAtStore: stock.get(`${storeId}:${p.sku}`) ?? 0,
      art: artOf(p),
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
      applied = new Set(q.discounts.map((d) => d.offerId).concat(q.points.bonusNotes.length ? eligible.filter((o) => q.points.bonusNotes.includes(t(ctx.lang, o.title, o.titleEn))).map((o) => o.id) : []));
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
