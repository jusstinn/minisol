import type { ProjectType } from "./calculators";
import type { Lang } from "./types";

/**
 * For customers who don't know their measurements: typical sizes per project,
 * how to measure, and a pace-counting estimator. Each preset carries the exact
 * message to send, so choosing one simply starts the project (both the model
 * and the offline parser understand it). The sketch can be adjusted afterwards.
 */

export interface SizePreset {
  label: string;
  detail: string;
  /** What choosing it says in the chat. */
  message: string;
}

export interface SizeHelp {
  presets: SizePreset[];
  tips: string[];
  /** What the pace estimator asks for. */
  estimator: "rect" | "length" | "area";
  /** Noun used by the estimator's message ("Terasă", "Gard"…). */
  noun: string;
  /** What the calculator accepts, said up front ("până la 30 m pe latură"). */
  limit: string;
}

const LIMITS: Record<ProjectType, [string, string]> = {
  deck: ["până la 30 m pe latură (și poți adăuga forme în L)", "up to 30 m a side (L-shapes can be added)"],
  laminate_floor: ["până la 30 m pe latură", "up to 30 m a side"],
  lawn: ["până la 200 m pe latură", "up to 200 m a side"],
  paint_room: ["camere până la 20 × 20 m, înălțime 2–5 m", "rooms up to 20 × 20 m, 2–5 m high"],
  tiling: ["încăperi până la 20 × 20 m", "rooms up to 20 × 20 m"],
  fence: ["până la 500 m în total, cu colțuri și porți", "up to 500 m in total, with corners and gates"],
  drywall_partition: ["pereți până la 20 m lungime, 2–5 m înălțime", "walls up to 20 m long, 2–5 m high"],
};

/** An average adult pace. */
export const PACE_M = 0.75;

type Tpl = { label: [string, string]; detail: [string, string]; msg: [string, string] };

