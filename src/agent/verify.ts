import type { Quote } from "@/domain/quote";

/**
 * Post-hoc guard for the model's final message: every money amount it states must
 * exist in the quote the tools produced, and no placeholder-like garbage ("3xx lei")
 * may appear. Used to badge verified answers and to replace bad ones.
 *
 * It is also the last line against prompt injection: whatever someone talked the model into, a
 * reply with an invented amount or percentage, another currency, a link, an email address or a
 * phone number never stays on screen.
 */

const NUM = String.raw`(\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)`;
/** "500 lei", "500 de lei" (Romanian for 20 and up), "RON 500", "lei 500". */
const MONEY = new RegExp(String.raw`${NUM}\s*(?:de\s+)?(?:lei|ron)\b|\b(?:lei|ron)\s*${NUM}`, "gi");
/** Prices here are in lei: an amount in another currency is made up. */
const FOREIGN = new RegExp(String.raw`${NUM}\s*(?:€|\$|eur(?:o|os)?\b|usd\b)|(?:€|\$)\s*${NUM}`, "i");
const PERCENT = /(\d{1,3}(?:[.,]\d{1,2})?)\s?%/g;
const GARBAGE = /\b\d*x{2,}\b|\?\?|\bNaN\b|\bundefined\b|\{\{|\}\}/i;
/** The assistant never needs to send anyone elsewhere: links, email addresses, phone numbers. */
const UNSAFE = [
  /\bhttps?:\/\/|\bwww\.[a-z0-9-]+\.[a-z]{2,}|\b[a-z0-9-]+\.(?:com|ro|net|org|eu|io|ly|me|info|biz|xyz|link|click|app|shop)\b/i,
  /[\w.+-]+@[\w-]+\.[\w.]{2,}/,
  /(?:\+\s?40|\b0040|\b0)[\s.-]?(?:7\d{2}|[23]\d{2})[\s.-]?\d{3}[\s.-]?\d{3}\b|\+\d{2,3}[\s.-]?\d{2,4}[\s.-]?\d{3}[\s.-]?\d{3,4}\b/,
];

function parseNumber(raw: string): number {
  const s = raw.replace(/\s/g, "");
  // ro: 1.234,56 · en: 1,234.56 · plain: 1234 / 1234.5
  if (/,\d{1,2}$/.test(s)) return Number(s.replace(/\./g, "").replace(",", "."));
  if (/\.\d{1,2}$/.test(s)) return Number(s.replace(/,/g, ""));
  return Number(s.replace(/[.,]/g, ""));
}

export function moneyAmounts(text: string): number[] {
  return [...text.replace(/\*\*/g, "").matchAll(MONEY)].map((m) => parseNumber(m[1] ?? m[2]));
}

export function percentsIn(text: string): number[] {
  return [...text.matchAll(PERCENT)].map((m) => Number(m[1].replace(",", ".")));
}

export function allowedAmounts(q: Quote, extra: number[] = []): number[] {
  const s = new Set<number>([
    q.total,
    q.subtotal,
    q.discountTotal,
    // Omnibus-safe "was / you save" figures shown in the list and cart.
    q.saving,
    q.compareAt,
    q.points.redeemableValue,
    q.points.totalIfRedeemed,
    q.delivery.fee,
    ...(q.delivery.freeFrom ? [q.delivery.freeFrom] : []),
    ...extra,
  ]);
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
  /** Percentages no tool result contains ("50% reducere"). */
  inventedPercents?: number[];
  /** A link, email address or phone number, or an amount in another currency. */
  unsafe?: boolean;
}

/**
 * `quote`: the list the reply talks about — without one, only `extra` amounts can be right.
 * `percents`: the percentages the tools produced; when given, any other "N%" fails.
 */
export function verifyReply(text: string, quote: Quote | undefined, extra: number[] = [], opts: { percents?: number[] } = {}): Verification {
  const plain = text.replace(/\*\*/g, "");
  const garbage = GARBAGE.test(plain);
  const unsafe = UNSAFE.some((re) => re.test(plain)) || FOREIGN.test(plain);
  const allowed = quote ? allowedAmounts(quote, extra) : extra.map((v) => Math.round(v * 100) / 100);
  const amounts = moneyAmounts(plain);
  // Whole-lei roundings of real amounts are fine ("aprox. 240 lei").
  const invented = amounts.filter((v) => !allowed.some((a) => Math.abs(a - v) < 0.011 || (Number.isInteger(v) && Math.abs(Math.round(a) - v) < 0.5)));
  const inventedPercents = opts.percents ? percentsIn(plain).filter((p) => !opts.percents!.some((q) => Math.abs(q - p) < 0.01)) : [];
  return {
    ok: !garbage && !unsafe && invented.length === 0 && inventedPercents.length === 0,
    checked: amounts.length,
    invented,
    garbage,
    ...(inventedPercents.length ? { inventedPercents } : {}),
    ...(unsafe ? { unsafe } : {}),
  };
}
