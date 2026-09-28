import { describe, expect, it } from "vitest";
import { calculateProject } from "../calculators";
import { barsForMembers, resolveRequirements } from "../resolve";
import type { Requirement } from "../types";
import { product } from "./fixtures";

/**
 * QA 2026-09-28: a 4 × 3 m deck needs 11 joists of 3 m (the sketch and the plan say so), but the list sold
 * 34.65 m ÷ 4 m = 9 bars — each 4 m bar gives one 3 m joist and a 1 m offcut, so the customer came up 2 short.
 */
describe("structural members are counted as bars, not metres", () => {
  it("one member per bar when the offcut is too short for another", () => {
    expect(barsForMembers([{ count: 11, lengthM: 3 }], 4)).toBe(11);
    expect(barsForMembers([{ count: 6, lengthM: 2 }], 4)).toBe(3); // two 2 m joists per 4 m bar
    expect(barsForMembers([{ count: 11, lengthM: 3 }, { count: 6, lengthM: 2 }], 4)).toBe(14);
  });

  it("members longer than the bar are spliced over supports: count by metres", () => {
    expect(barsForMembers([{ count: 16, lengthM: 5 }], 4)).toBe(21);
  });

  it("the calculators describe joists and studs as members", () => {
    const deck = calculateProject("deck", { lengthM: 4, widthM: 3 });
    expect(deck.requirements.find((r) => r.role === "deck_joist")?.members).toEqual([{ count: 11, lengthM: 3 }]);
    const wall = calculateProject("drywall_partition", { lengthM: 3.5, heightM: 2.8, doors: 1 });
    expect(wall.requirements.find((r) => r.role === "cw_profile")?.members).toEqual([{ count: 9, lengthM: 2.8 }]);
    // step stringers are members too (one per 60 cm of step width + 2, as long as the flight)
    const steps = calculateProject("deck", { lengthM: 4, widthM: 3, steps: [{ zone: "A", side: "s", width: 1.5, count: 3 }] });
    expect(steps.requirements.find((r) => r.role === "deck_joist")?.members).toEqual([{ count: 11, lengthM: 3 }, { count: 4, lengthM: 1.13 }]);
  });

  it("buys joists as whole bars and studs only in lengths that reach the ceiling", () => {
    const joist4 = product({ name: "Grindă 45 × 70 mm, 4 m", roles: ["deck_joist"], price: 90, content: { amount: 4, unit: "m" } });
    const joists: Requirement = { role: "deck_joist", quantity: 34.65, unit: "m", basis: "", members: [{ count: 11, lengthM: 3 }] };
    expect(resolveRequirements([joists], [joist4]).lines[0].qty).toBe(11);

    const cw26 = product({ name: "Profil CW 50, 2,6 m", roles: ["cw_profile"], price: 16.9, content: { amount: 2.6, unit: "m" } });
    const cw3 = product({ name: "Profil CW 50, 3 m", roles: ["cw_profile"], price: 18.9, content: { amount: 3, unit: "m" } });
    const studs = (h: number, n: number): Requirement => ({ role: "cw_profile", quantity: n * h * 1.05, unit: "m", basis: "", members: [{ count: n, lengthM: h }] });
    // 2.8 m wall: a 2.6 m stud is too short whatever the total metres say
    expect(resolveRequirements([studs(2.8, 10)], [cw26, cw3]).lines).toEqual([expect.objectContaining({ sku: cw3.sku, qty: 10 })]);
    // 2.6 m wall: the cheaper exact length, one per stud
    expect(resolveRequirements([studs(2.6, 9)], [cw26, cw3]).lines).toEqual([expect.objectContaining({ sku: cw26.sku, qty: 9 })]);
  });
});
