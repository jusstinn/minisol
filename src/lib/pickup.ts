import type { Quote, StoreAvailability } from "@/domain/quote";
import type { Lang } from "@/domain/types";

/**
 * Click & Collect (demo): pick-up slots from the store's opening hours, availability of the list
 * at that store, a reservation code and how long the goods are held. Pure — times are the
 * customer's local time (the store's, for a Romanian customer).
 */

/** Minutes from midnight. */
export interface DayHours {
  open: number;
  close: number;
}
/** Index = `Date.getDay()` (0 = Sunday); null = closed. */
export type WeekHours = (DayHours | null)[];

export const DEFAULT_HOURS: DayHours = { open: 8 * 60, close: 20 * 60 };

const DAY_TOKENS: Record<string, number> = {
  // Romanian store signage: L Ma Mi J V S D (also written out)
  l: 1, lu: 1, luni: 1, ma: 2, marti: 2, mi: 3, miercuri: 3, j: 4, joi: 4, v: 5, vi: 5, vineri: 5, s: 6, sa: 6, sambata: 6, d: 0, du: 0, duminica: 0,
  // English
  mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0,
};

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[șş]/g, "s")
    .replace(/[țţ]/g, "t");

/**
 * "L–S 07:00–21:00, D 09:00–19:00" → hours per weekday. Days not mentioned are closed;
 * an empty or unreadable string means 08:00–20:00 every day.
 */
export function parseOpeningHours(text?: string): WeekHours {
  const week: WeekHours = [null, null, null, null, null, null, null];
  let any = false;
  for (const part of (text ?? "").split(/[,;]/)) {
    const m = fold(part).match(/^\s*([a-z]+)\.?(?:\s*[–—-]\s*([a-z]+)\.?)?\s+(\d{1,2})[:.](\d{2})\s*[–—-]\s*(\d{1,2})[:.](\d{2})/);
    if (!m) continue;
    const from = DAY_TOKENS[m[1]];
    const to = m[2] ? DAY_TOKENS[m[2]] : from;
    if (from === undefined || to === undefined) continue;
    const hours = { open: Number(m[3]) * 60 + Number(m[4]), close: Number(m[5]) * 60 + Number(m[6]) };
    if (hours.close <= hours.open) continue;
    // Monday-first ranges ("L–S"), wrapping over Sunday if needed.
    for (let d = from, n = 0; n < 7; d = (d + 1) % 7, n++) {
      week[d] = hours;
      any = true;
      if (d === to) break;
    }
  }
  return any ? week : week.map(() => DEFAULT_HOURS);
}

export interface PickupSlot {
  id: string;
  /** 0 = today, 1 = tomorrow, … */
  dayOffset: number;
  start: Date;
  end: Date;
}

const atMinutes = (day: Date, minutes: number) => {
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
  d.setMinutes(minutes);
  return d;
};

/**
 * Two-hour pick-up windows for today and the next open day. The order is ready `leadMin` after
 * it's placed (rounded up to the hour), windows start at the opening time (today: at the first
 * full hour the order can be ready) and must end by closing time.
 */
export function pickupSlots(now: Date, week: WeekHours, opts: { leadMin?: number; slotMin?: number; days?: number } = {}): PickupSlot[] {
  const lead = opts.leadMin ?? 120;
  const len = opts.slotMin ?? 120;
  const wantDays = opts.days ?? 2;
  const out: PickupSlot[] = [];
  let daysWithSlots = 0;
  for (let offset = 0; offset < 8 && daysWithSlots < wantDays; offset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const h = week[day.getDay()];
    if (!h) continue;
    let start = h.open;
    if (offset === 0) {
      const ready = now.getHours() * 60 + now.getMinutes() + lead;
      start = Math.max(h.open, Math.ceil(ready / 60) * 60);
    }
    let n = 0;
    for (let s = start; s + len <= h.close; s += len) {
      const st = atMinutes(day, s);
      out.push({ id: `${offset}-${s}`, dayOffset: offset, start: st, end: atMinutes(day, s + len) });
      n++;
    }
    if (n) daysWithSlots++;
  }
  return out;
}

