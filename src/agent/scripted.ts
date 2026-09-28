import type { DataSources } from "@/adapters/types";
import type { Tenant } from "@/config/tenant";
import type { ProjectType } from "@/domain/calculators";
import type { Quote } from "@/domain/quote";
import { fold } from "@/domain/search";
import type { Customer, Lang, MaterialRole, QualityTier } from "@/domain/types";
import { MATERIAL_ROLES } from "@/domain/types";
import { isOutdoor, lowerFirst } from "@/domain/items";
import type { ItemKind } from "@/domain/items";
import type { SketchOp, Side } from "@/domain/layout";
import { explainEditError } from "@/lib/editErrors";
import { dec, km, lei, int } from "@/lib/format";
import { scriptedPlan } from "./scripted-plans";
import { TOOL_STATUS, executeTool, priceBasket } from "./tools";
import type { ToolContext } from "./tools";
import type { AgentEvent, Card, SessionState, UiCommand } from "./types";
import { verifyReply } from "./verify";

/**
 * Offline demo agent: no LLM. Parses the request with rules, runs the SAME tools
 * as the live agent (so every number is real), uses hand-written plans and writes
 * the reply from the quote. Used when the model is unavailable/rate-limited, for
 * key-less deployments, and for bullet-proof pitch demos.
 */

type Intent =
  | { kind: "project"; type: ProjectType; params: Record<string, unknown>; quality?: QualityTier; missing?: string }
  | { kind: "sketch"; edits: (Partial<SketchOp> | { op: "undo" })[] }
  | { kind: "view"; command: UiCommand }
  | { kind: "sizes"; type?: ProjectType }
  | { kind: "choose"; text: string; view?: UiCommand }
  | { kind: "remove"; text: string; view?: UiCommand }
  | { kind: "move"; text: string }
  | { kind: "requality"; quality: QualityTier }
  | { kind: "offers" }
  | { kind: "stock" }
  /** `text`: "adaugă uleiul" adds only the suggestions it names. */
  | { kind: "add_suggestions"; text?: string }
  | { kind: "unsafe"; topic: "electrical" | "gas" | "structural" | "roof" | "asbestos" }
  | { kind: "unknown" };

const UNSAFE: [Extract<Intent, { kind: "unsafe" }>["topic"], RegExp][] = [
  ["electrical", /\b(priz\w*|circuit\w*|tablou electric|siguran\w* automat\w*|cablaj\w*|socket\w*|wiring|rewire|fuse ?box|consumer unit)\b/],
  ["gas", /\b(gaz|centrala pe gaz|gas|boiler pe gaz|gas boiler)\b/],
  ["structural", /\b(perete portant|zid portant|daram\w* (un )?perete|load[- ]bearing|structural|knock (down|through) (a )?wall)\b/],
  ["roof", /\b(acoperis\w*|roof\w*)\b/],
  ["asbestos", /\b(azbest|asbestos)\b/],
];

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const num = (s: string) => Number(s.replace(",", "."));
const UNIT_M = String.raw`(?:m|metri|metre|metres|meters)`;
const HEIGHT_WORD = String.raw`(?:inaltim\w*|inalt\w*|height|high|tall)`;
const LENGTH_WORD = String.raw`(?:lungime\w*|lung|lunga|lungi|long|length)`;
const WIDTH_WORD = String.raw`(?:latime\w*|lat|lata|late|wide|width)`;
/** "ridic-o", "ridică terasa", "înalț-o", "raise it", "la 50 cm de la sol". */
const RAISE = /\b(ridic\w*|inalt\w*|rais\w*|high|above ground|de la sol|deasupra)\b/;

interface Span {
  at: number;
  end: number;
}
interface Found {
  value: number;
  /** Index of the number in the text. */
  at: number;
}

/** "4 x 3", "4,5 m pe 3", "4 metri pe 3 metri", "400 x 300 cm" → metres. */
export function findDims(t: string): (Span & { a: number; b: number }) | null {
  const m = t.match(new RegExp(`${NUM}\\s*(cm|${UNIT_M})?\\s*(?:x|×|\\*|pe|by)\\s*${NUM}(\\s*cm\\b)?`));
  if (!m || m.index === undefined) return null;
  const k = m[2] === "cm" || m[4] ? 100 : 1;
  return { a: num(m[1]) / k, b: num(m[3]) / k, at: m.index, end: m.index + m[0].length };
}

/**
 * A number tagged by a word, after it ("1,8 m înălțime", "20 m long") or before it ("înălțime 2,6",
 * "lung de 30 m"); cm become metres. Numbers inside `skip` (the "4 x 3" dims) are not candidates, and
 * the tag must be adjacent: in "2,7 m high, 2 doors" the height is 2,7, not 2.
 */
function tagged(t: string, word: string, skip?: Span | null): Found | null {
  const inSkip = (i: number) => !!skip && i >= skip.at && i < skip.end;
  for (const m of t.matchAll(new RegExp(`${NUM}\\s*(?:de\\s+)?(cm|${UNIT_M})?\\s*${word}\\b`, "g"))) {
    if (!inSkip(m.index)) return { value: num(m[1]) / (m[2] === "cm" ? 100 : 1), at: m.index };
  }
  const m = t.match(new RegExp(`\\b${word}\\s*(?:de|of|:|=)?\\s*${NUM}(\\s*cm\\b)?`));
  if (m && m.index !== undefined) return { value: num(m[1]) / (m[2] ? 100 : 1), at: m.index + m[0].search(/\d/) };
  return null;
}

/** Every "N m" / "N metri" / "N de metri" (not mm or mp), in order. */
function metresIn(t: string): Found[] {
  return [...t.matchAll(new RegExp(`${NUM}\\s*(?:de\\s+)?${UNIT_M}\\b`, "g"))].map((m) => ({ value: num(m[1]), at: m.index }));
}

const PROJECT_KEYWORDS: [ProjectType, RegExp][] = [
  ["tiling", /\b(baie|baia|bathroom|gresie|faianta|(re)?til(e|es|ed|ing)|placare)\b/],
  ["fence", /\b(gard|gardul|fence|fencing)\b/],
  // Before the deck: "terasă din pavele" is paving. A "patio" is paved unless timber is named; a
  // "driveway gate" is a fence gate.
  [
    "paving",
    /\b(pavel\w*|pavea|pavaj\w*|pavat\w*|pavers?|paving|paved|dal[ae]|dalele|alee|aleea|alei|aleile|paths?|pathway|walkway|driveway(?!\s+gates?)|parcare)\b|^(?!.*\b(deck\w*|wood\w*|timber|lemn\w*|wpc|scandur\w*)\b).*\bpatio\b/,
  ],
  ["deck", /\b(terasa|terasă|deck|decking|terrace|patio)\b/],
  ["laminate_floor", /\b(parchet|laminat|laminate|flooring|floors?|pardosea\w*)\b/],
  ["drywall_partition", /\b(gips|rigips|gipscarton|drywall|plasterboard|partition|despart\w*)\b/],
  ["lawn", /\b(gazon|gazonul|lawn|iarba|grass|turf)\b/],
  ["paint_room", /\b(vops\w*|zugrav\w*|paint\w*|repaint)\b/],
];

/** Words that never identify a product/store in "remove X" / "choose X" / "move to X" / "add X". */
const STOP_WORDS = new Set(
  "scoate scot elimina sterge remove drop fara vreau nu mai din lista cos coșul alege schimba schimb foloseste inlocuieste loc instead switch use choose prefer prefera varianta variant option optiunea the and with pentru mea meu mele muta move mut lista magazin magazinul store la in pe de cu un una doua sau adauga adaug add also too si".split(" "),
);

/** Content words of a request, lightly stemmed for Romanian articles/plurals: "geotextilul" → "geotextil", "grinzile" → "grinz". */
function contentWords(text: string, { numbers = false } = {}): string[] {
  const stem = (w: string) => (w.length >= 6 ? w.replace(/(urile|ului|elor|ilor|ele|ile|ul|ii|le|a|e|i)$/, "") : w);
  return text
    .split(/[^a-z0-9]+/)
    .filter((w) => (w.length >= 3 || (numbers && /^\d+$/.test(w))) && !STOP_WORDS.has(w))
    .map(stem);
}

const SIDE_WORDS: [Side, RegExp][] = [
  ["s", /\b(in fata|din fata|la fata|fata casei|front|sud|south)\b/],
  ["n", /\b(in spate|din spate|spate|back|nord|north)\b/],
  ["w", /\b(stanga|left|vest|west)\b/],
  ["e", /\b(dreapta|right|est|east)\b/],
];
const sideIn = (t: string) => SIDE_WORDS.find(([, re]) => re.test(t))?.[0];
const WORD_NUM: Record<string, number> = { o: 1, un: 1, una: 1, one: 1, a: 1, doua: 2, doi: 2, two: 2, trei: 3, three: 3, patru: 4, four: 4 };
const RESIZE = /\b(fa|make|mareste|micsoreaza|bigger|smaller|mai mare|mai mica|mai mic|de fapt|actually|resize|schimba|instead)\b/;

/**
 * Sketch edits in plain words ("add 2 steps at the front", "fă-o în L cu 2×2 m în dreapta",
 * "o poartă de mașină", "faianță doar până la 1,2 m"). Returns null if it isn't an edit.
 */
