import { describe, expect, it } from "vitest";
import { DEMO_CATALOG } from "@/adapters/demo";
import { nameDiameterLength, sketchOf, specPair, specRange } from "../sketch";
import type { AreaYield, SketchSpec } from "../sketch";
import type { Product } from "../types";

const bySku = (sku: string) => {
  const p = DEMO_CATALOG.find((x) => x.sku === sku);
  if (!p) throw new Error(`missing ${sku}`);
  return p;
};
const first = (pred: (p: Product) => boolean) => {
  const p = DEMO_CATALOG.find(pred);
  if (!p) throw new Error("no product matches");
  return p;
};

/** Every number a product's data can justify: numeric specs, numbers inside spec strings, content, the name's "d × L mm". */
function sourceNumbers(p: Product): number[] {
  const out: number[] = [p.content.amount];
  for (const v of Object.values(p.specs)) {
    if (typeof v === "number") out.push(v);
    else if (typeof v === "string") for (const m of v.matchAll(/\d+(?:[.,]\d+)?/g)) out.push(Number(m[0].replace(",", ".")));
  }
  const dl = nameDiameterLength(p.name);
  if (dl) out.push(...dl);
  // Unit conversions to millimetres (m → mm, cm → mm).
  return out.flatMap((n) => [n, n * 10, n * 1000]);
}

const near = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));

/** All numeric leaves of a sketch, except the computed yield figures (checked separately). */
function numbersIn(sketch: SketchSpec): { path: string; value: number }[] {
  const out: { path: string; value: number }[] = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === "number") out.push({ path, value: v });
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        if (path.endsWith("yield") && (k === "min" || k === "max") && (v as AreaYield).kind === "area") continue;
        walk(x, path ? `${path}.${k}` : k);
      }
    }
  };
  walk(sketch, "");
  return out;
}

function checkYield(p: Product, y: AreaYield) {
  expect(y.min).toBeGreaterThan(0);
  expect(y.max).toBeGreaterThanOrEqual(y.min);
  if (!y.calc) {
    // Sold by area: the yield is the pack's own m².
    expect(sourceNumbers(p).some((n) => near(n, y.min))).toBe(true);
    return;
  }
  const { op, amount, rateMin, rateMax } = y.calc;
  expect(amount).toBe(p.content.amount);
  const src = sourceNumbers(p);
  expect(src.some((n) => near(n, rateMin))).toBe(true);
  expect(src.some((n) => near(n, rateMax))).toBe(true);
  if (op === "×") {
    expect(y.min).toBeCloseTo(amount * rateMin, 5);
    expect(y.max).toBeCloseTo(amount * rateMax, 5);
  } else {
    expect(y.min).toBeCloseTo(amount / rateMax, 5);
    expect(y.max).toBeCloseTo(amount / rateMin, 5);
  }
}

describe("sketchOf — whole catalogue", () => {
  const nonTools = DEMO_CATALOG.filter((p) => !p.isTool);

  it("covers every product with a template", () => {
    expect(nonTools.length).toBeGreaterThan(150);
    for (const p of DEMO_CATALOG) expect(sketchOf(p).template, p.sku).toBeTruthy();
  });

  it.each(nonTools.map((p) => [p.sku, p.name, p] as const))("%s %s: positive numbers derived from its own data", (_sku, _name, p) => {
    const sketch = sketchOf(p);
    expect(sketch.template).not.toBe("tool");
    const nums = numbersIn(sketch);
    expect(nums.length, "a sketch must carry at least one real figure").toBeGreaterThan(0);
    const src = sourceNumbers(p);
    for (const { path, value } of nums) {
      expect(Number.isFinite(value) && value > 0, `${path}=${value}`).toBe(true);
      expect(
        src.some((n) => near(n, value)),
        `${path}=${value} is not in the product's specs/content`,
      ).toBe(true);
    }
    if (sketch.template === "container" && sketch.yield?.kind === "area") checkYield(p, sketch.yield);
  });

  it("tools fall back to the packshot template", () => {
    const tools = DEMO_CATALOG.filter((p) => p.isTool);
    expect(tools.length).toBeGreaterThan(20);
    for (const p of tools) expect(sketchOf(p)).toEqual({ template: "tool" });
  });
});