/** Reserved goods wait until closing time of the next open day after pick-up. */
export function heldUntil(slot: PickupSlot, week: WeekHours): Date {
  for (let i = 1; i <= 7; i++) {
    const day = new Date(slot.start.getFullYear(), slot.start.getMonth(), slot.start.getDate() + i);
    const h = week[day.getDay()];
    if (h) return atMinutes(day, h.close);
  }
  return new Date(slot.end.getTime() + 24 * 3600 * 1000);
}

/** "RZ-BER-7K2QD": the store and a checksum of the list and the slot (demo — no backend). */
export function reservationCode(storeId: string, items: { sku: string; qty: number }[], slot: PickupSlot): string {
  const key = `${storeId}|${items.map((i) => `${i.sku}x${i.qty}`).join(",")}|${slot.start.getTime()}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";
  let v = h >>> 0;
  for (let i = 0; i < 5; i++) {
    code += alphabet[v % 32];
    v = Math.floor(v / 32);
  }
  const place = (storeId.split("-").pop() ?? storeId).replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase().padEnd(3, "X");
  return `RZ-${place}-${code}`;
}

export interface StoreCheck {
  /** Lines short at the chosen store. */
  short: Quote["availability"]["missing"];
  /** Nearest other store with the whole list (within `maxKm`). */
  nearest?: StoreAvailability;
}

/** What can't be picked up at the chosen store, and the nearest store that has everything. */
export function storeCheck(quote: Quote, maxKm = 60): StoreCheck {
  const short = quote.availability.missing;
  if (!short.length) return { short };
  const nearest = quote.availability.alternatives.filter((a) => a.storeId !== quote.storeId && a.allInStock && a.distanceKm <= maxKm).sort((a, b) => a.distanceKm - b.distanceKm)[0];
  return { short, nearest };
}

// ───────────── labels ─────────────

const locale = (lang: Lang) => (lang === "en" ? "en-GB" : "ro-RO");
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

export const slotTime = (s: PickupSlot) => `${hhmm(s.start)}–${hhmm(s.end)}`;

const DAY_SHORT = { ro: ["D", "L", "Ma", "Mi", "J", "V", "S"], en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] } as const;
const mm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Opening hours in the customer's language, Monday first: "L–S 07:00–21:00, D 09:00–19:00" / "Mon–Sat 07:00–21:00, Sun 09:00–19:00". */
export function formatHours(week: WeekHours, lang: Lang): string {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const same = (a: DayHours | null, b: DayHours | null) => (a && b ? a.open === b.open && a.close === b.close : a === b);
  const runs: { from: number; to: number; h: DayHours }[] = [];
  for (const d of order) {
    const h = week[d];
    if (!h) continue;
    const last = runs[runs.length - 1];
    if (last && same(week[last.to], h) && order.indexOf(d) === order.indexOf(last.to) + 1) last.to = d;
    else runs.push({ from: d, to: d, h });
  }
  const names = DAY_SHORT[lang];
  return runs.map((r) => `${names[r.from]}${r.from === r.to ? "" : `–${names[r.to]}`} ${mm(r.h.open)}–${mm(r.h.close)}`).join(", ");
}

export function dayLabel(offset: number, date: Date, lang: Lang): string {
  if (offset === 0) return lang === "en" ? "Today" : "Azi";
  if (offset === 1) return lang === "en" ? "Tomorrow" : "Mâine";
  const w = date.toLocaleDateString(locale(lang), { weekday: "long" });
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/** "Mâine, 09:00–11:00" */
export const slotLabel = (s: PickupSlot, lang: Lang) => `${dayLabel(s.dayOffset, s.start, lang)}, ${slotTime(s)}`;

/** "joi, 1 octombrie, 21:00" */
export function dateTimeLabel(d: Date, lang: Lang): string {
  return `${d.toLocaleDateString(locale(lang), { weekday: "long", day: "numeric", month: "long" })}, ${hhmm(d)}`;
}
