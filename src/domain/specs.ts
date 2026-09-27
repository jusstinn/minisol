import type { Lang, Product } from "./types";

/**
 * Human-readable spec labels for the most useful keys, in display priority order.
 * Anything not listed is skipped in highlights (the full specs stay available to the agent).
 */
const LABELS: [key: string, ro: string, en: string, unit?: string][] = [
  ["material", "", ""],
  ["decor", "", ""],
  ["color", "culoare", "colour"],
  ["acClass", "clasa", "class"],
  ["class", "clasă", "class"],
  ["clasa", "clasă lavabilitate", "wash class"],
  ["coverageM2PerL", "randament", "coverage", "m²/l"],
  ["coverageM2PerKg", "randament", "coverage", "m²/kg"],
  ["sizeCm", "format", "size", "cm"],
  ["widthMm", "lățime", "width", "mm"],
  ["thicknessMm", "grosime", "thickness", "mm"],
  ["lengthM", "lungime", "length", "m"],
  ["heightM", "înălțime", "height", "m"],
  ["sectionMm", "secțiune", "section", "mm"],
  ["heightRangeMm", "reglaj", "adjusts", "mm"],
  ["finish", "finisaj", "finish"],
  ["pei", "PEI", "PEI"],
  ["antiSlip", "antiderapant", "anti-slip"],
  ["useClass", "clasă de utilizare", "use class"],
  ["m2PerPack", "", "", "m²/pachet"],
  ["m2PerBox", "", "", "m²/cutie"],
  ["perBox", "", "", "buc/cutie"],
  ["bagKg", "", "", "kg/sac"],
  ["voltage", "", "", "V"],
  ["batteryAh", "baterie", "battery", "Ah"],
  ["powerW", "putere", "power", "W"],
  ["type", "tip", "type"],
  ["waterResistant", "rezistent la apă", "water resistant"],
  ["frostResistant", "rezistent la îngheț", "frost resistant"],
  ["stainless", "inox", "stainless"],
  ["brushless", "motor brushless", "brushless motor"],
  ["uvResistant", "rezistent UV", "UV resistant"],
  ["lambda", "λ", "λ", "W/mK"],
];

export function specHighlights(p: Product, lang: Lang, max = 4): string[] {
  const out: string[] = [];
  for (const [key, ro, en, unit] of LABELS) {
    const v = p.specs[key];
    if (v === undefined || v === "" || v === false) continue;
    const label = lang === "en" ? en : ro;
    if (v === true) {
      if (label) out.push(label);
    } else {
      const value = typeof v === "number" ? v.toLocaleString(lang === "en" ? "en-GB" : "ro-RO") : String(v);
      out.push([label, `${value}${unit ? ` ${unit}` : ""}`].filter(Boolean).join(" "));
    }
    if (out.length >= max) break;
  }
  return out;
}