/** Things that can be placed in the sketch, as customers say them (folded text). Order matters: specific first. */
const ITEM_PHRASES: [ItemKind, RegExp][] = [
  ["towel_radiator", /\b(port-?prosop|towel radiator)\b/],
  ["washing_machine", /\b(masina de spalat|washing machine)\b/],
  ["garden_light", /\b(lamp\w* de gradina|lumin\w* de gradina|garden lights?|felinar\w*|stalpisor\w*)\b/],
  ["ceiling_lamp", /\b(plafonier\w*|lustr\w*|ceiling lights?|lamp\w* (pe|din) tavan)\b/],
  ["wall_lamp", /\b(aplic\w*|wall lights?|lamp\w* pe perete)\b/],
  ["floor_lamp", /\b(lampadar\w*|floor lamps?)\b/],
  ["toilet", /\b(toalet\w*|vas(ul)? wc|wc|closet\w*|toilets?)\b/],
  ["sink", /\b(lavoar\w*|chiuvet\w*|sinks?|washbasins?)\b/],
  ["shower", /\b(dus(ul)?|cabin\w* de dus|showers?)\b/],
  ["bathtub", /\b(cada|cad[ae]|cadita|bathtubs?|tub)\b/],
  ["mirror", /\b(oglind\w*|mirrors?)\b/],
  ["planter", /\b(jardinier\w*|planters?)\b/],
  ["bbq", /\b(gratar\w*|bbq|barbecue|grill)\b/],
  ["lounger", /\b(sezlong\w*|loungers?)\b/],
  ["parasol", /\b(umbrel\w*|parasols?)\b/],
  ["table", /\b(mas[ae]|masuta|tables?)\b/],
  ["chair", /\b(scaun\w*|chairs?)\b/],
  ["sofa", /\b(canapea|canapeaua|sofa|couch)\b/],
  ["bed", /\b(pat(ul)?|beds?)\b/],
  ["wardrobe", /\b(dulap\w*|wardrobes?)\b/],
  ["tv", /\b(televizor\w*|tv)\b/],
  ["radiator", /\b(calorifer\w*|radiators?)\b/],
  ["plant", /\b(plant[ae]|plante|ghiveci|plants?)\b/],
];
const GENERIC_LAMP = /\b(lamp[ai]|lampa|lampi|becuri|bec|corp de iluminat|lumin[ai]|lights?|lamps?)\b/;

/** Where, in one clause: next to something, a corner, a wall/side (or nothing = the middle). */
function placementIn(t: string, self?: ItemKind): Pick<SketchOp, "near" | "corner" | "wall"> {
  const nearM = t.match(/\b(langa|linga|sub|deasupra|next to|by|near|beside|under|above|la)\s+(?:the\s+)?(usa|usii|intrare|fereastra|ferestrei|geam|poarta|portii|trepte|treptele|scari|door|window|gate|steps|entrance)\b/);
  let near: string | null = nearM ? (/usa|usii|intrare|door|entrance/.test(nearM[2]) ? "door" : /fereastr|geam|window/.test(nearM[2]) ? "window" : /poart|gate/.test(nearM[2]) ? "gate" : "steps") : null;
  if (!near) {
    const nextTo = t.match(/\b(langa|linga|deasupra|next to|beside|above)\s+(?:the\s+)?(\w+)/);
    const anchor = nextTo && ITEM_PHRASES.find(([, re]) => re.test(nextTo[2]))?.[0];
    if (anchor && anchor !== self) near = anchor;
  }
  const side = sideIn(t);
  const corner = /\b(colt\w*|corner)\b/.test(t) ? (((/\b(fata|front)\b/.test(t) ? "s" : "n") + (/\b(stanga|left)\b/.test(t) ? "w" : "e")) as "ne" | "nw" | "se" | "sw") : null;
  return { near, corner, wall: !near && !corner && side ? side : null };
}

function kindsIn(t: string): ItemKind[] {
  const kinds: ItemKind[] = [];
  let rest = t;
  for (const [kind, re] of ITEM_PHRASES) {
    const m = rest.match(re);
    if (m) {
      kinds.push(kind);
      rest = rest.replace(m[0], " ");
    }
  }
  return kinds;
}

