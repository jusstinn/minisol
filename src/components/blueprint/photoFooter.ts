import type { Lang } from "@/domain/types";

/**
 * Text for the branded footer strip baked into a "Randare foto" export (see PhotoRender.tsx):
 * the project title, its main dimensions, the retailer, the date and the same "indicative
 * sketch" notice the sketch itself always shows — never a price (see usage.ts's privacy note:
 * nothing here is personal either, it's the same facts already on screen).
 */

export interface FooterMeasurement {
  label: string;
  value: number;
  unit: string;
}

export interface FooterOptions {
  title: string;
  /** `ProjectSnapshot.measurements` — the first couple make the "4 m × 3 m" line. */
  measurements: FooterMeasurement[];
  tenant: string;
  lang: Lang;
  date?: Date;
}

export interface FooterText {
  title: string;
  /** "4 m × 3 m" (empty when there's nothing to show). */
  dims: string;
  /** "HORNBACH  ·  24 oct. 2026  ·  Schiță orientativă". */
  meta: string;
}

const UNIT_EN: Record<string, string> = { buc: "pcs", rânduri: "rows" };
const unitText = (u: string, lang: Lang) => (lang === "en" ? UNIT_EN[u] ?? u : u);
const isWholeUnit = (u: string) => u === "buc" || u === "rânduri";

function formatNumber(n: number, lang: Lang, digits: number): string {
  return new Intl.NumberFormat(lang === "en" ? "en-GB" : "ro-RO", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

/** Pure — no DOM, no canvas (those live in PhotoRender.tsx), so it's unit-tested directly. */
export function footerText(opts: FooterOptions): FooterText {
  const { title, measurements, tenant, lang } = opts;
  const date = opts.date ?? new Date();
  const dims = measurements
    .slice(0, 2)
    .map((m) => `${formatNumber(m.value, lang, isWholeUnit(m.unit) ? 0 : 2)} ${unitText(m.unit, lang)}`)
    .join(" × ");
  const dateText = date.toLocaleDateString(lang === "en" ? "en-GB" : "ro-RO", { day: "numeric", month: "short", year: "numeric" });
  const note = lang === "en" ? "Indicative sketch" : "Schiță orientativă";
  const meta = [tenant, dateText, note].filter(Boolean).join("  ·  ");
  return { title, dims, meta };
}
