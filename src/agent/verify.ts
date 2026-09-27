import type { Quote } from "@/domain/quote";

/**
 * Post-hoc guard for the model's final message: every money amount it states must
 * exist in the quote the tools produced, and no placeholder-like garbage ("3xx lei")
 * may appear. Used to badge verified answers and to replace bad ones.
 */

const MONEY = /(\d{1,3}(?:[.,\s ]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:lei|ron)\b/gi;
const GARBAGE = /\b\d*x{2,}\b|\?\?|\bNaN\b|\bundefined\b|\{\{|\}\}/i;

export function moneyAmounts(text: string): number[] {
  return [...text.replace(/\*\*/g, "").matchAll(MONEY)].map((m) => {
    const raw = m[1].replace(/[\s ]/g, "");
    // ro: 1.234,56 · en: 1,234.56 · plain: 1234 / 1234.5
    if (/,\d{1,2}$/.test(raw)) return Number(raw.replace(/\./g, "").replace(",", "."));
    if (/\.\d{1,2}$/.test(raw)) return Number(raw.replace(/,/g, ""));
    return Number(raw.replace(/[.,]/g, ""));
  });
}

export function allowedAmounts(q: Quote, extra: number[] = []): number[] {
  const s = new Set<number>([q.total, q.subtotal, q.discountTotal, q.points.redeemableValue, q.points.totalIfRedeemed, q.delivery.fee, ...extra]);
  for (const l of q.lines) [l.unitPrice, l.lineTotal, l.netTotal, l.discount].forEach((v) => s.add(v));
  for (const d of q.discounts) s.add(d.amount);
  for (const h of q.hints) if (h.amountToGo) s.add(h.amountToGo);
  s.add(Math.round(q.points.earned * 0.05 * 100) / 100);
  return [...s].map((v) => Math.round(v * 100) / 100);
}

export interface Verification {
  ok: boolean;
  checked: number;
  invented: number[];
  garbage: boolean;
}

export function verifyReply(text: string, quote: Quote | undefined, extra: number[] = []): Verification {
  const garbage = GARBAGE.test(text);
  if (!quote) return { ok: !garbage, checked: 0, invented: [], garbage };
  const allowed = allowedAmounts(quote, extra);
  const amounts = moneyAmounts(text);
  // Whole-lei roundings of real amounts are fine ("aprox. 240 lei").
  const invented = amounts.filter((v) => !allowed.some((a) => Math.abs(a - v) < 0.011 || (Number.isInteger(v) && Math.abs(Math.round(a) - v) < 0.5)));
  return { ok: !garbage && invented.length === 0, checked: amounts.length, invented, garbage };
}