/** "Pune o toaletă lângă ușă și un lavoar pe peretele din stânga", "mută lavoarul sub fereastră", "scoate cada". */
function parseItems(t: string, type: ProjectType): Partial<SketchOp>[] | null {
  const outdoor = isOutdoor(type);
  const remove = /\b(scoate\w*|elimina\w*|sterge\w*|remove|delete|fara|nu mai vreau)\b/.test(t);
  const rotate = /\b(roteste|intoarce|rotate|turn)\b/.test(t);
  const move = /\b(muta\w*|mut|move)\b/.test(t);
  const add = /\b(pune|puneti|adauga\w*|vreau|monteaza|instaleaza|as vrea|put|add|place|install|want|i'?d like)\b/.test(t);
  if (!remove && !rotate && !move && !add) return null;
  // Each clause ("… și …", "…, …") carries its own placement.
  const clauses = t.split(/\s*(?:,|;|\bsi\b|\band\b|\bplus\b)\s*/).filter(Boolean);
  const placed: { kind: ItemKind; where: Pick<SketchOp, "near" | "corner" | "wall"> }[] = [];
  for (const c of clauses) {
    // The thing after "lângă / deasupra / sub" is where it goes, not something to add.
    let kinds = kindsIn(c.replace(/\b(langa|linga|deasupra|sub|next to|beside|above|under|near|by)\s+(?:the\s+)?\S+/g, " "));
    if (!kinds.length && GENERIC_LAMP.test(c)) kinds = [outdoor ? "garden_light" : /\b(perete\w*|wall)\b/.test(c) ? "wall_lamp" : "ceiling_lamp"];
    const where = placementIn(c, kinds[0]);
    if (!kinds.length) {
      // "… și pe peretele din stânga" — a placement for the item before it.
      const last = placed.at(-1);
      if (last && !last.where.near && !last.where.corner && !last.where.wall) last.where = where;
      continue;
    }
    kinds.forEach((k, i) => placed.push({ kind: k, where: i === 0 ? where : { near: null, corner: null, wall: null } }));
  }
  if (!placed.length) return null;
  if (remove) return placed.map((p) => ({ op: "remove_item", item: p.kind }));
  if (rotate) return placed.map((p) => ({ op: "rotate_item", item: p.kind }));
  if (move) return [{ op: "move_item", item: placed[0].kind, ...placed[0].where }];
  return placed.map((p) => ({ op: "add_item", item: p.kind, ...p.where }));
}

export function parseSketchEdit(t: string, type: ProjectType): Partial<SketchOp>[] | null {
  // Placed items first, so "lângă ușă" doesn't read as "add a door".
  const items = parseItems(t, type);
  if (items) return items;
  const dims = findDims(t);
  const side = sideIn(t);
  const removing = /\b(fara|scoate\w*|elimina\w*|sterge\w*|remove|delete|without|no more)\b/.test(t);
  const cm = t.match(new RegExp(`${NUM}\\s*cm\\b`));
  const metres = metresIn(t)[0];
  /** "50 cm" or "0,5 m" as metres. */
  const size = cm ? num(cm[1]) / 100 : metres?.value;
  const countWord = (re: RegExp) => {
    const m = t.match(re);
    return m ? (/^\d+$/.test(m[1]) ? Number(m[1]) : WORD_NUM[m[1]]) : undefined;
  };
  const edits: Partial<SketchOp>[] = [];

  if (type === "deck") {
    const steps = /\b(trept\w*|treapt\w*|scari|scara|scarile|steps?|stairs?)\b/.test(t);
    // "ridic-o la 50 cm" — but "3 trepte de 17 cm" is about the steps, not the deck.
    if (RAISE.test(t) && size !== undefined && !(steps && !/\b(ridic\w*|rais\w*)\b/.test(t))) edits.push({ op: "set_height", value: size });
    if (steps) {
      if (removing) edits.push({ op: "remove_steps" });
      else edits.push({ op: "add_steps", zone: "A", side: side ?? "s", count: countWord(/\b(\d+|o|una|doua|trei|patru|one|two|three|four)\s+(?:trept\w*|treapt\w*|steps?|stairs?)\b/) ?? null });
    }
    const base = /\b(pe|on)\s+(beton|placa|concrete|slab)\b/.test(t) ? "concrete_slab" : /\b(pe|on)\s+(pietris|gravel)\b/.test(t) ? "gravel" : /\b(pe|on)\s+(pamant|soil|earth)\b/.test(t) ? "soil" : undefined;
    if (base) edits.push({ op: "set_option", key: "base", value: base });
  }
  if (type === "paving") {
    // "fă-o pentru mașini", "make it a driveway", "fără borduri", "borduri pe margini".
    const use = /\b(driveway|masin\w*|auto|parcare|cars?|vehicul\w*)\b/.test(t)
      ? "driveway"
      : /\b(alee|aleea|path|footpath|walkway|pietonal\w*|pedestrian)\b/.test(t)
        ? "path"
        : /\b(patio|terasa|curte|curtea|yard)\b/.test(t)
          ? "patio"
          : undefined;
    if (use && (RESIZE.test(t) || /\b(pentru|for|ca|as a|into a)\b/.test(t))) edits.push({ op: "set_option", key: "use", value: use });
    if (/\b(bordur\w*|edging|edges?|kerbs?|curbs?)\b/.test(t)) {
      edits.push({ op: "set_option", key: "edging", value: !(removing || /\b(no|nu)\s+(edging|kerbs?|curbs?|bordur\w*)\b/.test(t)) });
    }
  }
  if (type === "deck" || type === "laminate_floor" || type === "lawn" || type === "paving") {
    const addZone =
      /\b(in l|forma de l|l[- ]shape\w*|extinde\w*|extensie|extension|extend|aripa|wing|another (area|section))\b/.test(t) ||
      (/\b(zon\w*|area|section)\b/.test(t) && /\b(adaug\w*|add|inca|noua|alta)\b/.test(t));
    if (addZone && dims) {
      edits.push({ op: "add_zone", zone: "A", side: side ?? "e", w: dims.a, d: dims.b, align: "end" });
    } else if (dims && RESIZE.test(t)) {
      edits.push({ op: "resize", zone: "A", w: dims.a, d: dims.b });
    }
  }
  // "fă-o de 8 m lungime", "lată de 2 m", "make it 8 m long": one side changes, the other stays.
  const oneSide = type === "deck" || type === "laminate_floor" || type === "lawn" || type === "paving" || type === "paint_room" || type === "tiling";
  if (oneSide && !dims && !edits.length && !/\b(zon\w*|area|section|aripa|wing|extinde\w*|extend|trept\w*|steps?)\b/.test(t)) {
    const len = tagged(t, LENGTH_WORD)?.value;
    const wid = tagged(t, WIDTH_WORD)?.value;
    if (len || wid) {
      const zoned = type !== "paint_room" && type !== "tiling";
      edits.push({ op: "resize", ...(zoned ? { zone: "A" } : {}), ...(len ? { w: len } : {}), ...(wid ? { d: wid } : {}) });
    }
  }
  if (type === "laminate_floor" && /\b(diagonal\w*)\b/.test(t)) edits.push({ op: "set_option", key: "pattern", value: removing || /\b(drept|straight)\b/.test(t) ? "straight" : "diagonal" });
  if (type === "paint_room" || type === "tiling") {
    const h = type === "paint_room" ? tagged(t, HEIGHT_WORD, dims)?.value : undefined;
    if (dims && RESIZE.test(t)) edits.push({ op: "resize", w: dims.a, d: dims.b, ...(h ? { h } : {}) });
  }
  if (type === "paint_room" && /\b(tavan\w*|ceiling)\b/.test(t)) edits.push({ op: "set_option", key: "ceiling", value: !/\b(fara|without|no|nu|scoate\w*|exclude\w*)\b/.test(t) });
  if ((type === "paint_room" || type === "drywall_partition") && new RegExp(`\\b${HEIGHT_WORD}`).test(t) && size !== undefined && !dims) {
    edits.push({ op: "set_height", value: size });
  }
  if (type === "drywall_partition" && !edits.length && (dims || metres) && (RESIZE.test(t) || new RegExp(`\\b${LENGTH_WORD}\\b`).test(t))) {
    edits.push(dims ? { op: "resize", w: dims.a, h: dims.b } : { op: "resize", w: metres!.value });
  }
  if (type === "fence") {
    if (/\b(poarta|portita|gate)\b/.test(t)) {
      if (removing) edits.push({ op: "remove_opening", kind: "gate" });
      else {
        const wide = /\b(dubla|auto|masina|masini|driveway|double|car)\b/.test(t) || /\b3\s*m\b/.test(t);
        const pos = /\b(inceput\w*|start|capat\w*)\b/.test(t) ? 0.15 : /\b(sfarsit\w*|end)\b/.test(t) ? 0.85 : 0.5;
        edits.push({ op: "add_opening", kind: "gate", segment: 0, width: wide ? 3 : 1, pos });
      }
    }
    if (/\b(colt|corner|coteste|cotit\w*|turns?|intoarce\w*|pe latura|along the side)\b/.test(t) && metres) {
      edits.push({ op: "add_fence_segment", length: metres.value, turn: side === "w" ? "left" : "right" });
    }
    const high = new RegExp(`\\b${HEIGHT_WORD}`).test(t);
    if (high && size !== undefined && !edits.length) edits.push({ op: "set_height", value: size });
    // "fă-l de 30 m" / "de fapt are 25 m" → the whole fence's length.
    if (!high && metres && !edits.length && (RESIZE.test(t) || new RegExp(`\\b${LENGTH_WORD}\\b`).test(t))) edits.push({ op: "resize", w: metres.value });
  }
  if (type === "paint_room" || type === "tiling" || type === "drywall_partition" || type === "laminate_floor") {
    if (/\b(usa|usi|door|doors)\b/.test(t)) edits.push(removing ? { op: "remove_opening", kind: "door" } : { op: "add_opening", kind: "door", wall: side ?? null });
    if (type === "paint_room" && /\b(fereastra|ferestre|geam|window|windows)\b/.test(t))
      edits.push(removing ? { op: "remove_opening", kind: "window" } : { op: "add_opening", kind: "window", wall: side ?? null });
  }
  if (type === "tiling" && /\b(faianta|wall tiles?|pe pereti|on the walls?)\b/.test(t)) {
    const h = size ?? (removing ? 0 : undefined);
    if (h !== undefined) edits.push({ op: "set_wall_tiles", wall: side ?? "all", value: h });
  }
  if (type === "tiling" && /\b(gresie|floor tiles?)\b/.test(t) && /\b(fara|without|no|nu|scoate\w*)\b/.test(t)) edits.push({ op: "set_option", key: "floor", value: false });
  // New dimensions without "make it…" are a new request ("Vreau o terasă de 5 x 4 pe beton"), not a settings tweak.
  const kept = dims && !edits.some((e) => e.op === "resize" || e.op === "add_zone") ? edits.filter((e) => e.op !== "set_option") : edits;
  return kept.length ? kept : null;
}

/** Words for materials the customer may ask to see ("show me the joists"). */
const MATERIAL_WORDS: [MaterialRole, RegExp][] = [
  ["deck_joist", /\b(grinz\w*|grinda|joists?)\b/],
  ["deck_support", /\b(suport\w*|plot\w*|pedestal\w*|supports?)\b/],
  ["deck_board", /\b(scandur\w*|deck(-ul)?|boards?|decking)\b/],
  ["weed_membrane", /\b(geotextil\w*|membran\w*|membrane)\b/],
  ["fence_post", /\b(stalp\w*|posts?)\b/],
  ["fence_panel", /\b(panou\w*|panels?)\b/],
  ["fence_gate", /\b(poart\w*|gates?)\b/],
  ["kerb_concrete", /\b(beton\w* (de|pentru|la|de la|sub) bordur\w*|kerb concrete)\b/],
  ["post_concrete", /\b(fundati\w*|beton\w*|footings?|concrete)\b/],
  ["wall_tiles", /\b(faiant\w*|wall tiles?)\b/],
  ["floor_tiles", /\b(gresi\w*|floor tiles?)\b/],
  ["waterproofing", /\b(hidroizol\w*|waterproof\w*)\b/],
  ["interior_paint", /\b(vopse\w*|paint)\b/],
  ["laminate", /\b(parchet\w*|laminate)\b/],
  ["underlay", /\b(folie|underlay)\b/],
  ["skirting_board", /\b(plint\w*|skirting)\b/],
  ["joint_sand", /\b(nisip\w* (de|pentru) rost\w*|rosturi\w*|joint(ing)? sand|polymeric sand)\b/],
  ["paving_sand", /\b(nisip\w*|sand)\b/],
  ["paving_base", /\b(piatr\w* spart\w*|piatra|split|balast\w*|crushed stone|stone base|sub-?base|hardcore)\b/],
  ["paving_edging", /\b(bordur\w*|edging|kerbs?|curbs?)\b/],
  ["pavers", /\b(pavel\w*|pavaj\w*|pavers?|paving|dal[ae]|dalele)\b/],
  ["cw_profile", /\b(montant\w*|profile\w*|studs?)\b/],
  ["drywall_board", /\b(gips\w*|placi|plasterboard)\b/],
  ["mineral_wool", /\b(vata|wool|izolati\w*)\b/],
  ["topsoil", /\b(pamant\w*|topsoil|soil)\b/],
];

/** "Show me the joists", "exploded view", "open the cart", "pay with points" → a screen command. */
export function parseView(t: string): UiCommand | null {
  const show = /\b(arat\w*|show|evidentiaz\w*|highlight|unde (e|sunt|se vad)|where (is|are)|vreau sa vad|let me see|see|vezi|deschide|open)\b/.test(t);
  const c: UiCommand = {};
  if (/\b(explodat\w*|exploded|pe straturi|layers?)\b/.test(t)) c.view = "exploded";
  else if (/\b(vedere reala|realist\w*|real view|realistic|in culori)\b/.test(t)) c.view = "real";
  else if (/\b(blueprint|vedere plan|vedere tehnica)\b/.test(t)) c.view = "blueprint";
  if (/\b(editor\w*|de mana|manual|by hand|myself)\b/.test(t) && /\b(modific\w*|edit\w*|deschide|open|schimb\w*)\b/.test(t)) c.editor = true;
  if (show && /\b(cos\w*|cart|basket)\b/.test(t)) c.panel = "cart";
  if (/\b(wallet|portofel)\b/.test(t) && /\b(trimite|send|pune|put|arat\w*|show|deschide|open)\b/.test(t)) c.panel = "wallet";
  if (show && /\b(planul de lucru|pasii|work plan|the plan|planul)\b/.test(t) && !c.editor) c.panel = "plan";
  if (/\b(cu (toate )?punctele|cu puncte|with (my )?points|use (my )?points|foloseste punctele)\b/.test(t)) c.redeemPoints = !/\b(fara|without|nu)\b/.test(t);
  if (show) {
    const role = MATERIAL_WORDS.find(([, re]) => re.test(t))?.[0];
    if (role) c.highlight = role;
  }
  return Object.keys(c).length ? c : null;
}

/**
 * "Da" / "yes please" answering the question that ended the previous reply: "…vrei să adaug și X?" adds the
 * suggestions, "…la **Berceni** (9,9 km) e tot — mut lista acolo?" moves the list. Whichever was asked last wins.
 */
export function answerToQuestion(raw: string, history: unknown[] | undefined): Intent | null {
  const t = fold(raw).trim();
  if (t.length > 40 || !/^(da|yes|yep|yeah|sure|ok|okay|sigur|desigur|bine|hai|go ahead|do it|please)\b/.test(t) || /\b(nu|no|not)\b/.test(t)) return null;
  const last = [...(history ?? [])]
    .reverse()
    .find((m): m is { role: string; content: string } => !!m && typeof m === "object" && (m as { role?: unknown }).role === "assistant" && typeof (m as { content?: unknown }).content === "string");
  if (!last) return null;
  const c = fold(last.content);
  const add = Math.max(c.lastIndexOf("vrei sa adaug"), c.lastIndexOf("want me to add"), c.lastIndexOf("le adaug"));
  const move = last.content.match(/\*\*([^*]+)\*\*\s*\([^)]*\)\s*(?:e tot|has everything)/);
  const moveAt = Math.max(c.lastIndexOf("mut lista acolo"), c.lastIndexOf("move your list there"));
  if (add >= 0 && add > moveAt) return { kind: "add_suggestions" };
  if (move && moveAt >= 0) return { kind: "move", text: fold(move[1]) };
  return null;
}

