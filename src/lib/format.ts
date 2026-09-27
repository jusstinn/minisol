import type { Lang } from "@/domain/types";

const nf = new Map<string, Intl.NumberFormat>();
function fmt(lang: Lang, digits: number) {
  const key = `${lang}${digits}`;
  let f = nf.get(key);
  if (!f) {
    f = new Intl.NumberFormat(lang === "en" ? "en-GB" : "ro-RO", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    nf.set(key, f);
  }
  return f;
}

export const money = (n: number, lang: Lang = "ro") => fmt(lang, 2).format(n);
export const lei = (n: number, lang: Lang = "ro") => `${money(n, lang)} lei`;
export const int = (n: number, lang: Lang = "ro") => fmt(lang, 0).format(Math.round(n));
export const dec = (n: number, lang: Lang = "ro", digits = 2) => fmt(lang, digits).format(n);

export function monthYear(iso: string, lang: Lang = "ro") {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === "en" ? "en-GB" : "ro-RO", { month: "short", year: "numeric" });
}

export function dayMonth(iso: string, lang: Lang = "ro") {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === "en" ? "en-GB" : "ro-RO", { day: "numeric", month: "short" });
}
