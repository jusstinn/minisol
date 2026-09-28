import { describe, expect, it } from "vitest";
import { CalculatorInputError, calculateProject } from "../calculators";

/** QA 2026-09-28 regressions. */
describe("calculator texts", () => {
  it("Romanian bases use a decimal comma ('49,3 m² × 2 straturi', not '49.3')", () => {
    const paint = calculateProject("paint_room", { lengthM: 4, widthM: 3.5 }, "ro");
    expect(paint.requirements.find((r) => r.role === "interior_paint")?.basis).toBe("49,3 m² × 2 straturi");
    const wall = calculateProject("drywall_partition", { lengthM: 3.5, heightM: 2.8, doors: 1 }, "ro");
    expect(wall.requirements.find((r) => r.role === "cw_profile")?.basis).toBe("9 montanți × 2,8 m");
    const fence = calculateProject("fence", { lengthM: 20.5, heightM: 1.2 }, "ro");
    expect(fence.assumptions.join(" ")).toContain("înălțime 1,2 m");
    expect(fence.requirements.find((r) => r.role === "fence_panel")?.basis).toBe("20,5 m ÷ 1,89 m");
    expect(wall.assumptions[0]).toBe("Placare pe ambele fețe, un strat, montanți la 60 cm, 10% pierderi la plăci."); // not "1 strat(uri)"
    // English keeps the point
    expect(calculateProject("paint_room", { lengthM: 4, widthM: 3.5 }, "en").requirements.find((r) => r.role === "interior_paint")?.basis).toBe("49.3 m² × 2 coats");
  });
});

describe("drywall doors must fit in the wall", () => {
  it("rejects more door than wall instead of listing studs for a wall with no boards", () => {
    expect(() => calculateProject("drywall_partition", { lengthM: 1, heightM: 2.6, doors: 2 })).toThrow(CalculatorInputError);
    expect(() => calculateProject("drywall_partition", { lengthM: 0.6, heightM: 2.6, doors: 1 })).toThrow(CalculatorInputError);
    expect(calculateProject("drywall_partition", { lengthM: 1.1, heightM: 2.6, doors: 1 }).requirements.some((r) => r.role === "drywall_board")).toBe(true);
  });
});
