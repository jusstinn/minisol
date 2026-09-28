import type { DataSources } from "@/adapters/types";
import type { Tenant } from "@/config/tenant";
import type { ProjectType } from "@/domain/calculators";
import type { Quote } from "@/domain/quote";
import { fold } from "@/domain/search";
import type { Customer, Lang, QualityTier } from "@/domain/types";
import type { SketchOp, Side } from "@/domain/layout";
import { lei, int } from "@/lib/format";
import { scriptedPlan } from "./scripted-plans";
import { TOOL_STATUS, executeTool } from "./tools";
import type { ToolContext } from "./tools";
import type { AgentEvent, Card, SessionState } from "./types";
import { verifyReply } from "./verify";

/**
 * Offline demo agent: no LLM. Parses the request with rules, runs the SAME tools
 * as the live agent (so every number is real), uses hand-written plans and writes
 * the reply from the quote. Used when the model is unavailable/rate-limited, for
 * key-less deployments, and for bullet-proof pitch demos.
 */

type Intent =
  | { kind: "project"; type: ProjectType; params: Record<string, unknown>; quality?: QualityTier; missing?: string }
  | { kind: "sketch"; edits: Partial<SketchOp>[] }
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

  // Reshaping the current project ("add steps", "a gate in the middle") is an edit, not a new project.
  if (state.project && (!type || type === state.project.type)) {
    const edits = parseSketchEdit(t, state.project.type);
    if (edits) return { kind: "sketch", edits };
  }

  if (!type && state.project) {
    if (quality) return { kind: "requality", quality };
    if (/\b(ofert\w*|offer\w*|reducer\w*|discount\w*|cupon\w*)\b/.test(t)) return { kind: "offers" };
    if (/\b(stoc\w*|stock|unde|where|magazin\w*|store\w*)\b/.test(t)) return { kind: "stock" };
    if (/\b(sugest\w*|suggest\w*|adaug\w*|add)\b/.test(t)) return { kind: "add_suggestions" };
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
