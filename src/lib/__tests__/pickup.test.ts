import { describe, expect, it } from "vitest";
import { getDataSources } from "@/adapters";
import { executeTool } from "@/agent/tools";
import type { Card } from "@/agent/types";
import { getTenant } from "@/config/tenant";
import { STORES } from "@/data/stores";
import { DEFAULT_HOURS, dayLabel, formatHours, heldUntil, parseOpeningHours, pickupSlots, reservationCode, slotLabel, slotTime, storeCheck } from "../pickup";

const STANDARD = "L–S 07:00–21:00, D 09:00–19:00";
// 2026-09-29 is a Tuesday. Local time on purpose: slots are in the customer's own time.
const at = (day: number, h: number, m = 0) => new Date(2026, 8, day, h, m);

describe("parseOpeningHours", () => {
  it("reads the Romanian store signage", () => {
    const w = parseOpeningHours(STANDARD);
    expect(w[1]).toEqual({ open: 420, close: 1260 });
    expect(w[6]).toEqual({ open: 420, close: 1260 });
    expect(w[0]).toEqual({ open: 540, close: 1140 });
  });

  it("closed days stay closed; English day names work", () => {
    const w = parseOpeningHours("Mon-Fri 08:00-20:00, Sat 08:00-14:00");
    expect(w[0]).toBeNull();
    expect(w[5]).toEqual({ open: 480, close: 1200 });
    expect(w[6]).toEqual({ open: 480, close: 840 });
  });

  it("falls back to 08–20 every day", () => {
    expect(parseOpeningHours(undefined)).toEqual(Array(7).fill(DEFAULT_HOURS));
    expect(parseOpeningHours("nonstop, sună-ne")).toEqual(Array(7).fill(DEFAULT_HOURS));
  });

  it("writes the hours back in the customer's language", () => {
    expect(formatHours(parseOpeningHours(STANDARD), "ro")).toBe("L–S 07:00–21:00, D 09:00–19:00");
    expect(formatHours(parseOpeningHours(STANDARD), "en")).toBe("Mon–Sat 07:00–21:00, Sun 09:00–19:00");
    expect(formatHours(parseOpeningHours("L–V 08:00–20:00, S 08:00–14:00"), "en")).toBe("Mon–Fri 08:00–20:00, Sat 08:00–14:00");
    expect(formatHours(parseOpeningHours(undefined), "ro")).toBe("L–D 08:00–20:00");
  });

  it("every demo store has readable hours", () => {
    for (const s of STORES) expect(parseOpeningHours(s.openingHours).filter(Boolean).length, s.id).toBe(7);
  });
});

describe("pickupSlots", () => {
  const week = parseOpeningHours(STANDARD);

  it("today: 2-hour windows from when the order can be ready; tomorrow: from opening", () => {
    const slots = pickupSlots(at(29, 10, 30), week);
    const today = slots.filter((s) => s.dayOffset === 0).map(slotTime);
    const tomorrow = slots.filter((s) => s.dayOffset === 1).map(slotTime);
    expect(today).toEqual(["13:00–15:00", "15:00–17:00", "17:00–19:00", "19:00–21:00"]);
    expect(tomorrow).toEqual(["07:00–09:00", "09:00–11:00", "11:00–13:00", "13:00–15:00", "15:00–17:00", "17:00–19:00", "19:00–21:00"]);
    expect(slots.every((s) => s.end.getTime() - s.start.getTime() === 2 * 3600 * 1000)).toBe(true);
  });

  it("before opening, today starts at opening time", () => {
    expect(slotTime(pickupSlots(at(29, 5, 0), week)[0])).toBe("07:00–09:00");
  });

  it("too late for today: tomorrow and the day after, with Sunday hours", () => {
    const slots = pickupSlots(at(26, 20, 0), week); // Saturday evening
    expect(slots.some((s) => s.dayOffset === 0)).toBe(false);
    expect(slots.filter((s) => s.dayOffset === 1).map(slotTime)).toEqual(["09:00–11:00", "11:00–13:00", "13:00–15:00", "15:00–17:00", "17:00–19:00"]);
    expect(slots.filter((s) => s.dayOffset === 2)[0] && slotTime(slots.filter((s) => s.dayOffset === 2)[0])).toBe("07:00–09:00");
  });

  it("skips closed days", () => {
    const w = parseOpeningHours("L–V 08:00–20:00, S 08:00–14:00");
    const slots = pickupSlots(at(26, 13, 0), w); // Saturday 13:00, closed on Sunday
    expect(slots[0].dayOffset).toBe(2);
    expect(dayLabel(2, slots[0].start, "ro")).toBe("Luni");
    expect(dayLabel(2, slots[0].start, "en")).toBe("Monday");
  });

  it("labels", () => {
    const [first] = pickupSlots(at(29, 22, 0), week);
    expect(slotLabel(first, "ro")).toBe("Mâine, 07:00–09:00");
    expect(slotLabel(first, "en")).toBe("Tomorrow, 07:00–09:00");
  });

  it("holds the goods until the next open day's closing time", () => {
    const [first] = pickupSlots(at(29, 10, 30), week);
    expect(heldUntil(first, week)).toEqual(at(30, 21, 0));
    const sat = pickupSlots(at(26, 8, 0), week)[0];
    expect(heldUntil(sat, week)).toEqual(at(27, 19, 0)); // Sunday closes at 19:00
  });
});

describe("reservation code and store check", () => {
  it("is deterministic and readable", () => {
    const [slot] = pickupSlots(at(29, 10, 30), parseOpeningHours(STANDARD));
    const a = reservationCode("buc-berceni", [{ sku: "1", qty: 2 }], slot);
    expect(a).toMatch(/^RZ-BER-[2-9A-HJ-NP-Z]{5}$/);
    expect(reservationCode("buc-berceni", [{ sku: "1", qty: 2 }], slot)).toBe(a);
    expect(reservationCode("buc-berceni", [{ sku: "1", qty: 3 }], slot)).not.toBe(a);
  });

  it("flags lines short at the store with the nearest store that has everything", async () => {
    const tenant = getTenant("hornbach");
    const sources = getDataSources(tenant.id);
    const customer = (await sources.loyalty.getMember("WL-RO-100231"))!;
    const r = await executeTool(
      "calculate_project",
      JSON.stringify({ projectType: "deck", params: { lengthM: 4, widthM: 3 }, quality: null, storeId: null, includeOptional: null, keepSketch: null }),
      { sources, customer, state: { basket: [] }, lang: "ro", now: new Date(), tenant },
    );
    const quote = r.cards!.find((c): c is Extract<Card, { kind: "quote" }> => c.kind === "quote")!.quote;
    const check = storeCheck(quote);
    // The demo deck is short on pedestals at Militari; Berceni has everything.
    expect(check.short.length).toBeGreaterThan(0);
    expect(check.short.every((m) => m.available < m.needed)).toBe(true);
    expect(check.nearest?.storeId).toBe("buc-berceni");
  });
});
