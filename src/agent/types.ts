import type { CalculationResult, ProjectType } from "@/domain/calculators";
import type { BasketItem, Quote } from "@/domain/quote";
import type { ArtSpec } from "@/domain/art";
import type { Layout } from "@/domain/layout";
import type { MaterialRole, Offer, QualityTier } from "@/domain/types";

/** Conversation state the client round-trips with every request (server stays stateless). */
export interface SessionState {
  basket: BasketItem[];
  storeId?: string;
  quality?: QualityTier;
  project?: ProjectSnapshot;
  /** Optional extras offered for the project that are not in the basket (yet). */
  suggestions?: SuggestedItem[];
}

export interface SuggestedItem {
  sku: string;
  qty: number;
  role: MaterialRole;
  basis?: string;
  isTool: boolean;
}

/**
 * Something the assistant wants the screen to do (not data): switch the 3D view,
 * highlight a material, open the plan editor, the cart, a product sheet, scroll to a panel.
 */
export interface UiCommand {
  view?: "blueprint" | "real" | "exploded";
  /** A material layer / role to highlight in the sketch and the list (null clears). */
  highlight?: string | null;
  editor?: boolean;
  panel?: "sketch" | "list" | "stock" | "offers" | "plan" | "cart" | "wallet";
  /** Open this product's sheet. */
  product?: string;
  /** Show totals paid partly with points. */
  redeemPoints?: boolean;
  replay?: boolean;
}

export interface ProjectSnapshot {
  type: ProjectType;
  title: string;
  inputs: Record<string, unknown>;
  measurements: CalculationResult["measurements"];
  assumptions: string[];
  estimate: CalculationResult["estimate"];
  safetyNotes: string[];
  /** The editable sketch the quantities were computed from. */
  layout?: Layout;
  /** The customer opened the sketch (on-demand tenants only draw it when asked). */
  sketched?: boolean;
  /** Bumps on every sketch edit. */
  revision?: number;
  /** Earlier layouts, most recent last, so "undo" works from the chat too. */
  layoutHistory?: Layout[];
}

/** What one sketch edit did to the shopping list and the price. */
export interface SketchChange {
  /** Readable list of the geometry edits ("Added a 2 × 2 m wing on the east side"). */
  edits: string[];
  lines: {
    role: MaterialRole;
    label: string;
    /** Product after the edit (or the removed one). */
    name: string;
    /** Set when the edit switched the product (e.g. taller pedestals, other board length). */
    beforeName?: string;
    /** Amounts in the material's own unit (m of board, l of paint, pieces…), so different pack sizes compare. */
    unit: string;
    before: number;
    after: number;
    /** Net price difference for this line (with offers). */
    deltaRon: number;
  }[];
  totalBefore: number;
  totalAfter: number;
  delta: number;
  source: "agent" | "editor";
}

export interface SuggestionView {
  sku: string;
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
  basis: string;
  isTool: boolean;
}

/** One product line that can do a shopping-list job, sized for the customer's project. */
export interface ProductOptionView {
  key: string;
  sku: string;
  name: string;
  brand: string;
  quality: QualityTier;
  rating: number;
  highlights: string[];
  /** e.g. "3 × 10 l", "22 × 4 m". */
  packLabel: string;
  items: { sku: string; qty: number }[];
  /** Price for this project with the member's line-level offers (before basket-level offers). */
  total: number;
  listTotal: number;
  percentOff: number;
  /** Units available at the selected store for every pack of this option. */
  inStock: boolean;
  art: ArtSpec;
}

/** The alternatives for one role in the basket ("Deck boards: 4 options"). */
export interface ChoiceGroup {
  role: MaterialRole;
  label: string;
  basis: string;
  options: ProductOptionView[];
}

export interface QualityOption {
  quality: QualityTier;
  total: number;
  basket: BasketItem[];
}

export interface OwnedToolView {
  roleLabel: string;
  productName: string;
  date: string;
}

export interface StockStoreView {
  storeId: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  distanceKm: number;
  isHome: boolean;
  isSelected: boolean;
  items: { sku: string; name: string; needed: number; available: number }[];
  allInStock: boolean;
}

export interface OfferView {
  id: string;
  title: string;
  reason: string;
  validUntil: string;
  kind: Offer["kind"];
  appliesNow: boolean;
}

export interface ProductView {
  sku: string;
  name: string;
  brand: string;
  price: number;
  salesUnit: string;
  quality: QualityTier;
  rating: number;
  highlights: string[];
  stockAtStore: number;
  art: ArtSpec;
}

export interface PlanView {
  title: string;
  summary: string;
  steps: { title: string; detail: string; duration: string | null }[];
  tips: string[];
  safetyWarnings: string[];
}

export type Card =
  | { kind: "project"; id: string; project: ProjectSnapshot }
  | {
      kind: "quote";
      id: string;
      quote: Quote;
      suggestions: SuggestionView[];
      owned: OwnedToolView[];
      /** Same project priced at every quality tier (from calculate_project). */
      tiers?: QualityOption[];
      quality?: QualityTier;
      /** Alternatives per basket role — stay valid while the project is the same. */
      choices?: ChoiceGroup[];
    }
  | { kind: "stock"; id: string; stores: StockStoreView[] }
  | { kind: "offers"; id: string; offers: OfferView[] }
  | { kind: "products"; id: string; query: string; products: ProductView[] }
  | { kind: "plan"; id: string; plan: PlanView }
  | { kind: "change"; id: string; change: SketchChange };

export type AgentEvent =
  | { type: "mode"; mode: "live" | "scripted"; reason?: string }
  | { type: "status"; tool: string; label: string }
  | { type: "text"; delta: string }
  /** The guard rejected the model's reply; the client swaps in this text. */
  | { type: "replace_text"; text: string }
  /** Result of checking every money amount in the reply against the quote engine. */
  | { type: "verified"; ok: boolean; checked: number; replaced?: boolean }
  | { type: "card"; card: Card }
  | { type: "ui"; command: UiCommand }
  | { type: "state"; state: SessionState }
  | { type: "history"; items: unknown[] }
  | { type: "error"; message: string }
  | { type: "done"; usage?: { inputTokens: number; outputTokens: number }; ms: number };
