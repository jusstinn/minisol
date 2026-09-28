import type { DataSources } from "@/adapters/types";
import type { Tenant } from "@/config/tenant";
import type { ProjectType } from "@/domain/calculators";
import type { Quote } from "@/domain/quote";
import { fold } from "@/domain/search";
import type { Customer, Lang, MaterialRole, QualityTier } from "@/domain/types";
import { MATERIAL_ROLES } from "@/domain/types";
import type { SketchOp, Side } from "@/domain/layout";
import { lei, int } from "@/lib/format";
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
  | { kind: "choose"; text: string }
  | { kind: "remove"; text: string }
  | { kind: "move"; text: string }
  | { kind: "requality"; quality: QualityTier }
  | { kind: "offers" }
  | { kind: "stock" }
  | { kind: "add_suggestions" }
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

const PROJECT_KEYWORDS: [ProjectType, RegExp][] = [
  ["tiling", /\b(baie|baia|bathroom|gresie|faianta|tile|tiles|tiling|placare)\b/],
  ["fence", /\b(gard|gardul|fence|fencing)\b/],
  ["deck", /\b(terasa|terasă|deck|decking|terrace|patio)\b/],
  ["laminate_floor", /\b(parchet|laminat|laminate|flooring|floors?|pardosea\w*)\b/],
  ["drywall_partition", /\b(gips|rigips|gipscarton|drywall|plasterboard|partition|despart\w*)\b/],
  ["lawn", /\b(gazon|gazonul|lawn|iarba|grass|turf)\b/],
  ["paint_room", /\b(vops\w*|zugrav\w*|paint\w*|repaint)\b/],
];

/** Words that never identify a product/store in "remove X" / "choose X" / "move to X". */
const STOP_WORDS = new Set(
  "scoate scot elimina sterge remove drop fara vreau nu mai din lista cos coșul alege schimba schimb foloseste inlocuieste loc instead switch use choose prefer prefera varianta variant option optiunea the and with pentru mea meu mele muta move mut lista magazin magazinul store la in pe de cu un una doua sau".split(" "),
);

const SIDE_WORDS: [Side, RegExp][] = [
  ["s", /\b(in fata|din fata|la fata|fata casei|front|sud|south)\b/],
  ["n", /\b(in spate|din spate|spate|back|nord|north)\b/],
  ["w", /\b(stanga|left|vest|west)\b/],
  ["e", /\b(dreapta|right|est|east)\b/],
];
const sideIn = (t: string) => SIDE_WORDS.find(([, re]) => re.test(t))?.[0];
const WORD_NUM: Record<string, number> = { o: 1, un: 1, una: 1, one: 1, a: 1, doua: 2, two: 2, trei: 3, three: 3, patru: 4, four: 4 };

/**
 * Sketch edits in plain words ("add 2 steps at the front", "fă-o în L cu 2×2 m în dreapta",
 * "o poartă de mașină", "faianță doar până la 1,2 m"). Returns null if it isn't an edit.
 */
