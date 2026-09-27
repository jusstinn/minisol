import { describe, expect, it } from "vitest";
import { CalculatorInputError, PROJECT_TYPES, calculateProject } from "../calculators";
import { MATERIAL_ROLES } from "../types";

const req = (r: ReturnType<typeof calculateProject>, role: string) => r.requirements.find((x) => x.role === role);

describe("paint_room", () => {
  it("computes wall + ceiling area minus openings", () => {
    const r = calculateProject("paint_room", { lengthM: 4, widthM: 3.5, heightM: 2.6 });
    // walls: 2*(4+3.5)*2.6 = 39 − door 1.89 − window 1.8 = 35.31; ceiling 14
    expect(r.measurements.find((m) => m.unit === "m²" && m.value === 49.31)).toBeTruthy();
    const p = req(r, "interior_paint")!;
    expect(p.areaToCover).toBeCloseTo(49.31 * 2 * 1.1, 1);
    expect(p.unit).toBe("l");
  });

  it("forces 3 coats and a primer when going dark to light", () => {
    const r = calculateProject("paint_room", { lengthM: 3, widthM: 3, surface: "dark_to_light" });
    expect(r.inputs.coats).toBe(3);
    expect(req(r, "primer")!.optional).toBeFalsy();
  });

  it("rejects missing/invalid dimensions", () => {
    expect(() => calculateProject("paint_room", { lengthM: 4 })).toThrow(CalculatorInputError);
    expect(() => calculateProject("paint_room", { lengthM: -2, widthM: 3 })).toThrow(CalculatorInputError);
    expect(() => calculateProject("paint_room", { lengthM: 4000, widthM: 3 })).toThrow(CalculatorInputError);
  });

  it("accepts comma decimals from Romanian users", () => {
    const r = calculateProject("paint_room", { lengthM: "4,5", widthM: "3" });
    expect(r.inputs.lengthM).toBe(4.5);
  });
});

describe("laminate_floor", () => {
  it("adds 7% waste straight, 12% diagonal, vapour barrier on concrete", () => {
    const s = calculateProject("laminate_floor", { lengthM: 5, widthM: 4 });
    expect(req(s, "laminate")!.quantity).toBeCloseTo(21.4, 2);
    expect(req(s, "vapor_barrier")).toBeTruthy();
    const d = calculateProject("laminate_floor", { lengthM: 5, widthM: 4, pattern: "diagonal", subfloor: "wood" });
    expect(req(d, "laminate")!.quantity).toBeCloseTo(22.4, 2);
    expect(req(d, "vapor_barrier")).toBeUndefined();
  });

  it("skirting = perimeter minus doorways + 8%", () => {
    const r = calculateProject("laminate_floor", { lengthM: 5, widthM: 4, doorways: 2 });
    expect(req(r, "skirting_board")!.quantity).toBeCloseTo((18 - 1.8) * 1.08, 2);
    expect(req(r, "transition_profile")!.quantity).toBe(2);
  });
});

describe("tiling", () => {
  it("bathroom includes waterproofing and wall tiles to 2.1 m by default", () => {
    const r = calculateProject("tiling", { lengthM: 2.5, widthM: 2, roomType: "bathroom" });
    expect(req(r, "waterproofing")).toBeTruthy();
    expect(req(r, "wall_tiles")).toBeTruthy();
    expect(req(r, "floor_tiles")!.quantity).toBeCloseTo(5 * 1.1, 2);
  });

  it("kitchen without wall height tiles only the floor", () => {
    const r = calculateProject("tiling", { lengthM: 4, widthM: 3, roomType: "kitchen" });
    expect(req(r, "wall_tiles")).toBeUndefined();
    expect(req(r, "waterproofing")).toBeUndefined();
  });

  it("throws when there is nothing to tile", () => {
    expect(() => calculateProject("tiling", { lengthM: 2, widthM: 2, roomType: "other", tileFloor: false })).toThrow();
  });
});

describe("deck", () => {
  it("counts rows, joists, screws and supports", () => {
    const r = calculateProject("deck", { lengthM: 4, widthM: 3 });
    // rows = ceil(3 / 0.15) = 20; joists = ceil(4 / 0.4) + 1 = 11
    expect(req(r, "deck_board")!.quantity).toBeCloseTo(20 * 4 * 1.1, 2);
    expect(req(r, "deck_joist")!.quantity).toBeCloseTo(11 * 3 * 1.05, 2);
    expect(req(r, "deck_screws")!.quantity).toBe(484); // 20 × 11 × 2 × 1.1 (no float round-up)
    expect(req(r, "deck_support")!.quantity).toBe(11 * (Math.ceil(3 / 0.6) + 1));
    expect(req(r, "weed_membrane")).toBeTruthy();
  });

  it("no weed membrane on a concrete slab", () => {
    const r = calculateProject("deck", { lengthM: 4, widthM: 3, base: "concrete_slab" });
    expect(req(r, "weed_membrane")).toBeUndefined();
  });
});

describe("fence", () => {
  it("panels + posts + concrete, height snapped to standard", () => {
    const r = calculateProject("fence", { lengthM: 20, heightM: 1.7 });
    expect(req(r, "fence_panel")!.quantity).toBe(11);
    expect(req(r, "fence_post")!.quantity).toBe(12);
    expect(req(r, "post_concrete")!.quantity).toBe(12 * 30);
    expect(r.inputs.heightM).toBe(1.8);
    expect(req(r, "fence_panel")!.match).toEqual({ heightM: 1.8 });
  });
});

describe("drywall_partition", () => {
  it("boards both sides with studs every 60 cm", () => {
    const r = calculateProject("drywall_partition", { lengthM: 3, heightM: 2.5 });
    expect(req(r, "drywall_board")!.quantity).toBeCloseTo(7.5 * 2 * 1.1, 2);
    expect(req(r, "cw_profile")!.quantity).toBeCloseTo(6 * 2.5 * 1.05, 2);
    expect(req(r, "mineral_wool")).toBeTruthy();
  });
});

describe("lawn", () => {
  it("new lawn needs topsoil; overseed does not", () => {
    const n = calculateProject("lawn", { areaM2: 100 });
    expect(req(n, "topsoil")!.quantity).toBe(2000);
    const o = calculateProject("lawn", { areaM2: 100, mode: "overseed" });
    expect(req(o, "topsoil")).toBeUndefined();
  });
});

describe("all calculators", () => {
  it.each(PROJECT_TYPES)("%s returns well-formed requirements in both languages", (type) => {
    const params = { lengthM: 4, widthM: 3, areaM2: 50 };
    for (const lang of ["ro", "en"] as const) {
      const r = calculateProject(type, params, lang);
      expect(r.requirements.length).toBeGreaterThan(3);
      for (const q of r.requirements) {
        expect(MATERIAL_ROLES[q.role]).toBeTruthy();
        expect(q.unit).toBe(MATERIAL_ROLES[q.role].unit);
        expect(q.quantity).toBeGreaterThan(0);
        expect(q.basis.length).toBeGreaterThan(0);
      }
      expect(r.estimate.hoursMax).toBeGreaterThanOrEqual(r.estimate.hoursMin);
    }
  });
});