describe("sketchOf — templates", () => {
  it("a 4 m deck board is a 4000 mm linear member with its real section", () => {
    const s = sketchOf(bySku("11938736")); // Deck pin tratat 27 × 145 mm, 4 m
    expect(s).toMatchObject({ template: "linear", section: "rect", surface: "wood", lengthMm: 4000, faceMm: 145, depthMm: 27 });
  });

  it("joists read their section from '45x70'", () => {
    expect(sketchOf(bySku("13181193"))).toMatchObject({ template: "linear", lengthMm: 4000, faceMm: 70, depthMm: 45 });
  });

  it("fence posts use their height as length and 90 × 90 section", () => {
    expect(sketchOf(bySku("11333377"))).toMatchObject({ template: "linear", lengthMm: 2400, faceMm: 90, depthMm: 90 });
  });

  it("CW/UW profiles are thin-walled channels", () => {
    expect(sketchOf(bySku("11628647"))).toMatchObject({ template: "linear", section: "C", surface: "metal", lengthMm: 2600, faceMm: 50, wallMm: 0.5 });
    expect(sketchOf(bySku("14156682"))).toMatchObject({ section: "U", lengthMm: 3000 });
  });

  it("skirting without a thickness spec gets no invented section", () => {
    const s = sketchOf(bySku("13648135"));
    expect(s).toMatchObject({ template: "linear", section: "none", lengthMm: 2500, faceMm: 55 });
    expect(s).not.toHaveProperty("depthMm", expect.anything());
  });

  it("laminate planks carry plank size and pack contents", () => {
    expect(sketchOf(bySku("13733021"))).toMatchObject({ template: "linear", lengthMm: 1285, faceMm: 192, depthMm: 8, perPack: 8, m2PerPack: 1.974 });
  });

  it("a 60x60 tile is 600 × 600 mm with pieces and m² per box", () => {
    expect(sketchOf(bySku("13245897"))).toEqual({ template: "tile", widthMm: 600, heightMm: 600, perBox: 4, m2PerBox: 1.44 });
    expect(sketchOf(bySku("13905048"))).toMatchObject({ widthMm: 75, heightMm: 300, perBox: 44 });
  });

  it("fence panels are width × height", () => {
    expect(sketchOf(bySku("11715770"))).toMatchObject({ template: "fence_panel", widthMm: 1800, heightMm: 900, opaque: false });
    expect(sketchOf(bySku("10051621"))).toMatchObject({ opaque: true, heightMm: 1800 });
  });

  it("plasterboard is a 1200 × 2600 × 12.5 sheet", () => {
    expect(sketchOf(bySku("12868862"))).toEqual({ template: "sheet", widthMm: 1200, heightMm: 2600, thicknessMm: 12.5 });
  });

  it("a 10 l paint with 12 m²/l covers 120 m² per coat", () => {
    const p = first((x) => x.roles.includes("primer") && x.content.amount === 10 && x.specs.coverageM2PerL === 12);
    const s = sketchOf(p);
    expect(s).toMatchObject({ template: "container", vessel: "canister", amount: 10, unit: "l" });
    expect(s.template === "container" && s.yield).toMatchObject({ kind: "area", min: 120, max: 120, per: "coat" });
  });

  it("paint yield is coverage × litres", () => {
    const s = sketchOf(bySku("10691981")); // 10 l, 11 m²/l
    expect(s.template === "container" && s.yield).toMatchObject({ min: 110, per: "coat", calc: { op: "×", amount: 10, rateMin: 11 } });
  });

  it("deck oil keeps the manufacturer's recommended coats", () => {
    const s = sketchOf(bySku("12396465")); // 2.5 l × 15 m²/l, 2 coats
    expect(s.template === "container" && s.yield).toMatchObject({ min: 37.5, per: "coat", coats: 2 });
  });

  it("adhesive with a consumption range yields a range", () => {
    const s = sketchOf(bySku("14352264")); // 25 kg, 3–4 kg/m²
    expect(s.template === "container" && s.yield).toMatchObject({ kind: "area", min: 6.25, per: "total", calc: { op: "÷", rateMin: 3, rateMax: 4 } });
    expect(s.template === "container" && s.yield && s.yield.kind === "area" && s.yield.max).toBeCloseTo(25 / 3, 5);
  });

  it("filler yield is per 1 mm layer", () => {
    const s = sketchOf(bySku("13554172")); // 20 kg, 1 kg/m²/mm
    expect(s.template === "container" && s.yield).toMatchObject({ min: 20, per: "mm" });
  });

  it("grass seed covers kg × m²/kg", () => {
    const s = sketchOf(bySku("11303880")); // 5 kg × 33
    expect(s.template === "container" && s.yield).toMatchObject({ min: 165, per: "total" });
  });

  it("products without a yield spec show no yield", () => {
    for (const sku of ["13852256", "10426630", "14290837", "13518843"]) {
      const s = sketchOf(bySku(sku));
      expect(s.template).toBe("container");
      expect(s.template === "container" && s.yield, sku).toBeUndefined();
    }
    expect(sketchOf(bySku("13518843"))).toMatchObject({ vessel: "tube", amount: 280, unit: "ml" });
  });

  it("rolls: foil unrolls to width × length, tape to a running length", () => {
    expect(sketchOf(bySku("14324448"))).toMatchObject({ vessel: "roll", amount: 50, unit: "m²", yield: { kind: "strip", widthMm: 2000, lengthMm: 25000 } });
    expect(sketchOf(bySku("13075551"))).toMatchObject({ vessel: "roll", rollWidthMm: 30, yield: { kind: "length", lengthMm: 25000, widthMm: 30 } });
    expect(sketchOf(bySku("10400178"))).toMatchObject({ vessel: "roll", rollWidthMm: 1200, thicknessMm: 50, yield: { kind: "area", min: 14.4 } });
  });

  it("screws and dowels are d × L with count per box", () => {
    expect(sketchOf(bySku("13785259"))).toEqual({ template: "fastener", part: "screw", diameterMm: 5, lengthMm: 60, drive: "TX25", count: 250 });
    expect(sketchOf(bySku("12751622"))).toMatchObject({ part: "dowel", diameterMm: 8, lengthMm: 80, count: 50 });
  });

  it("small parts: spacers, clips, caps, pedestals", () => {
    expect(sketchOf(bySku("14073766"))).toMatchObject({ part: "spacer", jointMm: 2, count: 250 });
    expect(sketchOf(bySku("11130720"))).toMatchObject({ part: "clip", jointMm: 1.5, tileThicknessMm: [3, 12], count: 100 });
    expect(sketchOf(bySku("10458862"))).toMatchObject({ part: "u_clip", postMm: 90, count: 4 });
    expect(sketchOf(bySku("11162369"))).toMatchObject({ part: "cap", postMm: 90, capShape: "pyramid" });
    expect(sketchOf(bySku("11876559"))).toMatchObject({ part: "pedestal", heightRangeMm: [35, 55], maxLoadKg: 800, count: 10 });
  });

  it("falls back to the name for screw sizes when specs lack them", () => {
    const p = { ...bySku("13785259"), specs: { perBox: 250 } } as Product;
    expect(sketchOf(p)).toMatchObject({ part: "screw", diameterMm: 5, lengthMm: 60, count: 250 });
  });

  it("never invents: a product with nothing measurable still only shows its content", () => {
    const p = { ...bySku("13852256"), specs: {} } as Product;
    expect(sketchOf(p)).toEqual({ template: "container", vessel: "bag", amount: 10, unit: "kg", thicknessMm: undefined });
  });
});

describe("spec parsing", () => {
  it("parses pairs and ranges", () => {
    expect(specPair("45x70")).toEqual([45, 70]);
    expect(specPair("7.5x30")).toEqual([7.5, 30]);
    expect(specPair("60 × 60")).toEqual([60, 60]);
    expect(specPair("abc")).toBeUndefined();
    expect(specRange("3–4")).toEqual([3, 4]);
    expect(specRange("35-55")).toEqual([35, 55]);
    expect(specRange("0,5–3")).toEqual([0.5, 3]);
    expect(specRange(1.5)).toEqual([1.5, 1.5]);
    expect(specRange("4–2")).toBeUndefined();
  });
});