export function parseSketchEdit(t: string, type: ProjectType): Partial<SketchOp>[] | null {
  const dims = t.match(new RegExp(`${NUM}\\s*(?:m|metri|meters)?\\s*(?:x|×|\\*|pe|by)\\s*${NUM}`));
  const side = sideIn(t);
  const removing = /\b(fara|scoate\w*|elimina\w*|sterge\w*|remove|delete|without|no more)\b/.test(t);
  const cm = t.match(new RegExp(`${NUM}\\s*cm\\b`));
  const metres = t.match(new RegExp(`${NUM}\\s*(?:m|metri|meters|metres)\\b`));
  const countWord = (re: RegExp) => {
    const m = t.match(re);
    return m ? (/^\d+$/.test(m[1]) ? Number(m[1]) : WORD_NUM[m[1]]) : undefined;
  };
  const edits: Partial<SketchOp>[] = [];

  if (type === "deck") {
    const raised = /\b(ridicat\w*|inaltat\w*|inaltime|raised?|high|above ground|de la sol|deasupra)\b/.test(t);
    if (raised && (cm || metres)) edits.push({ op: "set_height", value: cm ? num(cm[1]) / 100 : num(metres![1]) });
    if (/\b(trepte|treapta|scari|scara|steps?|stairs?)\b/.test(t)) {
      if (removing) edits.push({ op: "remove_steps" });
      else edits.push({ op: "add_steps", zone: "A", side: side ?? "s", count: countWord(/\b(\d+|o|una|doua|trei|patru|one|two|three|four)\s+(?:trepte|treapta|steps?|stairs?)\b/) ?? null });
    }
  }
  if (type === "deck" || type === "laminate_floor" || type === "lawn") {
    if (/\b(in l|forma de l|l[- ]shape\w*|extinde\w*|extensie|extension|extend|aripa|wing|inca o zona|another (area|section))\b/.test(t) && dims) {
      edits.push({ op: "add_zone", zone: "A", side: side ?? "e", w: num(dims[1]), d: num(dims[2]), align: "end" });
    } else if (dims && /\b(fa|make|mareste|micsoreaza|bigger|smaller|mai mare|mai mica|mai mic|de fapt|actually|resize|schimba|instead)\b/.test(t)) {
      edits.push({ op: "resize", zone: "A", w: num(dims[1]), d: num(dims[2]) });
    }
  }
  if (type === "paint_room" || type === "tiling") {
    if (dims && /\b(fa|make|mareste|micsoreaza|bigger|smaller|mai mare|mai mica|mai mic|de fapt|actually|resize|schimba|instead)\b/.test(t)) edits.push({ op: "resize", w: num(dims[1]), d: num(dims[2]) });
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
      edits.push({ op: "add_fence_segment", length: num(metres[1]), turn: side === "w" ? "left" : "right" });
    }
    if (/\b(inalt|inaltime|height|high|tall)\b/.test(t) && metres && !edits.length) edits.push({ op: "set_height", value: num(metres[1]) });
  }
  if (type === "paint_room" || type === "tiling" || type === "drywall_partition" || type === "laminate_floor") {
    if (/\b(usa|usi|door|doors)\b/.test(t)) edits.push(removing ? { op: "remove_opening", kind: "door" } : { op: "add_opening", kind: "door", wall: side ?? null });
    if (type === "paint_room" && /\b(fereastra|ferestre|geam|window|windows)\b/.test(t))
      edits.push(removing ? { op: "remove_opening", kind: "window" } : { op: "add_opening", kind: "window", wall: side ?? null });
  }
  if (type === "tiling" && /\b(faianta|wall tiles?|pe pereti|on the walls?)\b/.test(t)) {
    const h = cm ? num(cm[1]) / 100 : metres ? num(metres[1]) : removing ? 0 : undefined;
    if (h !== undefined) edits.push({ op: "set_wall_tiles", wall: side ?? "all", value: h });
  }
  return edits.length ? edits : null;
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
  ["post_concrete", /\b(fundati\w*|beton\w*|footings?|concrete)\b/],
  ["wall_tiles", /\b(faiant\w*|wall tiles?)\b/],
  ["floor_tiles", /\b(gresi\w*|floor tiles?)\b/],
  ["waterproofing", /\b(hidroizol\w*|waterproof\w*)\b/],
  ["interior_paint", /\b(vopse\w*|paint)\b/],
  ["laminate", /\b(parchet\w*|laminate)\b/],
  ["underlay", /\b(folie|underlay)\b/],
  ["skirting_board", /\b(plint\w*|skirting)\b/],
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

