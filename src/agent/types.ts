import type { CalculationResult, ProjectType } from "@/domain/calculators";
import type { BasketItem, Quote } from "@/domain/quote";
import type { Offer, QualityTier } from "@/domain/types";

/** Conversation state the client round-trips with every request (server stays stateless). */
export interface SessionState {
  basket: BasketItem[];
  storeId?: string;
  quality?: QualityTier;
  project?: ProjectSnapshot;
}

export interface ProjectSnapshot {
  type: ProjectType;
  title: string;
  inputs: Record<string, unknown>;
  measurements: CalculationResult["measurements"];
  assumptions: string[];
  estimate: CalculationResult["estimate"];
  safetyNotes: string[];
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
  | { kind: "quote"; id: string; quote: Quote; suggestions: SuggestionView[]; owned: OwnedToolView[] }
  | { kind: "stock"; id: string; stores: StockStoreView[] }
  | { kind: "offers"; id: string; offers: OfferView[] }
  | { kind: "products"; id: string; query: string; products: ProductView[] }
  | { kind: "plan"; id: string; plan: PlanView };

export type AgentEvent =
  | { type: "status"; tool: string; label: string }
  | { type: "text"; delta: string }
  | { type: "card"; card: Card }
  | { type: "state"; state: SessionState }
  | { type: "history"; items: unknown[] }
  | { type: "error"; message: string }
  | { type: "done"; usage?: { inputTokens: number; outputTokens: number }; ms: number };