/** The project type mentioned in the latest earlier user message, if any. */
function projectTypeFromHistory(history: unknown[] | undefined): ProjectType | undefined {
  for (const it of [...(history ?? [])].reverse()) {
    const m = it as { role?: string; content?: unknown } | null;
    if (!m || typeof m !== "object" || m.role !== "user" || typeof m.content !== "string") continue;
    const t = fold(m.content);
    const found = PROJECT_KEYWORDS.find(([, re]) => re.test(t))?.[0];
    if (found) return found;
  }
  return undefined;
}

export function parseIntent(raw: string, state: SessionState): Intent {
  const t = fold(raw);
  const quality: QualityTier | undefined = /\b(ieftin\w*|cheap\w*|budget|economic\w*)\b/.test(t)
    ? "budget"
    : /\b(premium|durabil\w*|best|cel mai bun|top|calitate)\b/.test(t)
      ? "premium"
      : undefined;
  const unsafe = UNSAFE.find(([, re]) => re.test(t));
  if (unsafe) return { kind: "unsafe", topic: unsafe[0] };
  let type = PROJECT_KEYWORDS.find(([, re]) => re.test(t))?.[0];
  // A paved patio is a "terasă" too: on a paving project the word means that project, unless timber is named.
  if (type === "deck" && state.project?.type === "paving" && !/\b(deck\w*|lemn\w*|wood\w*|timber|wpc|scandur\w*|larice|larch)\b/.test(t)) type = "paving";
  // "I don't know the size" → typical sizes + pace estimator (type may come from an earlier message).
  if (/\b(nu stiu|nu cunosc|habar n-am|n-am masurat|nu am masurat|don'?t know|do not know|not sure|no idea)\b/.test(t) && !/\d/.test(t)) {
    return { kind: "sizes", type: type ?? state.project?.type };
  }

  const sameProject = state.project && (!type || type === state.project.type || /\b(arat\w*|show|evidentiaz\w*|highlight|scoate\w*|remove|alege\w*|choose)\b/.test(t));
  if (state.project && sameProject) {
    if (/\b(anuleaz\w*|undo|revino|varianta anterioara|previous version|inapoi la)\b/.test(t)) return { kind: "sketch", edits: [{ op: "undo" }] };
    const view = parseView(t);
    // "Alege WPC și arată-mi-o în vedere reală": do the change, then show it.
    if (view && /\b(alege\w*|schimba\w*|foloseste|inlocuieste|switch|choose|use)\b/.test(t)) return { kind: "choose", text: t, view: { ...view, highlight: undefined } };
    if (view && /\b(scoate\w*|elimina\w*|sterge\w*|remove|drop)\b/.test(t)) return { kind: "remove", text: t, view: { ...view, highlight: undefined } };
    if (view) return { kind: "view", command: view };
  }
  // Reshaping the current project ("add steps", "a gate in the middle") is an edit, not a new project.
  if (state.project && (!type || type === state.project.type)) {
    const edits = parseSketchEdit(t, state.project.type);
    if (edits) return { kind: "sketch", edits };
  }

  if (state.project && (!type || sameProject)) {
    if (quality) return { kind: "requality", quality };
    if (/\b(ofert\w*|offer\w*|reducer\w*|discount\w*|cupon\w*)\b/.test(t)) return { kind: "offers" };
    if (/\b(muta\w*|move|transfer\w*|schimba magazinul|other store|alt magazin)\b/.test(t)) return { kind: "move", text: t };
    if (/\b(stoc\w*|stock|unde|where|magazin\w*|store\w*)\b/.test(t)) return { kind: "stock" };
    if (/\b(sugest\w*|suggest\w*|extra\w*)\b/.test(t) || /^\s*(adauga|add)[\s-]*(le|them|tot|all)?(\s+pe toate)?\s*[.!]?\s*$/.test(t)) return { kind: "add_suggestions" };
    if (/\b(scoate\w*|elimina\w*|sterge\w*|remove|drop|nu mai vreau|fara)\b/.test(t)) return { kind: "remove", text: t };
    if (/\b(alege\w*|schimba\w*|foloseste|inlocuieste|in loc de|instead|switch|use|choose|prefer\w*)\b/.test(t)) return { kind: "choose", text: t };
    // "o vreau din WPC", "made of larch"
    if (/\b(din|made of|in)\s+(pin|larice|wpc|compozit\w*|brad|pine|larch|composite)\b/.test(t)) return { kind: "choose", text: t };
    if (/\b(adaug\w*|add)\b/.test(t)) return { kind: "add_suggestions", text: t };
  }
  if (!type) return { kind: "unknown" };

  const params: Record<string, unknown> = {};
  const dims = findDims(t);
  const height = tagged(t, HEIGHT_WORD, dims);
  const area = t.match(new RegExp(`${NUM}\\s*(?:de\\s+)?(?:mp|m2|m²|sqm|square|metri patrati|m patrati)`));
  const lengthTag = tagged(t, LENGTH_WORD, dims);
  const widthTag = tagged(t, WIDTH_WORD, dims);
  // A plain "20 m" that isn't the height ("gard înalt de 1,2 m, lung de 30 m").
  const plainLength = lengthTag ?? metresIn(t).find((f) => f.at !== height?.at && !(dims && f.at >= dims.at && f.at < dims.end));
  const side = (a: number) => Math.round(Math.sqrt(a) * 100) / 100;
  if (dims) {
    params.lengthM = dims.a;
    params.widthM = dims.b;
  } else if (lengthTag && widthTag) {
    // "4 m lungime și 3 m lățime", "4 m long and 3 m wide"
    params.lengthM = lengthTag.value;
    params.widthM = widthTag.value;
  }
  if (height) params.heightM = height.value;
  const countOf = (nouns: string) => {
    if (new RegExp(`\\b(?:fara|no|without|zero)\\s+(?:${nouns})\\b`).test(t)) return 0;
    const m = t.match(new RegExp(`\\b(\\d+|o|un|una|one|a|doua|doi|two|trei|three|patru|four)\\s+(?:${nouns})\\b`));
    if (!m) return undefined;
    return /^\d+$/.test(m[1]) ? Number(m[1]) : WORD_NUM[m[1]];
  };
  const doors = countOf("usi|usa|door|doors");
  const windows = countOf("ferestre|fereastra|geamuri|window|windows");
  if (doors !== undefined) params.doors = doors;
  if (windows !== undefined) params.windows = windows;

  switch (type) {
    case "fence":
      if (!params.lengthM && plainLength) params.lengthM = plainLength.value;
      if (params.widthM) delete params.widthM;
      break;
    case "lawn":
      if (area) params.areaM2 = num(area[1]);
      else if (params.lengthM && params.widthM) params.areaM2 = (params.lengthM as number) * (params.widthM as number);
      if (/\b(refac\w*|overseed\w*|suprains\w*)\b/.test(t)) params.mode = "overseed";
      break;
    case "drywall_partition":
      if (!params.lengthM && plainLength) params.lengthM = plainLength.value;
      if (params.widthM && !params.heightM) params.heightM = params.widthM;
      delete params.widthM;
      params.doors = doors ?? 0;
      break;
    case "tiling": {
      params.roomType = /\b(bucatari\w*|kitchen)\b/.test(t) ? "kitchen" : /\b(baie|baia|bathroom)\b/.test(t) ? "bathroom" : "other";
      if (!params.lengthM && area) params.lengthM = params.widthM = side(num(area[1]));
      // "Faianță" = wall tiles: outside bathrooms the calculator tiles no walls unless told to.
      const wallTiles = /\b(faianta|wall tiles?|pe pereti|on the walls?|backsplash)\b/.test(t);
      const floorTiles = /\b(gresie|floor tiles?|pe jos|on the floor|pardoseala)\b/.test(t);
      const upTo = t.match(new RegExp(`\\b(?:pana la|up to)\\s*${NUM}\\s*(cm)?`));
      if (upTo) params.wallTileHeightM = num(upTo[1]) / (upTo[2] ? 100 : 1);
      else if (/\b(doar|numai|only|just)\s+(gresie|floor)\b/.test(t)) params.wallTileHeightM = 0;
      else if (wallTiles && params.roomType !== "bathroom") params.wallTileHeightM = 0.6;
      if (/\b(doar|numai|only|just)\s+(faianta|wall)\b/.test(t) || (wallTiles && !floorTiles && params.roomType !== "bathroom")) params.tileFloor = false;
      delete params.heightM;
      break;
    }
    case "laminate_floor":
      params.subfloor = /\b(beton|sapa|concrete|screed)\b/.test(t) ? "concrete" : /\b(lemn|wood\w*)\b/.test(t) ? "wood" : /\b(gresie veche|old tiles)\b/.test(t) ? "old_tiles" : "concrete";
      if (!params.lengthM && area) params.lengthM = params.widthM = side(num(area[1]));
      if (/\bdiagonal\w*\b/.test(t)) params.pattern = "diagonal";
      delete params.heightM;
      break;
    case "deck":
      params.base = /\b(beton|placa|concrete|slab)\b/.test(t) ? "concrete_slab" : /\b(pietris|gravel)\b/.test(t) ? "gravel" : "soil";
      if (!params.lengthM && area) params.lengthM = params.widthM = side(num(area[1]));
      // "ridicată la 50 cm", "la 40 cm de la sol"
      if (!params.heightM && RAISE.test(t)) {
        const cm = t.match(new RegExp(`${NUM}\\s*cm\\b`));
        if (cm) params.heightM = num(cm[1]) / 100;
      }
      break;
    case "paving":
      // What it carries decides the build-up: cars → driveway; "alee" → path; "terasă / curte" → patio.
      if (/\b(driveway|masin\w*|auto|parcare|cars?|vehicul\w*|garaj\w*)\b/.test(t)) params.use = "driveway";
      else if (/\b(alee|aleea|alei|path|pathway|footpath|walkway|trotuar\w*)\b/.test(t)) params.use = "path";
      else if (/\b(terasa|patio|curte|curtea|terrace|yard|courtyard)\b/.test(t)) params.use = "patio";
      if (/\b(fara borduri|without (the )?(edging|kerbs?)|no (edging|kerbs?))\b/.test(t)) params.edging = false;
      if (!params.lengthM && area) params.lengthM = params.widthM = side(num(area[1]));
      delete params.heightM;
      break;
    case "paint_room":
      // "camera de 12 mp" (floor area, not the walls') → a square room of that area.
      if (!params.lengthM && area && !/\b(pereti|walls?)\b/.test(t)) params.lengthM = params.widthM = side(num(area[1]));
      if (/\b(fara tavan|without (the )?ceiling|no ceiling)\b/.test(t)) params.paintCeiling = false;
      if (/\b(glet nou|tencuiala noua|fresh plaster|new plaster)\b/.test(t)) params.surface = "fresh_plaster";
      if (/\b(inchis|dark)\b/.test(t)) params.surface = "dark_to_light";
      break;
  }

  const needsLW = ["deck", "paint_room", "laminate_floor", "tiling", "paving"].includes(type);
  const missing =
    type === "lawn"
      ? params.areaM2 ? undefined : "area"
      : type === "fence" || type === "drywall_partition"
        ? params.lengthM ? undefined : "length"
        : needsLW && !(params.lengthM && params.widthM)
          ? "dims"
          : undefined;
  // Naming the current project without new dimensions ("terasa mea e pe pământ") is a follow-up we
  // didn't understand, not a new project: don't throw the sketch away for the sizes card.
  if (missing && state.project?.type === type) return { kind: "unknown" };
  return { kind: "project", type, params, quality, missing };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function* streamText(text: string): AsyncGenerator<AgentEvent> {
  const parts = text.split(/(\s+)/);
  for (let i = 0; i < parts.length; i += 2) {
    yield { type: "text", delta: parts[i] + (parts[i + 1] ?? "") };
    await sleep(18 + Math.random() * 22);
  }
}

/** Words a short product name must not end on ("Genunchiere Protekt cu gel" → "genunchiere Protekt"). */
const DANGLING = new Set("cu din de pentru si și la pe in în fara fără sau with for and of in on".split(" "));

/** "Plot reglabil terasă Kronwald 60–100 mm" → "plot reglabil terasă" (generic words only, brands keep their case). */
export function shortName(name: string): string {
  const words = name.split(",")[0].split(" ").slice(0, 3);
  while (words.length > 1 && DANGLING.has(words[words.length - 1].toLowerCase())) words.pop();
  return words.map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w)).join(" ");
}