export function parseIntent(raw: string, state: SessionState): Intent {
  const t = fold(raw);
  const quality: QualityTier | undefined = /\b(ieftin\w*|cheap\w*|budget|economic\w*)\b/.test(t)
    ? "budget"
    : /\b(premium|durabil\w*|best|cel mai bun|top|calitate)\b/.test(t)
      ? "premium"
      : undefined;
  const unsafe = UNSAFE.find(([, re]) => re.test(t));
  if (unsafe) return { kind: "unsafe", topic: unsafe[0] };
  const type = PROJECT_KEYWORDS.find(([, re]) => re.test(t))?.[0];

  const sameProject = state.project && (!type || type === state.project.type || /\b(arat\w*|show|evidentiaz\w*|highlight|scoate\w*|remove|alege\w*|choose)\b/.test(t));
  if (state.project && sameProject) {
    if (/\b(anuleaz\w*|undo|revino|varianta anterioara|previous version|inapoi la)\b/.test(t)) return { kind: "sketch", edits: [{ op: "undo" }] };
    const view = parseView(t);
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
    if (/\b(sugest\w*|suggest\w*|extra\w*)\b/.test(t) || /^\s*(adauga|add)\s*(le|them|tot|all)?\s*[.!]?\s*$/.test(t)) return { kind: "add_suggestions" };
    if (/\b(scoate\w*|elimina\w*|sterge\w*|remove|drop|nu mai vreau|fara)\b/.test(t)) return { kind: "remove", text: t };
    if (/\b(alege\w*|schimba\w*|foloseste|inlocuieste|in loc de|instead|switch|use|choose|prefer\w*)\b/.test(t)) return { kind: "choose", text: t };
    if (/\b(adaug\w*|add)\b/.test(t)) return { kind: "add_suggestions" };
  }
  if (!type) return { kind: "unknown" };

  const params: Record<string, unknown> = {};
  const dims = t.match(new RegExp(`${NUM}\\s*(?:m|metri|meters)?\\s*(?:x|×|\\*|pe|by)\\s*${NUM}`));
  const height =
    t.match(new RegExp(`(?:inaltime|inalt|height|high|tall)\\D{0,12}${NUM}`)) ?? t.match(new RegExp(`${NUM}\\s*m?\\s*(?:inaltime|inalt|high|tall|height)`));
  const area = t.match(new RegExp(`${NUM}\\s*(?:mp|m2|m²|sqm|square)`));
  const length = t.match(new RegExp(`${NUM}\\s*(?:m|metri|meters|metres)\\b`));
  if (dims) {
    params.lengthM = num(dims[1]);
    params.widthM = num(dims[2]);
  }
  if (height) params.heightM = num(height[1]);
  const countOf = (re: RegExp) => {
    const m = t.match(re);
    if (!m) return undefined;
    const w = m[1];
    return /^\d+$/.test(w) ? Number(w) : /^(doua|two|2)$/.test(w) ? 2 : 1;
  };
  const doors = countOf(/\b(\d+|o|un|una|one|a|doua|two)\s+(?:usi|usa|door|doors)\b/);
  const windows = countOf(/\b(\d+|o|un|una|one|a|doua|two)\s+(?:ferestre|fereastra|window|windows)\b/);
  if (doors !== undefined) params.doors = doors;
  if (windows !== undefined) params.windows = windows;

  switch (type) {
    case "fence":
      if (!params.lengthM) {
        const l = t.match(new RegExp(`${NUM}\\s*(?:m|metri|meters)\\s*(?:lungime|long|de gard|lung)?`));
        if (l) params.lengthM = num(l[1]);
      }
      if (params.widthM) delete params.widthM;
      break;
    case "lawn":
      if (area) params.areaM2 = num(area[1]);
      else if (params.lengthM && params.widthM) params.areaM2 = (params.lengthM as number) * (params.widthM as number);
      if (/\b(refac\w*|overseed\w*|suprains\w*)\b/.test(t)) params.mode = "overseed";
      break;
    case "drywall_partition":
      if (!params.lengthM && length) params.lengthM = num(length[1]);
      if (params.widthM && !params.heightM) params.heightM = params.widthM;
      delete params.widthM;
      params.doors = doors ?? 0;
      break;
    case "tiling":
      params.roomType = /\b(bucatari\w*|kitchen)\b/.test(t) ? "kitchen" : /\b(baie|baia|bathroom)\b/.test(t) ? "bathroom" : "other";
      if (!params.lengthM && area) {
        params.lengthM = Math.sqrt(num(area[1]));
        params.widthM = Math.sqrt(num(area[1]));
      }
      break;
    case "laminate_floor":
      params.subfloor = /\b(beton|sapa|concrete|screed)\b/.test(t) ? "concrete" : /\b(lemn|wood\w*)\b/.test(t) ? "wood" : /\b(gresie veche|old tiles)\b/.test(t) ? "old_tiles" : "concrete";
      if (!params.lengthM && area) {
        params.lengthM = Math.sqrt(num(area[1]));
        params.widthM = Math.sqrt(num(area[1]));
      }
      break;
    case "deck":
      params.base = /\b(beton|placa|concrete|slab)\b/.test(t) ? "concrete_slab" : /\b(pietris|gravel)\b/.test(t) ? "gravel" : "soil";
      if (!params.lengthM && area) {
        params.lengthM = Math.sqrt(num(area[1]));
        params.widthM = Math.sqrt(num(area[1]));
      }
      break;
    case "paint_room":
      if (/\b(fara tavan|without (the )?ceiling|no ceiling)\b/.test(t)) params.paintCeiling = false;
      if (/\b(glet nou|tencuiala noua|fresh plaster|new plaster)\b/.test(t)) params.surface = "fresh_plaster";
      if (/\b(inchis|dark)\b/.test(t)) params.surface = "dark_to_light";
      break;
  }

  const needsLW = ["deck", "paint_room", "laminate_floor", "tiling"].includes(type);
  const missing =
    type === "lawn"
      ? params.areaM2 ? undefined : "area"
      : type === "fence" || type === "drywall_partition"
        ? params.lengthM ? undefined : "length"
        : needsLW && !(params.lengthM && params.widthM)
          ? "dims"
          : undefined;
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

/** "Plot reglabil terasă Kronwald 60–100 mm" → "plot reglabil terasă" (generic words only, brands keep their case). */
function shortName(name: string): string {
  const words = name.split(",")[0].split(" ").slice(0, 3);
  return words.map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w)).join(" ");
}

