import type { Card, ProjectSnapshot } from "@/agent/types";
import type { Layout } from "@/domain/layout";
import type { Quote } from "@/domain/quote";
import { fold } from "@/domain/search";
import type { Lang, MaterialRole } from "@/domain/types";
import type { Board } from "./useAgent";

/**
 * Context-aware next steps: the 3–5 quick replies under the conversation, chosen from the
 * project and its state instead of a fixed list ("Adaugă trepte" for a deck without steps,
 * "Mută lista la Berceni" when the home store is short, "Plătesc cu puncte" when points
 * can pay…). Every chip is sent as a normal message, so its text must be understood by the
 * offline agent too (src/agent/scripted.ts parseIntent) — the tests check each one.
 */

export type NextStepKind =
  /** Fixes a problem (stock short at the store) or undoes the last change. */
  | "fix"
  /** Reshapes the sketch (steps, L-shape, gate, corner, wall-tile height…). */
  | "shape"
  /** Shows something on the sketch (a material, the realistic view). */
  | "look"
  /** Changes the list (add a suggestion, another material, cheaper). */
  | "basket"
  /** Points and offers. */
  | "money"
  /** Information (stock map). */
  | "info";

export interface NextStep {
  /** Stable id (for keys and analytics), e.g. "deck.steps", "fix.move". */
  id: string;
  /** Sent to the assistant as the customer's message (and shown on the chip). */
  text: string;
  kind: NextStepKind;
}

export interface NextStepsInput {
  board: Pick<Board, "project" | "quote" | "offers" | "stock">;
  lang: Lang;
  /** Cards produced by the latest assistant turn (what just happened). */
  lastCards?: Card[];
  /** Messages the customer already sent — never suggest the same thing twice. */
  asked?: string[];
  /** Tenant sketch policy: on-demand tenants only draw the 3D when asked. */
  sketchMode?: "auto" | "on_demand";
  max?: number;
}

const MAX_PER_KIND: Record<NextStepKind, number> = { fix: 2, shape: 2, look: 1, basket: 2, money: 2, info: 1 };

/** Keep chip text short: numbers the way the customer would type them. */
const n = (v: number, lang: Lang) => (lang === "en" ? String(v) : String(v).replace(".", ","));
const norm = (s: string) => fold(s).replace(/[^a-z0-9]+/g, " ").trim();

/**
 * The generic words of a product name, without brand or size:
 * "Ferăstrău unghiular Voltmaster 1400 W, disc 210 mm" → "ferăstrău unghiular" (RO: brand after the words),
 * "Voltmaster mitre saw 1400 W, 210 mm blade" → "mitre saw" (EN: brand first).
 */