/**
 * How a reply names a product. Romanian names start with what it is ("Plot reglabil terasă Kronwald…");
 * English ones start with the brand ("Kronwald adjustable deck support…" → "kronwald adjustable deck"),
 * so in English say the job it does ("adjustable deck support").
 */
export function itemName(name: string, role: MaterialRole | undefined, lang: Lang): string {
  const label = lang === "en" && role ? MATERIAL_ROLES[role]?.labelEn : undefined;
  if (!label) return shortName(name);
  return /^[A-Z]{2}/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1);
}

function stockSentence(q: Quote, lang: Lang): string {
  if (q.availability.allInStock) return lang === "en" ? `Everything is in stock at ${q.storeName}.` : `Totul e pe stoc la ${q.storeName}.`;
  const missing = [...new Set(q.availability.missing.map((m) => itemName(m.name, q.lines.find((l) => l.sku === m.sku)?.role, lang)))];
  const list = missing.slice(0, 3).join(", ");
  const best = q.availability.alternatives.find((a) => a.allInStock && a.distanceKm <= 60);
  if (best) {
    return lang === "en"
      ? `At ${q.storeName} we're short on ${list}; **${best.name}** (${km(best.distanceKm, lang)}) has everything — shall I move your list there?`
      : `La ${q.storeName} nu ajunge stocul pentru ${list}; la **${best.name}** (${km(best.distanceKm, lang)}) e tot — mut lista acolo?`;
  }
  return lang === "en"
    ? `At ${q.storeName} we're short on ${list} — I can swap them for in-stock alternatives or arrange home delivery.`
    : `La ${q.storeName} nu ajunge stocul pentru ${list} — pot găsi alternative pe stoc sau livrare la domiciliu.`;
}

export function projectReply(
  q: Quote,
  card: Extract<Card, { kind: "quote" }>,
  title: string,
  lang: Lang,
  /** The session's suggestions (they carry the role the reply names them by). */
  suggested: { sku: string; role: MaterialRole }[] = [],
): string {
  const en = lang === "en";
  const parts: string[] = [];
  // A tier picked earlier carries over to the next project: say so, or "premium bathroom" looks like the normal price.
  const tier = card.quality === "budget" ? (en ? " (budget version)" : " (varianta economică)") : card.quality === "premium" ? (en ? " (premium version)" : " (varianta premium)") : "";
  parts.push(
    en
      ? `Done — ${title.toLowerCase()}${tier} comes to **${lei(q.total, lang)}**${q.saving > 0 ? `, including **${lei(q.saving, lang)}** off from your offers` : ""}.`
      : `Gata — ${title.toLowerCase()}${tier} costă **${lei(q.total, lang)}**${q.saving > 0 ? `, cu **${lei(q.saving, lang)}** reducere din ofertele tale` : ""}.`,
  );
  parts.push(
    en
      ? `You earn **${int(q.points.earned, lang)} points**${q.points.redeemableValue > 0 ? ` and can pay **${lei(q.points.redeemableValue, lang)}** with the points you already have` : ""}.`
      : `Primești **${int(q.points.earned, lang)} puncte**${q.points.redeemableValue > 0 ? ` și poți plăti **${lei(q.points.redeemableValue, lang)}** cu punctele pe care le ai deja` : ""}.`,
  );
  if (card.owned.length) {
    const owned = card.owned.map((o) => o.roleLabel.toLowerCase()).join(", ");
    parts.push(en ? `I left out the ${owned} — you already own them.` : `Am scos din listă ${owned} — le ai deja.`);
  }
  parts.push(stockSentence(q, lang));
  if (card.suggestions.length) {
    const s = [...new Set(card.suggestions.map((x) => itemName(x.name, suggested.find((g) => g.sku === x.sku)?.role, lang)))].slice(0, 2);
    parts.push(en ? `Optional: want me to add the ${s.join(" and ")} too?` : `Opțional: vrei să adaug și ${s.join(" și ")}?`);
  }
  return parts.join(" ");
}

function askFor(missing: string, type: ProjectType, lang: Lang): string {
  const en = lang === "en";
  if (missing === "area") return en ? "Happy to help with the lawn! Roughly how many m² is it?" : "Te ajut cu gazonul! Cam câți metri pătrați are suprafața?";
  if (missing === "length")
    return type === "fence"
      ? en ? "How long should the fence be (in metres), and how high — 0.9, 1.2 or 1.8 m?" : "Cât de lung vrei gardul (în metri) și cât de înalt — 0,9, 1,2 sau 1,8 m?"
      : en ? "How long and how high is the wall (e.g. 3.5 × 2.6 m), and does it need a door?" : "Ce lungime și înălțime are peretele (ex. 3,5 × 2,6 m) și are nevoie de ușă?";
  return en
    ? "Great project! What are the room/area dimensions — length × width in metres (e.g. 4 × 3 m)?"
    : "Super proiect! Ce dimensiuni are — lungime × lățime în metri (ex. 4 × 3 m)?";
}

