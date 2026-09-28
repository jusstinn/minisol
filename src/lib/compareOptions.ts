import type { ProductOptionView } from "@/agent/types";
import type { Lang, QualityTier } from "@/domain/types";
import { dec, lei } from "./format";

/**
 * "Compară variantele": two options for the same job side by side — both already sized for
 * the customer's project and priced with their offers, so the difference is the real one.
 */

export interface CompareRow {
  key: "price" | "discount" | "pack" | "quality" | "rating" | "stock";
  label: string;
  a: string;
  b: string;
  /** Which side is better on this row (none when equal or not comparable). */
  better?: "a" | "b";
}

export interface Comparison {
  rows: CompareRow[];
  /** b − a, in lei (price for the project, with offers). */
  delta: number;
  /** Relative to a, rounded to a whole percent. */
  deltaPct: number;
  /** One sentence: "WPC costs 1.234,00 lei more for your project (+36 %), rated 4.6 vs 4.2." */
  summary: string;
}

const RANK: Record<QualityTier, number> = { budget: 0, standard: 1, premium: 2 };
const QUALITY: Record<QualityTier, { ro: string; en: string }> = {
  budget: { ro: "Economic", en: "Budget" },
  standard: { ro: "Standard", en: "Standard" },
  premium: { ro: "Premium", en: "Premium" },
};

const pick = (x: number, y: number, higherIsBetter: boolean): "a" | "b" | undefined => (x === y ? undefined : (x > y) === higherIsBetter ? "a" : "b");

/** The short, generic part of an option's name for the sentence ("Deck WPC compozit gri"). */
const short = (o: ProductOptionView) => o.name.replace(new RegExp(`\\s*${o.brand}\\b.*$`), "").trim() || o.name;

export function compareOptions(a: ProductOptionView, b: ProductOptionView, lang: Lang): Comparison {
  const en = lang === "en";
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const delta = r2(b.total - a.total);
  const deltaPct = a.total > 0 ? Math.round((delta / a.total) * 100) : 0;
  const yes = en ? "Yes" : "Da";
  const no = en ? "Not enough" : "Insuficient";
  const rows: CompareRow[] = [
    { key: "price", label: en ? "For your project" : "Pentru proiectul tău", a: lei(a.total, lang), b: lei(b.total, lang), better: pick(a.total, b.total, false) },
    { key: "discount", label: en ? "Your discount" : "Reducerea ta", a: a.percentOff ? `−${a.percentOff}%` : "—", b: b.percentOff ? `−${b.percentOff}%` : "—", better: pick(a.percentOff, b.percentOff, true) },
    { key: "pack", label: en ? "What you buy" : "Ce cumperi", a: a.packLabel, b: b.packLabel },
    { key: "quality", label: en ? "Quality" : "Calitate", a: QUALITY[a.quality][lang], b: QUALITY[b.quality][lang], better: pick(RANK[a.quality], RANK[b.quality], true) },
    { key: "rating", label: en ? "Rating" : "Rating", a: `${dec(a.rating, lang, 1)} / 5`, b: `${dec(b.rating, lang, 1)} / 5`, better: pick(a.rating, b.rating, true) },
    { key: "stock", label: en ? "In stock at your store" : "Pe stoc în magazin", a: a.inStock ? yes : no, b: b.inStock ? yes : no, better: a.inStock === b.inStock ? undefined : a.inStock ? "a" : "b" },
  ];
  const money = lei(Math.abs(delta), lang);
  const pct = `${deltaPct > 0 ? "+" : deltaPct < 0 ? "−" : "±"}${Math.abs(deltaPct)}%`;
  const rating = a.rating !== b.rating ? (en ? `, rated ${dec(b.rating, lang, 1)} vs ${dec(a.rating, lang, 1)}` : `, rating ${dec(b.rating, lang, 1)} față de ${dec(a.rating, lang, 1)}`) : "";
  const summary =
    Math.abs(delta) < 0.01
      ? en
        ? `${short(b)} costs the same for your project${rating}.`
        : `${short(b)} costă la fel pentru proiectul tău${rating}.`
      : en
        ? `${short(b)} costs ${money} ${delta > 0 ? "more" : "less"} for your project (${pct})${rating}.`
        : `${short(b)} costă cu ${money} ${delta > 0 ? "mai mult" : "mai puțin"} pentru proiectul tău (${pct})${rating}.`;
  return { rows, delta, deltaPct, summary };
}