const PRESETS: Record<ProjectType, Tpl[]> = {
  deck: [
    { label: ["Mică · 3 × 2 m", "Small · 3 × 2 m"], detail: ["6 m² — o măsuță și două scaune", "6 m² — a bistro table for two"], msg: ["Terasă 3 × 2 m", "3 × 2 m deck"] },
    { label: ["Medie · 4 × 3 m", "Medium · 4 × 3 m"], detail: ["12 m² — masă pentru 6", "12 m² — dining for six"], msg: ["Terasă 4 × 3 m", "4 × 3 m deck"] },
    { label: ["Mare · 6 × 4 m", "Large · 6 × 4 m"], detail: ["24 m² — masă și șezlonguri", "24 m² — dining plus loungers"], msg: ["Terasă 6 × 4 m", "6 × 4 m deck"] },
  ],
  paint_room: [
    { label: ["Dormitor mic · 3 × 3 m", "Small bedroom · 3 × 3 m"], detail: ["~9 m², înălțime 2,6 m", "~9 m², 2.6 m high"], msg: ["Vopsesc o cameră de 3 × 3 m", "Paint a 3 × 3 m room"] },
    { label: ["Dormitor · 4 × 3,5 m", "Bedroom · 4 × 3.5 m"], detail: ["~14 m², înălțime 2,6 m", "~14 m², 2.6 m high"], msg: ["Vopsesc o cameră de 4 × 3,5 m", "Paint a 4 × 3.5 m room"] },
    { label: ["Living · 5 × 4 m", "Living room · 5 × 4 m"], detail: ["~20 m², înălțime 2,6 m", "~20 m², 2.6 m high"], msg: ["Vopsesc o cameră de 5 × 4 m", "Paint a 5 × 4 m room"] },
  ],
  laminate_floor: [
    { label: ["Dormitor mic · 3 × 3 m", "Small bedroom · 3 × 3 m"], detail: ["9 m²", "9 m²"], msg: ["Parchet laminat 3 × 3 m", "Laminate flooring 3 × 3 m"] },
    { label: ["Dormitor · 4 × 3,5 m", "Bedroom · 4 × 3.5 m"], detail: ["14 m²", "14 m²"], msg: ["Parchet laminat 4 × 3,5 m", "Laminate flooring 4 × 3.5 m"] },
    { label: ["Living · 5 × 4 m", "Living room · 5 × 4 m"], detail: ["20 m²", "20 m²"], msg: ["Parchet laminat 5 × 4 m", "Laminate flooring 5 × 4 m"] },
  ],
  tiling: [
    { label: ["Baie mică · 2 × 1,6 m", "Small bathroom · 2 × 1.6 m"], detail: ["cadă sau duș, faianță 2,1 m", "tub or shower, tiles to 2.1 m"], msg: ["Baie 2 × 1,6 m", "Bathroom 2 × 1.6 m"] },
    { label: ["Baie · 2,5 × 2 m", "Bathroom · 2.5 × 2 m"], detail: ["cea mai des întâlnită în apartamente", "the most common flat bathroom"], msg: ["Baie 2,5 × 2 m", "Bathroom 2.5 × 2 m"] },
    { label: ["Baie mare · 3 × 2,5 m", "Large bathroom · 3 × 2.5 m"], detail: ["casă, cadă + duș", "house, tub + shower"], msg: ["Baie 3 × 2,5 m", "Bathroom 3 × 2.5 m"] },
  ],
  fence: [
    { label: ["10 m · 1,2 m", "10 m · 1.2 m"], detail: ["o latură scurtă, gard de delimitare", "a short side, boundary fence"], msg: ["Gard de 10 m lungime, 1,2 m înălțime", "Fence 10 m long, 1.2 m high"] },
    { label: ["20 m · 1,8 m", "20 m · 1.8 m"], detail: ["fața unei curți obișnuite", "the front of a typical yard"], msg: ["Gard de 20 m lungime, 1,8 m înălțime", "Fence 20 m long, 1.8 m high"] },
    { label: ["40 m · 1,8 m", "40 m · 1.8 m"], detail: ["două laturi ale curții", "two sides of the yard"], msg: ["Gard de 40 m lungime, 1,8 m înălțime", "Fence 40 m long, 1.8 m high"] },
  ],
  drywall_partition: [
    { label: ["2,5 m · fără ușă", "2.5 m · no door"], detail: ["nișă sau separare de dressing", "alcove or walk-in closet"], msg: ["Perete de gips-carton de 2,5 m, 2,6 m înălțime", "Drywall partition 2.5 m long, 2.6 m high"] },
    { label: ["3,5 m · cu ușă", "3.5 m · with a door"], detail: ["împarte o cameră în două", "splits a room in two"], msg: ["Perete de gips-carton de 3,5 m, 2,6 m înălțime, cu o ușă", "Drywall partition 3.5 m long, 2.6 m high, one door"] },
    { label: ["4,5 m · cu ușă", "4.5 m · with a door"], detail: ["living → dormitor", "living room → bedroom"], msg: ["Perete de gips-carton de 4,5 m, 2,6 m înălțime, cu o ușă", "Drywall partition 4.5 m long, 2.6 m high, one door"] },
  ],
  lawn: [
    { label: ["40 m²", "40 m²"], detail: ["curtea din spate a unei case înșiruite", "a terraced-house back garden"], msg: ["Gazon nou pe 40 mp", "New lawn 40 sqm"] },
    { label: ["80 m²", "80 m²"], detail: ["grădina unei case obișnuite", "a typical house garden"], msg: ["Gazon nou pe 80 mp", "New lawn 80 sqm"] },
    { label: ["150 m²", "150 m²"], detail: ["grădină mare", "a large garden"], msg: ["Gazon nou pe 150 mp", "New lawn 150 sqm"] },
  ],
};