/** Follow-ups the offline agent understands, per project (shown when a message isn't understood). */
const EDIT_EXAMPLES: Record<ProjectType, [string, string]> = {
  deck: ["„fă-o 5 × 4 m”, „adaugă 2 trepte în față”, „ridic-o la 40 cm”", "“make it 5 × 4 m”, “add 2 steps at the front”, “raise it to 40 cm”"],
  fence: ["„pune o poartă de mașină”, „fă un colț la dreapta de 6 m”, „fă-l de 1,2 m înălțime”", "“add a driveway gate”, “turn right for 6 m”, “make it 1.2 m high”"],
  paint_room: ["„adaugă o fereastră”, „fără tavan”, „fă-o 5 × 4 m”", "“add a window”, “no ceiling”, “make it 5 × 4 m”"],
  tiling: ["„faianță doar până la 1,2 m”, „adaugă o ușă”, „fă-o 3 × 2 m”", "“wall tiles only up to 1.2 m”, “add a door”, “make it 3 × 2 m”"],
  laminate_floor: ["„fă-o în L cu 2 × 2 m în dreapta”, „montaj diagonal”, „adaugă o ușă”", "“make it L-shaped with 2 × 2 m on the right”, “diagonal laying”, “add a door”"],
  drywall_partition: ["„fă-l de 4 m”, „adaugă o ușă”, „fă-l de 2,8 m înălțime”", "“make it 4 m long”, “add a door”, “make it 2.8 m high”"],
  lawn: ["„fă-o 10 × 8 m”, „adaugă o zonă de 3 × 3 m în spate”", "“make it 10 × 8 m”, “add another area of 3 × 3 m at the back”"],
  paving: ["„fă-o în L cu 1,2 × 3 m în dreapta”, „fă-o 8 × 1,5 m”, „fă-o pentru mașini”, „fără borduri”", "“make it L-shaped with 1.2 × 3 m on the right”, “make it 8 × 1.5 m”, “make it a driveway”, “no edging”"],
};

/** How to ask for a line the chosen product made unnecessary (the offline parser understands these). */
const DROP_PHRASE: Partial<Record<MaterialRole, [ro: string, en: string]>> = {
  deck_oil: ["scoate uleiul", "remove the oil"],
  kerb_concrete: ["scoate betonul uscat", "remove the dry concrete"],
};