export function shortProductName(name: string, lang: Lang): string {
  const words = name.split(",")[0].split(/\s+/).filter(Boolean);
  const upper = (w: string) => /^[A-ZĂÂÎȘȚ]/.test(w);
  const acronym = (w: string) => /^[A-Z]{2,}$/.test(w);
  const out: string[] = [];
  for (const [i, w] of words.entries()) {
    if (lang === "en") {
      // Brand, model and power come first ("Voltmaster Pro 1800 W sliding mitre saw"): start at the first
      // plain word, then stop at the size.
      if (!out.length && (upper(w) || /\d/.test(w))) continue;
      if (/\d/.test(w) || (upper(w) && !acronym(w))) break;
    } else if (/\d/.test(w) || (i > 0 && upper(w) && !acronym(w))) {
      // Romanian names put the brand after the generic words ("Ferăstrău unghiular Voltmaster").
      break;
    }
    out.push(w);
    if (out.length === (lang === "en" ? 4 : 3)) break;
  }
  // Trailing connectives read badly ("cutie de").
  while (out.length > 1 && /^(de|cu|din|pentru|la|și|si|for|with|and|of)$/i.test(out[out.length - 1])) out.pop();
  const s = out.join(" ");
  return acronym(out[0] ?? "") ? s : s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * The part of a store's name that tells it apart: "HORNBACH București Berceni" → "Berceni",
 * "HORNBACH Brașov" → "Brașov", "HORNBACH Timișoara 2 Calea Buziașului" → "Timișoara 2 Calea Buziașului".
 */
export function storeShortName(name: string, all: { name: string; city: string }[], city?: string): string {
  // Strip the retailer prefix every store shares.
  const names = all.map((s) => s.name);
  let prefix = names.length > 1 ? names.reduce((p, s) => (s.startsWith(p) ? p : commonPrefix(p, s))) : "";
  prefix = prefix.slice(0, prefix.lastIndexOf(" ") + 1);
  let short = name.startsWith(prefix) ? name.slice(prefix.length) : name;
  // Drop the city when a district follows it ("București Berceni" → "Berceni"), not a number.
  if (city && short.startsWith(`${city} `) && /^[^\d]/.test(short.slice(city.length + 1))) short = short.slice(city.length + 1);
  return short.trim() || name;
}

function commonPrefix(a: string, b: string): string {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return a.slice(0, i);
}

/** A role present in the basket. */
const hasRole = (q: Quote, role: MaterialRole) => q.lines.some((l) => l.role === role);

/** Size of the wing for an "L": about half the side, whole metres, never the full depth (else it's just a bigger rectangle). */
function wing(z: { w: number; d: number }) {
  const w = Math.max(1, Math.min(3, Math.round(z.w / 2)));
  const d = Math.max(1, Math.min(3, Math.round(z.d / 2), Math.floor(z.d - 0.5) || 1));
  return { w, d };
}

function shapeSteps(layout: Layout | undefined, lang: Lang): NextStep[] {
  const en = lang === "en";
  const out: NextStep[] = [];
  if (!layout) return out;
  switch (layout.type) {
    case "deck": {
      if (!layout.steps.length) out.push({ id: "deck.steps", kind: "shape", text: en ? "Add steps" : "Adaugă trepte" });
      if (layout.zones.length === 1) {
        const { w, d } = wing(layout.zones[0]);
        out.push({
          id: "deck.l",
          kind: "shape",
          text: en ? `Make it L-shaped: +${n(w, lang)} × ${n(d, lang)} m on the right` : `Fă-o în L: +${n(w, lang)} × ${n(d, lang)} m în dreapta`,
        });
      }
      break;
    }
    case "fence": {
      if (!layout.gates.length) out.push({ id: "fence.gate", kind: "shape", text: en ? "Add a gate" : "Pune o poartă" });
      if (layout.points.length === 2) {
        const total = Math.hypot(layout.points[1].x - layout.points[0].x, layout.points[1].z - layout.points[0].z);
        const len = Math.max(2, Math.min(10, Math.round(total / 4)));
        out.push({ id: "fence.corner", kind: "shape", text: en ? `Add a ${n(len, lang)} m corner on the right` : `Fă un colț de ${n(len, lang)} m la dreapta` });
      }
      if (layout.heightM > 1.2) out.push({ id: "fence.height", kind: "shape", text: en ? "Make it 1.2 m high" : "Înălțime 1,2 m" });
      else if (layout.heightM < 1.8) out.push({ id: "fence.height", kind: "shape", text: en ? "Make it 1.8 m high" : "Înălțime 1,8 m" });
      break;
    }
    case "tiling": {
      const top = Math.max(...Object.values(layout.wallHeights));
      if (top > 1.2) out.push({ id: "tiling.walls", kind: "shape", text: en ? "Wall tiles only up to 1.2 m" : "Faianță doar până la 1,2 m" });
      break;
    }
    case "paint_room": {
      if (!layout.openings.some((o) => o.kind === "window")) out.push({ id: "paint.window", kind: "shape", text: en ? "Add a window" : "Adaugă o fereastră" });
      break;
    }
    case "drywall_partition": {
      if (!layout.openings.length) out.push({ id: "drywall.door", kind: "shape", text: en ? "Add a door" : "Adaugă o ușă" });
      break;
    }
    case "laminate_floor": {
      if (layout.zones.length === 1) {
        const { w, d } = wing(layout.zones[0]);
        out.push({ id: "laminate.extend", kind: "shape", text: en ? `Extend the floor by ${n(w, lang)} × ${n(d, lang)} m on the right` : `Extinde parchetul cu ${n(w, lang)} × ${n(d, lang)} m în dreapta` });
      }
      break;
    }
    case "lawn": {
      if (layout.zones.length === 1) {
        const { w, d } = wing(layout.zones[0]);
        out.push({ id: "lawn.extend", kind: "shape", text: en ? `Extend the lawn by ${n(w, lang)} × ${n(d, lang)} m on the right` : `Extinde gazonul cu ${n(w, lang)} × ${n(d, lang)} m în dreapta` });
      }
      break;
    }
  }
  return out;
}

/** The structural material worth seeing in the sketch, per project (only if it's on the list). */
const LOOK: Partial<Record<ProjectSnapshot["type"], { role: MaterialRole; ro: string; en: string }[]>> = {
  deck: [{ role: "deck_joist", ro: "Arată-mi grinzile", en: "Show me the joists" }],
  fence: [{ role: "fence_post", ro: "Arată-mi stâlpii", en: "Show me the posts" }],
  tiling: [
    { role: "waterproofing", ro: "Arată-mi hidroizolația", en: "Show me the waterproofing" },
    { role: "wall_tiles", ro: "Arată-mi faianța", en: "Show me the wall tiles" },
  ],
  laminate_floor: [{ role: "skirting_board", ro: "Arată-mi plintele", en: "Show me the skirting" }],
  drywall_partition: [{ role: "cw_profile", ro: "Arată-mi montanții", en: "Show me the studs" }],
  paint_room: [{ role: "interior_paint", ro: "Arată-mi vopseaua", en: "Show me the paint" }],
  lawn: [{ role: "topsoil", ro: "Arată-mi pământul", en: "Show me the topsoil" }],
};

export function nextSteps({ board, lang, lastCards = [], asked = [], sketchMode = "auto", max = 5 }: NextStepsInput): NextStep[] {
  const en = lang === "en";
  const quoteCard = board.quote;
  const q = quoteCard?.quote;
  if (!q) return [];
  const project = board.project?.project;
  const candidates: NextStep[] = [];
  const justChanged = lastCards.some((c) => c.kind === "change");
  const justShown = new Set(lastCards.map((c) => c.kind));

  // 1 · Fix what's wrong: something is short at the chosen store.
  const alternatives = q.availability.alternatives;
  const best = q.availability.allInStock ? undefined : alternatives.find((a) => a.allInStock && a.distanceKm <= 60 && a.storeId !== q.storeId);
  if (best) {
    const short = storeShortName(best.name, alternatives, best.city);
    candidates.push({ id: "fix.move", kind: "fix", text: en ? `Move my list to ${short}` : `Mută lista la ${short}` });
  }
  // …or step back from a change that just happened.
  if (justChanged && project) candidates.push({ id: "fix.undo", kind: "fix", text: en ? "Undo" : "Anulează" });

  // 2 · Reshape the project.
  const shapes = project ? shapeSteps(project.layout, lang) : [];
  if (shapes[0]) candidates.push(shapes[0]);

  // 3 · Extras the assistant offered, then another material for the main job.
  const suggestion = quoteCard.suggestions[0];
  if (suggestion) {
    const what = shortProductName(suggestion.name, lang);
    candidates.push({ id: "basket.add", kind: "basket", text: en ? `Add the ${what}` : `Adaugă ${what}` });
  }
  const boards = quoteCard.choices?.find((g) => g.role === "deck_board");
  const currentBoard = q.lines.find((l) => l.role === "deck_board");
  if (project?.type === "deck" && boards && currentBoard && !/wpc/i.test(currentBoard.name) && boards.options.some((o) => /wpc/i.test(o.name))) {
    candidates.push({ id: "basket.wpc", kind: "basket", text: en ? "Switch to WPC decking" : "Alege deck din WPC" });
  }

  // 4 · Show something on the sketch.
  if (project) {
    const look = (LOOK[project.type] ?? []).find((l) => hasRole(q, l.role));
    if (sketchMode === "on_demand" && !project.sketched) {
      candidates.push({ id: "look.real", kind: "look", text: en ? "Show me the real view" : "Arată-mi-o în vedere reală" });
    } else if (look) {
      candidates.push({ id: `look.${look.role}`, kind: "look", text: en ? look.en : look.ro });
    }
  }
  if (shapes[1]) candidates.push(shapes[1]);

  // 5 · Money: points, a cheaper version, offers.
  if (q.points.redeemablePoints > 0) candidates.push({ id: "money.points", kind: "money", text: en ? "Pay with my points" : "Plătesc cu puncte" });
  if ((quoteCard.quality ?? "standard") !== "budget") candidates.push({ id: "basket.cheaper", kind: "basket", text: en ? "Cheaper option" : "Variantă mai ieftină" });
  else candidates.push({ id: "basket.premium", kind: "basket", text: en ? "Go premium" : "Vreau premium" });
  if (!board.offers && !justShown.has("offers")) candidates.push({ id: "money.offers", kind: "money", text: en ? "What offers do I have?" : "Ce oferte am?" });
  if (!q.availability.allInStock && !best && !justShown.has("stock")) {
    candidates.push({ id: "info.stock", kind: "info", text: en ? "Where is everything in stock?" : "Unde e totul pe stoc?" });
  }

  // Never the same thing twice; respect per-kind caps so one kind can't crowd the rest out.
  const sent = new Set(asked.map(norm));
  const used: Partial<Record<NextStepKind, number>> = {};
  const out: NextStep[] = [];
  for (const c of candidates) {
    if (out.length >= max) break;
    if (sent.has(norm(c.text)) || out.some((o) => o.id === c.id)) continue;
    if ((used[c.kind] ?? 0) >= MAX_PER_KIND[c.kind]) continue;
    used[c.kind] = (used[c.kind] ?? 0) + 1;
    out.push(c);
  }
  return out;
}