function stockSentence(q: Quote, lang: Lang): string {
  if (q.availability.allInStock) return lang === "en" ? `Everything is in stock at ${q.storeName}.` : `Totul e pe stoc la ${q.storeName}.`;
  const missing = q.availability.missing.map((m) => shortName(m.name));
  const list = missing.slice(0, 3).join(", ");
  const best = q.availability.alternatives.find((a) => a.allInStock && a.distanceKm <= 60);
  if (best) {
    return lang === "en"
      ? `At ${q.storeName} we're short on ${list}; **${best.name}** (${best.distanceKm} km) has everything — shall I move your list there?`
      : `La ${q.storeName} nu ajunge stocul pentru ${list}; la **${best.name}** (${best.distanceKm} km) e tot — mut lista acolo?`;
  }
  return lang === "en"
    ? `At ${q.storeName} we're short on ${list} — I can swap them for in-stock alternatives or arrange home delivery.`
    : `La ${q.storeName} nu ajunge stocul pentru ${list} — pot găsi alternative pe stoc sau livrare la domiciliu.`;
}

export function projectReply(q: Quote, card: Extract<Card, { kind: "quote" }>, title: string, lang: Lang): string {
  const en = lang === "en";
  const parts: string[] = [];
  parts.push(
    en
      ? `Done — ${title.toLowerCase()} comes to **${lei(q.total, lang)}**${q.discountTotal > 0 ? `, including **${lei(q.discountTotal, lang)}** off from your offers` : ""}.`
      : `Gata — ${title.toLowerCase()} costă **${lei(q.total, lang)}**${q.discountTotal > 0 ? `, cu **${lei(q.discountTotal, lang)}** reducere din ofertele tale` : ""}.`,
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
    const s = [...new Set(card.suggestions.map((x) => shortName(x.name)))].slice(0, 2);
    parts.push(en ? `Optional: ${s.join(" and ")} — want me to add them?` : `Opțional: ${s.join(" și ")} — le adaug?`);
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
  const lang: Lang = /\b(the|want|need|build|building|my|how|what|would|like|please|i'm|i am|with|and|to|for|is)\b/i.test(opts.message)
    ? "en"
    : /[ăâîșțş]|\b(vreau|și|sau|pentru|cum|unde|îmi|imi|doresc|trebuie)\b/i.test(opts.message)
      ? "ro"
      : opts.lang;
  let state: SessionState = { ...opts.state, basket: opts.state.basket ?? [] };
  const ctx = (): ToolContext => ({ sources: opts.sources, customer: opts.customer, state, lang, now: new Date() });
  const status = (tool: string): AgentEvent => ({ type: "status", tool, label: TOOL_STATUS[tool]?.[lang] ?? tool });

  yield { type: "mode", mode: "scripted", reason: opts.reason };
  const intent = parseIntent(opts.message, state);
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
      reply = lang === "en" ? "I couldn't calculate that — could you give me the dimensions again?" : "Nu am putut calcula — îmi mai dai o dată dimensiunile?";
    } else {
      yield status("present_plan");
      await sleep(700);
      yield { type: "card", card: { kind: "plan", id: `plan-${Date.now().toString(36)}`, plan: scriptedPlan(state.project.type, state.project.inputs, lang) } };
      reply = projectReply(quoteCard.quote, quoteCard, state.project.title, lang);
    }
  } else if (intent.kind === "project") {
    reply = askFor(intent.missing!, intent.type, lang);
  } else if (intent.kind === "sketch" && state.project) {
    const blank: Omit<SketchOp, "op"> = {
      zone: null, w: null, d: null, h: null, side: null, align: null, width: null, count: null, value: null,
      kind: null, wall: null, pos: null, id: null, segment: null, length: null, turn: null, key: null,
    };
    const r = yield* runTool("edit_sketch", { edits: intent.edits.map((e) => ({ ...blank, option: null, ...e })) }, 700);
    const ch = r.cards?.find((c): c is Extract<Card, { kind: "change" }> => c.kind === "change")?.change;
    if (!ch) {
      const err = (r.forModel as { error?: string }).error ?? "";
      reply = lang === "en" ? `I couldn't change the sketch that way (${err}). Try another size or side?` : `Nu am putut modifica schița așa (${err}). Încercăm altă dimensiune sau latură?`;
    } else {
      extraAmounts.push(ch.totalBefore, Math.abs(ch.delta), ...ch.lines.map((l) => Math.abs(l.deltaRon)));
      const sign = ch.delta > 0 ? "+" : ch.delta < 0 ? "−" : "±";
      const what = ch.edits.join("; ");
      reply =
        lang === "en"
          ? `Done — ${what.charAt(0).toLowerCase() + what.slice(1)}. I redrew the sketch and recalculated the list, keeping the products you picked: new total **${lei(ch.totalAfter, lang)}** (${sign}${lei(Math.abs(ch.delta), lang)}).`
          : `Gata — ${what.charAt(0).toLowerCase() + what.slice(1)}. Am redesenat schița și am recalculat lista, păstrând produsele alese: total nou **${lei(ch.totalAfter, lang)}** (${sign}${lei(Math.abs(ch.delta), lang)}).`;
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
      what ? (en ? `Here are the **${what.labelEn.toLowerCase()}** — highlighted in the sketch and in your list.` : `Uite **${what.label.toLowerCase()}** — evidențiate pe schiță și în listă.`) : "",
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
    // Light stemming for Romanian articles/plurals: "geotextilul" → "geotextil", "grinzile" → "grinz".
    const stem = (w: string) => (w.length >= 6 ? w.replace(/(urile|ului|elor|ilor|ele|ile|ul|ii|le|a|e|i)$/, "") : w);
    const words = intent.text
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
      .map(stem);
    const hit = (name: string) => words.filter((w) => fold(name).includes(w)).length;
    let op: Record<string, unknown> | null = null;
    let storeId: string | null = null;
    let label = "";
    if (intent.kind === "move") {
      const stores = await opts.sources.stores.list();
      const best = stores.map((st) => ({ st, n: hit(`${st.name} ${st.city}`) })).sort((a, b) => b.n - a.n)[0];
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
            ? `${en ? `Moved your list to **${label}**` : `Am mutat lista la **${label}**`}. ${stockSentence(q.quote, lang)}`
            : intent.kind === "remove"
              ? en ? `Removed ${label} — new total **${lei(q.quote.total, lang)}**${delta}.` : `Am scos ${label} — total nou **${lei(q.quote.total, lang)}**${delta}.`
              : en ? `Switched to ${label}, sized for your project — new total **${lei(q.quote.total, lang)}**${delta}.` : `Am trecut la ${label}, calculat pentru proiectul tău — total nou **${lei(q.quote.total, lang)}**${delta}.`;
      }
    }
  } else if (intent.kind === "add_suggestions" && state.project && state.suggestions?.length) {
    const added = state.suggestions.map((sg) => ({ op: "add", sku: sg.sku, qty: null, withSku: null }));
    const before = await priceBasket(ctx(), state.basket, state.storeId ?? opts.customer.homeStoreId);
    const r = yield* runTool("modify_basket", { operations: added, storeId: null }, 500);
    const q = r.cards?.find((c): c is Extract<Card, { kind: "quote" }> => c.kind === "quote");
    if (q) {
      const diff = Math.round((q.quote.total - before.total) * 100) / 100;
      extraAmounts.push(Math.abs(diff));
      reply =
        lang === "en"
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
      : "";
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
  } else {
    reply =
      lang === "en"
        ? "I'm your DIY project assistant — I can plan a **deck, room painting, laminate floor, bathroom tiling, fence, drywall partition or new lawn**. Tell me what you'd like to do and the rough dimensions."
        : "Sunt asistentul tău pentru proiecte DIY — pot planifica o **terasă, vopsirea unei camere, parchet, placarea băii, un gard, un perete de gips-carton sau gazon nou**. Spune-mi ce vrei să faci și dimensiunile aproximative.";
  }

  yield* streamText(reply);
  const check = verifyReply(reply, lastQuote, extraAmounts);
  if (check.checked > 0) yield { type: "verified", ok: check.ok, checked: check.checked };
  yield { type: "history", items: [...(opts.history ?? []), { role: "user", content: opts.message }, { role: "assistant", content: reply }] };
  yield { type: "done", ms: Date.now() - started };
}