const NOUN: Record<ProjectType, [string, string]> = {
  deck: ["Terasă", "Deck"],
  paint_room: ["Vopsesc o cameră de", "Paint a room of"],
  laminate_floor: ["Parchet laminat", "Laminate flooring"],
  tiling: ["Baie", "Bathroom"],
  fence: ["Gard de", "Fence"],
  drywall_partition: ["Perete de gips-carton de", "Drywall partition"],
  lawn: ["Gazon nou pe", "New lawn"],
};

const TIPS: Record<"rect" | "length" | "area", [string, string][]> = {
  rect: [
    ["Măsoară lungimea și lățimea la nivelul podelei, de la perete la perete (sau de la margine la margine).", "Measure length and width at floor level, wall to wall (or edge to edge)."],
    ["Rotunjește în sus la 10 cm — calculul adaugă deja pierderile la tăiere.", "Round up to the nearest 10 cm — the calculation already adds cutting waste."],
    ["Formă în L? Măsoară fiecare dreptunghi separat; al doilea îl adaugi apoi din schiță.", "L-shaped? Measure each rectangle separately; add the second one in the sketch afterwards."],
    ["Fără ruletă: numără pașii (un pas ≈ 75 cm) sau plăcile existente de pe jos (30 sau 60 cm).", "No tape? Count your paces (one pace ≈ 75 cm) or the existing floor tiles (30 or 60 cm)."],
  ],
  length: [
    ["Mergi de-a lungul liniei gardului/peretelui și numără pașii (un pas ≈ 75 cm).", "Walk along the fence/wall line and count your paces (one pace ≈ 75 cm)."],
    ["Colțuri? Măsoară fiecare latură; colțurile le adaugi apoi din schiță.", "Corners? Measure each side; add the corners in the sketch afterwards."],
    ["Porțile se adaugă separat — nu le scădea din lungime.", "Gates are added separately — don't subtract them from the length."],
  ],
  area: [
    ["Numără pașii pe lungime și pe lățime (un pas ≈ 75 cm) și înmulțește.", "Pace out the length and the width (one pace ≈ 75 cm) and multiply."],
    ["Scade doar zonele mari fără gazon (alei, terase).", "Only subtract large areas without grass (paths, patios)."],
  ],
};

export function sizeHelp(type: ProjectType, lang: Lang): SizeHelp {
  const i = lang === "en" ? 1 : 0;
  const estimator = type === "fence" || type === "drywall_partition" ? "length" : type === "lawn" ? "area" : "rect";
  return {
    presets: PRESETS[type].map((p) => ({ label: p.label[i], detail: p.detail[i], message: p.msg[i] })),
    tips: TIPS[estimator].map((t) => t[i]),
    estimator,
    noun: NOUN[type][i],
    limit: LIMITS[type][i],
  };
}

/** The chat message for an estimate: "Terasă 4,5 × 3 m", "Gard de 18 m", "Gazon nou pe 60 mp". */
export function estimateMessage(type: ProjectType, lang: Lang, a: number, b?: number): string {
  const en = lang === "en";
  const f = (v: number) => v.toLocaleString(en ? "en-GB" : "ro-RO", { maximumFractionDigits: 1 });
  const noun = NOUN[type][en ? 1 : 0];
  switch (type) {
    case "fence":
      return en ? `Fence ${f(a)} m long, 1.8 m high` : `Gard de ${f(a)} m lungime, 1,8 m înălțime`;
    case "drywall_partition":
      return en ? `Drywall partition ${f(a)} m long, 2.6 m high` : `Perete de gips-carton de ${f(a)} m, 2,6 m înălțime`;
    case "lawn":
      return en ? `New lawn ${Math.round(a * (b ?? 1))} sqm` : `Gazon nou pe ${Math.round(a * (b ?? 1))} mp`;
    case "deck":
      return en ? `${f(a)} × ${f(b ?? a)} m deck` : `${noun} ${f(a)} × ${f(b ?? a)} m`;
    default:
      return `${noun} ${f(a)} × ${f(b ?? a)} m`;
  }
}
