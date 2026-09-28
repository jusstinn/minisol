import { artOf } from "./art";
import type { ArtSpec } from "./art";
import { sketchOf } from "./sketch";
import type { SketchSpec } from "./sketch";
import { specHighlights, specTable } from "./specs";
import type { SpecRow } from "./specs";
import type { BaseUnit, CategoryId, Lang, Product, QualityTier } from "./types";

/** Stock of one product at one store, as shown on the product sheet. */
export interface StockAtStore {
  storeId: string;
  storeName: string;
  available: number;
  aisle: number;
}

/** Everything the product sheet ("fișă tehnică") shows, in the reader's language. */
export interface ProductDetailView {
  sku: string;
  name: string;
  brand: string;
  category: CategoryId;
  quality: QualityTier;
  rating: number;
  /** RON incl. VAT, per sales unit. */
  price: number;
  salesUnit: string;
  content: { amount: number; unit: BaseUnit };
  /** Price per base unit (lei/l, lei/m, lei/m²…); null when one sales unit is one piece. */
  unitPrice: { value: number; unit: BaseUnit } | null;
  isTool: boolean;
  description: string;
  highlights: string[];
  specs: SpecRow[];
  art: ArtSpec;
  sketch: SketchSpec;
  stock: StockAtStore | null;
}

export function productDetail(p: Product, lang: Lang, stock: StockAtStore | null): ProductDetailView {
  const perPiece = p.content.unit === "buc" && p.content.amount === 1;
  return {
    sku: p.sku,
    name: lang === "en" ? p.nameEn : p.name,
    brand: p.brand,
    category: p.category,
    quality: p.quality,
    rating: p.rating,
    price: p.price,
    salesUnit: p.salesUnit,
    content: p.content,
    unitPrice: perPiece || p.content.amount <= 0 ? null : { value: Math.round((p.price / p.content.amount) * 100) / 100, unit: p.content.unit },
    isTool: p.isTool,
    description: lang === "en" ? p.descriptionEn : p.description,
    highlights: specHighlights(p, lang, 4),
    specs: specTable(p, lang),
    art: artOf(p),
    sketch: sketchOf(p),
    stock,
  };
}