/** The language to answer in: the message's own language when it's clear, else the session's. */
export function replyLang(message: string, fallback: Lang): Lang {
  return /\b(the|want|need|build|building|my|how|what|would|like|please|i'm|i am|with|and|to|for|is)\b/i.test(message)
    ? "en"
    : /[ăâîșțş]|\b(vreau|și|sau|pentru|cum|unde|îmi|imi|doresc|trebuie)\b/i.test(message)
      ? "ro"
      : fallback;
}

export interface ScriptedOptions {
  sources: DataSources;
  tenant: Tenant;
  customer: Customer;
  message: string;
  state: SessionState;
  lang: Lang;
  reason?: string;
  /** Previous (sanitised) conversation items, carried forward so a live turn can follow. */
  history?: unknown[];
}

export async function* runScriptedAgent(opts: ScriptedOptions): AsyncGenerator<AgentEvent> {
  const started = Date.now();
  const lang = replyLang(opts.message, opts.lang);
  let state: SessionState = { ...opts.state, basket: opts.state.basket ?? [] };
  const ctx = (): ToolContext => ({ sources: opts.sources, customer: opts.customer, state, lang, now: new Date(), tenant: opts.tenant });
  const status = (tool: string): AgentEvent => ({ type: "status", tool, label: TOOL_STATUS[tool]?.[lang] ?? tool });

  yield { type: "mode", mode: "scripted", reason: opts.reason };
  const intent = (state.project && answerToQuestion(opts.message, opts.history)) || parseIntent(opts.message, state);
  let reply = "";
  let lastQuote: Quote | undefined;
  const extraAmounts: number[] = [];

  const runTool = async function* (name: string, args: Record<string, unknown>, delay: number) {
    yield status(name);
    await sleep(delay);
    const r = await executeTool(name, JSON.stringify(args), ctx());
    if (r.state) {
      state = r.state;
      yield { type: "state", state } as AgentEvent;
    }
    for (const card of r.cards ?? []) {
      if (card.kind === "quote") lastQuote = card.quote;
      yield { type: "card", card } as AgentEvent;
    }
    if (r.ui) yield { type: "ui", command: r.ui } as AgentEvent;
    return r;
  };

  /** The session's suggestions named in the text ("adaugă uleiul" → the decking oil). */
  const namedSuggestions = async (text: string) => {
    const words = contentWords(text);
    if (!words.length || !state.suggestions?.length) return [];
    const products = new Map((await opts.sources.catalog.getMany(state.suggestions.map((sg) => sg.sku))).map((p) => [p.sku, p]));
    const scored = state.suggestions.map((sg) => {
      const p = products.get(sg.sku);
      const hay = fold(`${p?.name ?? ""} ${p?.nameEn ?? ""} ${MATERIAL_ROLES[sg.role]?.label ?? ""} ${MATERIAL_ROLES[sg.role]?.labelEn ?? ""}`);
      // Words matched, then the words as a phrase: "the mitre saw" is the saw, not the "mitre box with saw".
      return { sg, n: words.filter((w) => hay.includes(w)).length * 2 + (hay.includes(words.join(" ")) ? 1 : 0) };
    });
    const top = Math.max(0, ...scored.map((x) => x.n));
    return top > 0 ? scored.filter((x) => x.n === top).map((x) => x.sg) : [];
  };

  if (intent.kind === "project" && !intent.missing) {
    if (!state.project) {
      yield status("get_customer_context");
      await sleep(450);
    }
    const r = yield* runTool(
      "calculate_project",
      { projectType: intent.type, params: intent.params, quality: intent.quality ?? null, storeId: null, includeOptional: null, keepSketch: null },
      650,
    );
    const quoteCard = r.cards?.find((c): c is Extract<Card, { kind: "quote" }> => c.kind === "quote");
    if (!quoteCard || !state.project) {
      const max = String((r.forModel as { error?: string }).error ?? "").match(/max is (\d+(?:\.\d+)?)/)?.[1];
      reply = max
        ? lang === "en"
          ? `That looks too big for one project — I can calculate up to ${max} m (or m²) here. Could you check the dimensions?`
          : `Pare prea mare pentru un singur proiect — pot calcula până la ${dec(Number(max), lang, 0)} m (sau m²) aici. Verifici te rog dimensiunile?`
        : lang === "en"
          ? "I couldn't calculate that — could you give me the dimensions again?"
          : "Nu am putut calcula — îmi mai dai o dată dimensiunile?";
    } else {
      yield status("present_plan");
      await sleep(700);
      yield {
        type: "card",
        card: {
          kind: "plan",
          id: `plan-${Date.now().toString(36)}`,
          plan: { ...scriptedPlan(state.project.type, state.project.inputs, lang), approvedBy: opts.tenant.plans === "approved" ? opts.tenant.name : undefined },
        },
      };
      reply = projectReply(quoteCard.quote, quoteCard, state.project.title, lang, state.suggestions);
    }
  } else if (intent.kind === "project") {
    yield* runTool("suggest_sizes", { projectType: intent.type }, 250);
    reply = askFor(intent.missing!, intent.type, lang);
  } else if (intent.kind === "sizes") {
    const type = intent.type ?? projectTypeFromHistory(opts.history);
    if (type) {
      yield* runTool("suggest_sizes", { projectType: type }, 250);
      reply =
        lang === "en"
          ? "No problem — pick a typical size or pace it out below (one pace ≈ 75 cm). You can fine-tune everything in the sketch afterwards."
          : "Nicio problemă — alege o dimensiune tipică sau măsoară cu pașii mai jos (un pas ≈ 75 cm). Poți ajusta totul din schiță după aceea.";
    } else {
      reply = lang === "en" ? "No problem — first, what would you like to build or renovate?" : "Nicio problemă — mai întâi, ce vrei să construiești sau să renovezi?";
    }
  } else if (intent.kind === "sketch" && state.project) {
    const blank: Omit<SketchOp, "op"> = {
      zone: null, w: null, d: null, h: null, side: null, align: null, width: null, count: null, value: null,
      kind: null, wall: null, pos: null, id: null, segment: null, length: null, turn: null, key: null,
    };
    const r = yield* runTool("edit_sketch", { edits: intent.edits.map((e) => ({ ...blank, option: null, ...e })) }, 700);
    const ch = r.cards?.find((c): c is Extract<Card, { kind: "change" }> => c.kind === "change")?.change;
    if (!ch) {
      const err = (r as { errorText?: string }).errorText ?? explainEditError((r.forModel as { error?: string }).error ?? "", lang);
      reply = lang === "en" ? `I couldn't change the sketch that way: ${err}. Try another size or side?` : `Nu am putut modifica schița așa: ${err}. Încercăm altă dimensiune sau latură?`;
    } else {
      extraAmounts.push(ch.totalBefore, Math.abs(ch.delta), ...ch.lines.map((l) => Math.abs(l.deltaRon)));
      const sign = ch.delta > 0 ? "+" : ch.delta < 0 ? "−" : "±";
      const what = ch.edits.map(lowerFirst).join("; ");
      const same = Math.abs(ch.delta) < 0.005;
      // A new safety note (e.g. posts and footings above 60 cm) is the real story; don't claim nothing else is needed.
      const why = ch.warnings?.length ? "" : ` — ${sameReason(ch, lang)}`;
      reply =
        lang === "en"
          ? `Done — ${what.charAt(0).toLowerCase() + what.slice(1)}. I redrew the sketch and recalculated the list, keeping the products you picked: ${same ? `the total stays **${lei(ch.totalAfter, lang)}**${why}` : `new total **${lei(ch.totalAfter, lang)}** (${sign}${lei(Math.abs(ch.delta), lang)})`}.`
          : `Gata — ${what.charAt(0).toLowerCase() + what.slice(1)}. Am redesenat schița și am recalculat lista, păstrând produsele alese: ${same ? `totalul rămâne **${lei(ch.totalAfter, lang)}**${why}` : `total nou **${lei(ch.totalAfter, lang)}** (${sign}${lei(Math.abs(ch.delta), lang)})`}.`;
      if (ch.warnings?.length) reply += ` ⚠ ${ch.warnings[0]}`;
    }
  } else if (intent.kind === "requality" && state.project) {
    const before = state.basket.length ? (await executeTool("modify_basket", JSON.stringify({ operations: [], storeId: null }), ctx())).cards?.find((c) => c.kind === "quote") : undefined;
    const r = yield* runTool(
      "calculate_project",
      { projectType: state.project.type, params: state.project.inputs, quality: intent.quality, storeId: state.storeId ?? null, includeOptional: null, keepSketch: true },
      650,
    );
    const q = r.cards?.find((c): c is Extract<Card, { kind: "quote" }> => c.kind === "quote");
    if (q) {
      const prev = before && before.kind === "quote" ? before.quote.total : undefined;
      const diff = prev !== undefined ? q.quote.total - prev : 0;
      extraAmounts.push(Math.round(Math.abs(diff) * 100) / 100);
      const label = intent.quality === "budget" ? (lang === "en" ? "The budget version" : "Varianta economică") : lang === "en" ? "The premium version" : "Varianta premium";
      reply =
        lang === "en"
          ? `${label} comes to **${lei(q.quote.total, lang)}**${prev !== undefined ? ` (${diff < 0 ? "−" : "+"}${lei(Math.abs(diff), lang)} vs. before)` : ""}. ${stockSentence(q.quote, lang)}`
          : `${label} costă **${lei(q.quote.total, lang)}**${prev !== undefined ? ` (${diff < 0 ? "−" : "+"}${lei(Math.abs(diff), lang)} față de înainte)` : ""}. ${stockSentence(q.quote, lang)}`;
    } else {
      reply = lang === "en" ? "I couldn't recalculate the project in that version — could you tell me the dimensions again?" : "Nu am putut recalcula proiectul în varianta asta — îmi mai spui o dată dimensiunile?";
    }
  } else if (intent.kind === "offers") {
    const r = yield* runTool("get_offers", {}, 550);
    const offers = r.cards?.find((c): c is Extract<Card, { kind: "offers" }> => c.kind === "offers")?.offers ?? [];
    const applied = offers.filter((o) => o.appliesNow).length;
    reply =
      lang === "en"
        ? `You have **${offers.length} active offers** in your wallet; **${applied}** already apply to this list. The others are ready for your next project.`
        : `Ai **${offers.length} oferte active** în Wallet; **${applied}** se aplică deja pe lista asta. Celelalte te așteaptă la următorul proiect.`;
  } else if (intent.kind === "stock") {
    const r = yield* runTool("check_stock", { skus: null }, 600);
    const stores = r.cards?.find((c): c is Extract<Card, { kind: "stock" }> => c.kind === "stock")?.stores ?? [];
    const full = stores.filter((s) => s.allInStock && s.distanceKm <= 60);
    reply = full.length
      ? lang === "en"
        ? `Everything is in stock at **${full.map((s) => s.name).slice(0, 2).join("** and **")}** — tap a store on the map to move your list there.`
        : `Tot ce ai pe listă e pe stoc la **${full.map((s) => s.name).slice(0, 2).join("** și **")}** — apasă pe un magazin din hartă ca să muți lista.`
      : lang === "en"
        ? "No nearby store has every item right now — I can swap the missing ones for in-stock alternatives or deliver them."
        : "Niciun magazin din apropiere nu are acum toate produsele — pot înlocui ce lipsește cu alternative pe stoc sau livrare.";
  } else if (intent.kind === "view") {
    const c = intent.command;
    yield* runTool(
      "control_view",
      {
        view: c.view ?? null,
        highlight: c.highlight === null ? "none" : (c.highlight ?? null),
        editor: c.editor ?? null,
        panel: c.panel ?? null,
        product: c.product ?? null,
        redeemPoints: c.redeemPoints ?? null,
      },
      350,
    );
    const what = c.highlight && MATERIAL_ROLES[c.highlight as MaterialRole];
    const en = lang === "en";
    reply = [
      what ? (en ? `Highlighted in the sketch and in your list: **${what.labelEn.toLowerCase()}**.` : `Am evidențiat pe schiță și în listă: **${what.label.toLowerCase()}**.`) : "",
      c.view === "exploded" && !what ? (en ? "Exploded view: every layer lifted apart, in build order." : "Vedere explodată: fiecare strat ridicat separat, în ordinea montajului.") : "",
      c.view === "real" ? (en ? "Here's the realistic view, with the materials' colours." : "Iată vederea realistă, cu culorile materialelor.") : "",
      c.editor ? (en ? "The plan editor is open — drag an edge or tap + to change the shape; the list follows every change." : "Am deschis editorul de plan — trage de o margine sau apasă + ca să schimbi forma; lista se actualizează la fiecare modificare.") : "",
      c.panel === "cart" ? (en ? "Your cart is open." : "Ți-am deschis coșul.") : "",
      c.panel === "wallet" ? (en ? "Your cart is open — tap the Wallet button to send the list to your pass." : "Ți-am deschis coșul — apasă butonul Wallet ca să trimiți lista pe card.") : "",
      c.panel === "plan" ? (en ? "Here's the step-by-step plan." : "Iată planul pas cu pas.") : "",
      c.redeemPoints === true ? (en ? "Totals now show part of the price paid with your points." : "Totalurile arată acum plata parțială cu punctele tale.") : "",
      c.redeemPoints === false ? (en ? "Totals no longer use your points." : "Totalurile nu mai folosesc punctele.") : "",
    ]
      .filter(Boolean)
      .join(" ");
  } else if ((intent.kind === "choose" || intent.kind === "remove" || intent.kind === "move") && state.project) {
    const before = await priceBasket(ctx(), state.basket, state.storeId ?? opts.customer.homeStoreId);
    const words = contentWords(intent.text);
    const hit = (name: string) => words.filter((w) => fold(name).includes(w)).length;
    let op: Record<string, unknown> | null = null;
    let storeId: string | null = null;
    let label = "";
    if (intent.kind === "move") {
      // Numbers count here: "Timișoara 2" is not "Timișoara 1" (whole words, so "2" doesn't match "20").
      const storeWords = contentWords(intent.text, { numbers: true });
      const storeHit = (name: string) => storeWords.filter((w) => new RegExp(`\\b${w}`).test(fold(name))).length;
      const current = state.storeId ?? opts.customer.homeStoreId;
      const stores = await opts.sources.stores.list();
      const best = stores
        .map((st) => ({ st, n: storeHit(`${st.name} ${st.city}`) }))
        .sort((a, b) => b.n - a.n || Number(a.st.id === current) - Number(b.st.id === current))[0];
      if (best?.n) {
        storeId = best.st.id;
        label = best.st.name;
      }
    } else if (intent.kind === "remove") {
      const inBasket = await opts.sources.catalog.getMany(state.basket.map((b) => b.sku));
      const best = inBasket
        .map((p) => ({ p, n: hit(`${p.name} ${p.nameEn} ${p.roles.map((r) => `${MATERIAL_ROLES[r].label} ${MATERIAL_ROLES[r].labelEn}`).join(" ")}`) }))
        .sort((a, b) => b.n - a.n)[0];
      if (best?.n) {
        op = { op: "remove", sku: best.p.sku, qty: null, withSku: null };
        label = lang === "en" ? best.p.nameEn : best.p.name;
      }
    } else {
      const roles = [...new Set(state.basket.map((b) => b.role).filter(Boolean))] as MaterialRole[];
      const inBasket = new Set(state.basket.map((b) => b.sku));
      // "din pin" means the main material unless a part is named ("grinzi din pin"):
      // rank by words matched, then a named part, then the role's share of the list.
      const named = new Set(MATERIAL_WORDS.filter(([, re]) => re.test(intent.text)).map(([r]) => r));
      const basketProducts = new Map((await opts.sources.catalog.getMany([...inBasket])).map((p) => [p.sku, p]));
      const spend = new Map<string, number>();
      for (const b of state.basket) if (b.role) spend.set(b.role, (spend.get(b.role) ?? 0) + (basketProducts.get(b.sku)?.price ?? 0) * b.qty);
      const roleOf = (p: { roles: MaterialRole[] }) => p.roles.find((r) => roles.includes(r)) ?? p.roles[0];
      const candidates = (await opts.sources.catalog.byRoles(roles)).filter((p) => !inBasket.has(p.sku));
      const best = candidates
        .map((p) => ({ p, n: hit(`${p.name} ${p.nameEn} ${p.brand}`), named: named.has(roleOf(p)) ? 1 : 0, spend: spend.get(roleOf(p)) ?? 0 }))
        .filter((c) => c.n > 0)
        .sort((a, b) => b.n - a.n || b.named - a.named || b.spend - a.spend || a.p.price - b.p.price)[0];
      if (best?.n) {
        op = { op: "choose", sku: best.p.sku, qty: null, withSku: null };
        label = lang === "en" ? best.p.nameEn : best.p.name;
      }
    }
    if ((intent.kind === "choose" || intent.kind === "remove") && intent.view && Object.values(intent.view).some((v) => v !== undefined)) {
      const c = intent.view;
      yield* runTool("control_view", { view: c.view ?? null, highlight: null, editor: c.editor ?? null, panel: c.panel ?? null, product: null, redeemPoints: c.redeemPoints ?? null }, 200);
    }
    if (!op && !storeId) {
      reply =
        intent.kind === "move"
          ? lang === "en" ? "Which store should I move your list to? Tap one on the stock map, or tell me its name." : "La ce magazin să mut lista? Alege unul din harta de stoc sau spune-mi numele lui."
          : intent.kind === "remove"
            ? lang === "en" ? "Which item should I take off the list?" : "Ce produs să scot din listă?"
            : lang === "en" ? "Which option would you like? Open the options on any line of the list, or tell me the material (e.g. pine, WPC)." : "Ce variantă preferi? Deschide opțiunile de pe orice linie din listă sau spune-mi materialul (ex. pin, WPC).";
    } else {
      const r = yield* runTool("modify_basket", { operations: op ? [op] : [], storeId }, 500);
      const q = r.cards?.find((c): c is Extract<Card, { kind: "quote" }> => c.kind === "quote");
      const errs = (r.forModel as { errors?: string[] }).errors;
      if (!q || errs?.length) {
        reply = lang === "en" ? `That didn't work: ${errs?.join("; ") ?? "unknown error"}.` : `Nu a mers: ${errs?.join("; ") ?? "eroare necunoscută"}.`;
      } else {
        const diff = Math.round((q.quote.total - before.total) * 100) / 100;
        extraAmounts.push(Math.abs(diff), before.total);
        const delta = diff === 0 ? "" : ` (${diff < 0 ? "−" : "+"}${lei(Math.abs(diff), lang)})`;
        const en = lang === "en";
        reply =
          intent.kind === "move"
            ? `${storeId === before.storeId ? (en ? `Your list is already at **${label}**` : `Lista e deja la **${label}**`) : en ? `Moved your list to **${label}**` : `Am mutat lista la **${label}**`}. ${stockSentence(q.quote, lang)}`
            : intent.kind === "remove"
              ? en ? `Removed ${label} — new total **${lei(q.quote.total, lang)}**${delta}.` : `Am scos ${label} — total nou **${lei(q.quote.total, lang)}**${delta}.`
              : en ? `Switched to ${label}, sized for your project — new total **${lei(q.quote.total, lang)}**${delta}.` : `Am trecut la ${label}, calculat pentru proiectul tău — total nou **${lei(q.quote.total, lang)}**${delta}.`;
        // "WPC needs no oil": offer to drop what the new choice made unnecessary.
        const unneeded = intent.kind === "choose" ? q.quote.hints.find((h) => h.kind === "not_needed") : undefined;
        const line = unneeded && q.quote.lines.find((l) => l.sku === unneeded.sku);
        if (unneeded && line) {
          const what = line.name.split(",")[0];
          const [dropRo, dropEn] = (unneeded.role && DROP_PHRASE[unneeded.role]) || DROP_PHRASE.deck_oil!;
          reply += en ? ` ${what} isn't needed with ${unneeded.because} — say "${dropEn}" to drop it.` : ` ${what} nu e necesar la ${unneeded.because} — spune „${dropRo}” și îl scot.`;
        }
      }
    }
  } else if (intent.kind === "add_suggestions" && intent.text && state.project && !(await namedSuggestions(intent.text)).length) {
    // "Adaugă o bancă": not something we suggested — don't add every extra instead.
    const names = (await opts.sources.catalog.getMany((state.suggestions ?? []).map((sg) => sg.sku))).map((p) => (lang === "en" ? p.nameEn : p.name).split(",")[0]);
    reply = names.length
      ? lang === "en"
        ? `I can add the suggested extras: ${names.slice(0, 3).join("; ")}. Which one? For other products, open the options on a line of the list.`
        : `Pot adăuga extra-urile sugerate: ${names.slice(0, 3).join("; ")}. Pe care? Pentru alte produse, deschide opțiunile de pe o linie din listă.`
      : lang === "en"
        ? "I didn't find that among this project's materials — you can change products from the options on each line of the list."
        : "Nu am găsit asta printre materialele proiectului — poți schimba produsele din opțiunile de pe fiecare linie a listei.";
  } else if (intent.kind === "add_suggestions" && state.project && state.suggestions?.length) {
    const all = state.suggestions;
    const picked = intent.text ? await namedSuggestions(intent.text) : all;
    const added = picked.map((sg) => ({ op: "add", sku: sg.sku, qty: null, withSku: null }));
    const before = await priceBasket(ctx(), state.basket, state.storeId ?? opts.customer.homeStoreId);
    const r = yield* runTool("modify_basket", { operations: added, storeId: null }, 500);
    const q = r.cards?.find((c): c is Extract<Card, { kind: "quote" }> => c.kind === "quote");
    if (q) {
      const diff = Math.round((q.quote.total - before.total) * 100) / 100;
      extraAmounts.push(Math.abs(diff));
      // Named just one of several: say which.
      const one = picked.length === 1 && all.length > 1 ? q.quote.lines.find((l) => l.sku === picked[0].sku)?.name : undefined;
      reply = one
        ? lang === "en"
          ? `Added ${one} (+${lei(diff, lang)}) — new total **${lei(q.quote.total, lang)}**, and **${int(q.quote.points.earned, lang)} points** to earn.`
          : `Am adăugat ${one} (+${lei(diff, lang)}) — total nou **${lei(q.quote.total, lang)}** și **${int(q.quote.points.earned, lang)} puncte** de câștigat.`
        : lang === "en"
          ? `Added the extras (+${lei(diff, lang)}) — new total **${lei(q.quote.total, lang)}**, and **${int(q.quote.points.earned, lang)} points** to earn.`
          : `Am adăugat extra-urile (+${lei(diff, lang)}) — total nou **${lei(q.quote.total, lang)}** și **${int(q.quote.points.earned, lang)} puncte** de câștigat.`;
    }
  } else if (intent.kind === "add_suggestions" && state.project) {
    const r = yield* runTool(
      "calculate_project",
      { projectType: state.project.type, params: state.project.inputs, quality: state.quality ?? null, storeId: state.storeId ?? null, includeOptional: true, keepSketch: true },
      600,
    );
    const q = r.cards?.find((c): c is Extract<Card, { kind: "quote" }> => c.kind === "quote");
    reply = q
      ? lang === "en"
        ? `Added the extras — new total **${lei(q.quote.total, lang)}**, and **${int(q.quote.points.earned, lang)} points** to earn.`
        : `Am adăugat extra-urile — total nou **${lei(q.quote.total, lang)}** și **${int(q.quote.points.earned, lang)} puncte** de câștigat.`
      : lang === "en"
        ? "I couldn't add the extras right now — you can add them from the list."
        : "Nu am putut adăuga extra-urile acum — le poți adăuga din listă.";
  } else if (intent.kind === "unsafe") {
    const pro = {
      electrical: { ro: "un electrician autorizat ANRE", en: "a licensed electrician" },
      gas: { ro: "un instalator autorizat pentru gaz", en: "a Gas Safe / licensed gas fitter" },
      structural: { ro: "un inginer structurist", en: "a structural engineer" },
      roof: { ro: "o echipă de acoperișuri cu echipament de siguranță", en: "a roofing crew with fall protection" },
      asbestos: { ro: "o firmă autorizată pentru îndepărtarea azbestului", en: "a licensed asbestos removal company" },
    }[intent.topic];
    reply =
      lang === "en"
        ? `For safety this one needs **${pro.en}** — it's not a DIY job, and ${opts.tenant.name} can recommend an installer. I can still plan everything around it: the finishing materials, tools and a shopping list for the parts you can do yourself.`
        : `Din motive de siguranță, aici ai nevoie de **${pro.ro}** — nu e o lucrare de făcut singur, iar ${opts.tenant.name} îți poate recomanda un instalator. Pot planifica în schimb tot ce ține de finisaje, sculele și lista pentru partea pe care o faci tu.`;
  } else if (state.project) {
    const ex = EDIT_EXAMPLES[state.project.type][lang === "en" ? 1 : 0];
    reply =
      lang === "en"
        ? `I didn't catch what to change. You can say, for example: ${ex}, “cheaper option” — or tap **Edit sketch**.`
        : `Nu am înțeles ce să schimb. Poți să-mi spui, de exemplu: ${ex}, „variantă mai ieftină” — sau apasă **Modifică** pe schiță.`;
  } else {
    reply =
      lang === "en"
        ? "I'm your DIY project assistant — I can plan a **deck, room painting, laminate floor, bathroom tiling, fence, drywall partition, new lawn or a paver path, patio or driveway**. Tell me what you'd like to do and the rough dimensions."
        : "Sunt asistentul tău pentru proiecte DIY — pot planifica o **terasă, vopsirea unei camere, parchet, placarea băii, un gard, un perete de gips-carton, gazon nou sau o alee, curte ori intrare auto din pavele**. Spune-mi ce vrei să faci și dimensiunile aproximative.";
  }

  yield* streamText(reply);
  const check = verifyReply(reply, lastQuote, extraAmounts);
  if (check.checked > 0) yield { type: "verified", ok: check.ok, checked: check.checked };
  yield { type: "history", items: [...(opts.history ?? []), { role: "user", content: opts.message }, { role: "assistant", content: reply }] };
  yield { type: "done", ms: Date.now() - started };
}

/** Why a sketch edit left the price alone: the packs on the list already cover it, or nothing to buy changed. */
export function sameReason(ch: { lines: { before: number; after: number }[] }, lang: Lang): string {
  const moved = ch.lines.some((l) => Math.abs(l.after - l.before) > 1e-6);
  if (moved) return lang === "en" ? "the packs already on your list cover the new amounts" : "pachetele de pe listă acoperă și noile cantități";
  return lang === "en" ? "the change doesn't need any more material" : "modificarea nu cere material în plus";
}
