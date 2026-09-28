import type { Lang } from "@/domain/types";

/**
 * Sketch-edit and calculator errors are written for the model (English, technical: `"w" must be between
 * 0.5 and 30 m`). Customers see them in replies and in the plan editor, so say them in their language.
 */
type Rule = [RegExp, (m: RegExpMatchArray, en: boolean) => string];

const num = (s: string, en: boolean) => (en ? s : s.replace(".", ","));

const RULES: Rule[] = [
  [/must be between ([\d.]+) and ([\d.]+) m/, (m, en) => (en ? `sizes here go from ${m[1]} to ${m[2]} m` : `dimensiunea trebuie să fie între ${num(m[1], en)} și ${num(m[2], en)} m`)],
  [/looks too large \(([\d.]+)\); max is ([\d.]+)/, (m, en) => (en ? `${m[1]} is too large — the maximum is ${m[2]}` : `${num(m[1], en)} e prea mare — maximul este ${num(m[2], en)}`)],
  [/must be a positive number/, (_, en) => (en ? "sizes must be positive numbers" : "dimensiunile trebuie să fie numere pozitive")],
  [/overlap/i, (_, en) => (en ? "it would overlap another part of the sketch — try another side" : "s-ar suprapune cu altă parte a schiței — încearcă altă latură")],
  [/^Maximum (\d+) flights of steps/, (m, en) => (en ? `at most ${m[1]} flights of steps` : `cel mult ${m[1]} seturi de trepte`)],
  [/^Maximum (\d+) gates/, (m, en) => (en ? `at most ${m[1]} gates` : `cel mult ${m[1]} porți`)],
  [/^Maximum (\d+) segments/, (m, en) => (en ? `at most ${m[1]} fence segments` : `cel mult ${m[1]} segmente de gard`)],
  [/^Maximum (\d+) zones/, (m, en) => (en ? `at most ${m[1]} areas` : `cel mult ${m[1]} zone`)],
  [/^Maximum (\d+) openings/, (m, en) => (en ? `at most ${m[1]} doors and windows` : `cel mult ${m[1]} uși și ferestre`)],
  [/too short for this gate/, (_, en) => (en ? "that fence segment is too short for this gate" : "segmentul de gard e prea scurt pentru poarta asta")],
  [/door\(s\) of 0\.9 m don't fit/, (_, en) => (en ? "the doors don't fit in this wall" : "ușile nu încap în peretele ăsta")],
  [/No such opening/, (_, en) => (en ? "there's no such door, window or gate to change" : "nu am găsit ușa, fereastra sau poarta de modificat")],
  [/Can't remove the only (zone|segment)/, (m, en) => (en ? `the last ${m[1] === "zone" ? "area" : "segment"} can't be removed` : m[1] === "zone" ? "nu pot scoate singura zonă" : "nu pot scoate singurul segment")],
  [
    /only for (fences|decks|tiling)|only affect painting|Fences take gates|has no (zones|openings|height)|not valid for this project/,
    (_, en) => (en ? "that doesn't apply to this kind of project" : "asta nu se aplică la acest tip de proiect"),
  ],
];

export function explainEditError(message: string, lang: Lang): string {
  const en = lang === "en";
  for (const [re, say] of RULES) {
    const m = message.match(re);
    if (m) return say(m, en);
  }
  // Already written for customers (e.g. "Nu există o versiune anterioară a schiței.").
  if (!en && /[ăâîșț]/i.test(message)) return message.replace(/\.$/, "");
  return en ? message : "modificarea nu se poate face așa";
}
