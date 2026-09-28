import { describe, expect, it } from "vitest";
import { buildLayout } from "../../components/blueprint/builders";
import catalogJson from "../../data/catalog.json";
import { calculateProject } from "../calculators";
import { applyOps, checkLayout, defaultLayout, describeLayout, itemContainer, layoutParams, SketchEditError } from "../layout";
import type { Layout } from "../layout";
import { lookOf } from "../look";
import { PAVING_BUILDUP, pavingDepth } from "../paving";
import { buildQuote } from "../quote";
import type { QuoteDeps } from "../quote";
import { lineOptions, resolveRequirements } from "../resolve";
import type { Product } from "../types";
import { STORES_FIXTURE, customer } from "./fixtures";

const catalog = catalogJson as unknown as Product[];
const req = (r: ReturnType<typeof calculateProject>, role: string) => r.requirements.find((x) => x.role === role);
const calc = (l: Layout) => calculateProject(l.type, layoutParams(l));
const path = () => defaultLayout("paving", calculateProject("paving", { lengthM: 6, widthM: 1.2 }).inputs);
/** The starter path turned into an L: a 1,2 m wide leg running back from its right end. */
const lPath = () => applyOps(path(), [{ op: "add_zone", zone: "A", side: "e", w: 1.2, d: 3, align: "end" }]).layout;
const bySku = (sku: string) => catalog.find((p) => p.sku === sku)!;

describe("paving calculator", () => {
  it("a 6 × 1,2 m path: 10 cm stone, 4 cm sand, pavers + 5%, kerbs round the outline", () => {
    const r = calculateProject("paving", { lengthM: 6, widthM: 1.2 });
    expect(r.inputs).toMatchObject({ use: "path", edging: true, areaM2: 7.2 });
    expect(r.title).toBe("Alee din pavele");
    expect(req(r, "pavers")!.quantity).toBeCloseTo(7.2 * 1.05, 2);
    expect(req(r, "pavers")!.match).toBeUndefined();
    expect(req(r, "paving_base")!.quantity).toBeCloseTo(7.2 * 0.1 * 1.15 * 1800, 1);
    expect(req(r, "paving_sand")!.quantity).toBeCloseTo(7.2 * 0.04 * 1.1 * 1600, 1);
    expect(req(r, "weed_membrane")!.quantity).toBeCloseTo(7.2 * 1.15, 2);
    // outline 2 × (6 + 1,2) = 14,4 m of kerbs (+5% cuts), ~20 kg of concrete a metre
    expect(req(r, "paving_edging")!.quantity).toBeCloseTo(14.4 * 1.05, 2);
    expect(req(r, "kerb_concrete")!.quantity).toBeCloseTo(14.4 * 20, 1);
    // jointing sand is sized by the chosen product's coverage over the paved area
    expect(req(r, "joint_sand")).toMatchObject({ quantity: 28.8, areaToCover: 7.2 });
    // small path: a hand tamper is on the list, no plate compactor
    expect(req(r, "plate_compactor")).toMatchObject({ isTool: true, optional: false, match: { type: "mai manual" } });
    expect(r.measurements.find((m) => m.unit === "cm")?.value).toBe(20);
    expect(r.safetyNotes.join(" ")).toMatch(/cabluri/);
    expect(r.estimate.people).toBe(2);
  });

  it("the base depth follows the use: path 10 cm, patio 15 cm, driveway 25 cm with 8 cm pavers", () => {
    const base = (use: string) => req(calculateProject("paving", { lengthM: 5, widthM: 3, use }), "paving_base")!.quantity;
    expect(base("path")).toBeCloseTo(15 * 0.1 * 1.15 * 1800, 1);
    expect(base("patio")).toBeCloseTo(15 * 0.15 * 1.15 * 1800, 1);
    expect(base("driveway")).toBeCloseTo(15 * 0.25 * 1.15 * 1800, 1);
    const d = calculateProject("paving", { lengthM: 5, widthM: 3, use: "driveway" }, "en");
    expect(d.title).toBe("Paved driveway");
    expect(req(d, "pavers")!.match).toEqual({ thicknessMm: 80 });
    expect(req(d, "paving_edging")!.match).toEqual({ thicknessMm: 100 });
    // big job: the plate compactor is suggested (hire it), not bought by default
    expect(req(d, "plate_compactor")).toMatchObject({ optional: true, match: { type: "placă compactoare" } });
    expect(d.measurements.find((m) => m.unit === "cm")?.value).toBe(Math.round(pavingDepth("driveway") * 100));
    expect(d.estimate.difficulty).toBe(4);
    expect(d.assumptions.join(" ")).toMatch(/specialist/);
  });

  it("an L counts its real outline (no kerb along the seam) and a little more waste", () => {
    const r = calc(lPath());
    expect(r.title).toBe("Alee din pavele în L");
    expect(req(r, "pavers")!.quantity).toBeCloseTo(10.8 * 1.07, 2);
    // the L's outline is its bounding box's: 2 × (7,2 + 3) = 20,4 m, not 14,4 + 8,4
    expect(req(r, "paving_edging")!.quantity).toBeCloseTo(20.4 * 1.05, 2);
    expect(req(r, "joint_sand")!.areaToCover).toBeCloseTo(10.8, 2);
  });

  it("no edging, no kerbs or kerb concrete; the use is guessed from the width", () => {
    const r = calculateProject("paving", { lengthM: 4, widthM: 3, edging: false });
    expect(r.inputs.use).toBe("patio");
    expect(req(r, "paving_edging")).toBeUndefined();
    expect(req(r, "kerb_concrete")).toBeUndefined();
    expect(calculateProject("paving", { areaM2: 25 }).inputs).toMatchObject({ lengthM: 5, widthM: 5, use: "patio" });
  });

  it("resolves to real products: 6 cm for a path, 8 cm for a driveway, quartz sand by its coverage", () => {
    const pathLines = resolveRequirements(calculateProject("paving", { lengthM: 6, widthM: 1.2 }).requirements, catalog).lines;
    const paver = bySku(pathLines.find((l) => l.role === "pavers")!.sku);
    expect(paver.specs.thicknessMm).toBe(60);
    const sand = pathLines.find((l) => l.role === "joint_sand")!;
    expect(sand.needed).toBeCloseTo(7.2 / Number(bySku(sand.sku).specs.coverageM2PerKg), 2);
    const drive = calculateProject("paving", { lengthM: 5, widthM: 3, use: "driveway" });
    for (const quality of ["budget", "standard", "premium"] as const) {
      const lines = resolveRequirements(drive.requirements, catalog, { quality }).lines;
      expect(bySku(lines.find((l) => l.role === "pavers")!.sku).specs.thicknessMm, quality).toBe(80);
    }
    // the options drawer for a driveway only offers pavers that carry cars
    expect(lineOptions(req(drive, "pavers")!, catalog).every((o) => o.product.specs.thicknessMm === 80)).toBe(true);
  });

  it("steel edging makes the kerb concrete unnecessary", () => {
    const steel = catalog.find((p) => p.roles.includes("paving_edging") && p.specs.material === "oțel zincat")!;
    const kerb = catalog.find((p) => p.roles.includes("paving_edging") && p.specs.material === "beton vibropresat")!;
    const concrete = catalog.find((p) => p.roles.includes("kerb_concrete"))!;
    const deps: QuoteDeps = { products: new Map(catalog.map((p) => [p.sku, p])), stores: STORES_FIXTURE, stockOf: () => 100, aisleOf: () => 7 };
    const ctx = { customer: customer(), storeId: "a", offers: [] };
    const withKerbs = buildQuote([{ sku: kerb.sku, qty: 15 }, { sku: concrete.sku, qty: 6 }], ctx, deps);
    expect(withKerbs.hints.filter((h) => h.kind === "not_needed")).toEqual([]);
    const withSteel = buildQuote([{ sku: steel.sku, qty: 15 }, { sku: concrete.sku, qty: 6 }], ctx, deps);
    expect(withSteel.hints).toContainEqual(expect.objectContaining({ kind: "not_needed", role: "kerb_concrete", sku: concrete.sku }));
  });
});

describe("paving sketch edits", () => {
  it("starts as one zone with the use and edging from the request", () => {
    const l = path();
    expect(l).toMatchObject({ type: "paving", use: "path", edging: true, zones: [{ id: "A", w: 6, d: 1.2 }] });
    expect(describeLayout(l)).toMatchObject({ use: "path", edging: true, zones: [{ id: "A" }] });
  });

  it("resizes, grows a wing and takes it off again like the other zoned projects", () => {
    const l = lPath();
    expect(l.type === "paving" && l.zones.map((z) => [z.id, z.w, z.d])).toEqual([
      ["A", 6, 1.2],
      ["B", 1.2, 3],
    ]);
    const resized = applyOps(l, [{ op: "resize", zone: "B", d: 4 }]);
    expect(resized.changes[0]).toMatch(/B .*1,2 × 4/);
    expect(() => applyOps(l, [{ op: "resize", zone: "A", w: 8 }])).toThrow(SketchEditError); // would run into B
    expect(() => applyOps(l, [{ op: "resize", zone: "B", w: 40 }])).toThrow(SketchEditError);
    const back = applyOps(l, [{ op: "remove_zone", zone: "B" }]).layout;
    expect(calc(back).requirements).toEqual(calc(path()).requirements);
  });

  it("switches the use and the edging, and says so", () => {
    const r = applyOps(path(), [
      { op: "set_option", key: "use", value: "driveway" },
      { op: "set_option", key: "edging", value: false },
    ]);
    expect(r.layout).toMatchObject({ use: "driveway", edging: false });
    expect(r.changes).toEqual(["Intrare auto (pavele de 8 cm, fundație de 25 cm)", "Fără borduri"]);
    expect(() => applyOps(path(), [{ op: "set_option", key: "use", value: "runway" }])).toThrow(SketchEditError);
    expect(() => applyOps(path(), [{ op: "add_steps" }])).toThrow(SketchEditError);
  });

  it("survives the browser round trip only when well-formed", () => {
    const l = lPath();
    expect(checkLayout(JSON.parse(JSON.stringify(l)), "paving")).toEqual(l);
    expect(checkLayout({ ...l, use: "runway" }, "paving")).toBeNull();
    expect(checkLayout({ ...l, edging: "yes" }, "paving")).toBeNull();
    expect(checkLayout(l, "deck")).toBeNull();
  });

  it("garden furniture stands on the pavers; bathroom fixtures don't belong", () => {
    const l = applyOps(path(), [{ op: "add_item", item: "table" }]).layout;
    expect(l.items).toHaveLength(1);
    expect(itemContainer(l).floorY).toBeCloseTo(pavingDepth("path"));
    expect(req(calc(l), "garden_furniture")!.quantity).toBe(1);
    expect(() => applyOps(path(), [{ op: "add_item", item: "toilet" }])).toThrow(SketchEditError);
  });
});

describe("paving 3D sketch", () => {
  const pavers = (l: Layout, look = {}) => buildLayout(l, "ro", look).parts.filter((p) => p.layer === "pavers");

  it("has unique, zone-stable part ids: adding a wing leaves the first zone as it was", () => {
    const b0 = buildLayout(path(), "ro");
    const b1 = buildLayout(lPath(), "ro");
    expect(new Set(b1.parts.map((p) => p.id)).size).toBe(b1.parts.length);
    const before = new Map(b0.parts.filter((p) => p.id.startsWith("A-")).map((p) => [p.id, JSON.stringify([p.pos, p.size])]));
    const after = b1.parts.filter((p) => p.id.startsWith("A-"));
    expect(after.length).toBe(before.size);
    for (const p of after) expect(JSON.stringify([p.pos, p.size]), p.id).toBe(before.get(p.id));
    expect(b1.parts.some((p) => p.id.startsWith("B-paver-"))).toBe(true);
  });

  it("lays the chosen format and colour: bigger pavers → fewer pieces, same colour as the product", () => {
    const small = bySku("15410013"); // 20 × 10, grey
    const big = bySku("15410042"); // 30 × 20, anthracite
    const a = pavers(path(), { pavers: lookOf(small) });
    const b = pavers(path(), { pavers: lookOf(big) });
    expect(b.length).toBeLessThan(a.length);
    expect(b[0].size[0]).toBeCloseTo(0.3 - 0.004, 3);
    expect(b[0].size[2]).toBeCloseTo(0.2 - 0.004, 3);
    expect(new Set(b.map((p) => p.color))).not.toContain(a[0].color);
    // running bond: every other row starts with a half paver
    const rowStart = (r: number) => b.filter((p) => p.id.startsWith(`A-paver-${r}-`)).sort((x, y) => x.pos[0] - y.pos[0])[0];
    expect(rowStart(1).size[0]).toBeCloseTo(0.15 - 0.004, 3);
    expect(rowStart(0).size[0]).toBeCloseTo(0.3 - 0.004, 3);
    // the pavers sit flush with the top of the build-up
    expect(a[0].pos[1] + a[0].size[1] / 2).toBeCloseTo(pavingDepth("path"), 3);
  });

  it("keeps the part count sane on a big patio by drawing larger pavers", () => {
    const big = applyOps(defaultLayout("paving", { lengthM: 12, widthM: 10, use: "patio" }), []).layout;
    const n = pavers(big, { pavers: lookOf(bySku("15410013")) }).length;
    expect(n).toBeGreaterThan(300);
    expect(n).toBeLessThan(800);
  });

  it("draws every layer bottom-up, kerbs only with edging, deeper for a driveway", () => {
    const b = buildLayout(path(), "en");
    expect(b.layers.map((l) => l.id)).toEqual(["weed_membrane", "paving_base", "kerb_concrete", "paving_sand", "paving_edging", "pavers", "joint_sand"]);
    // a rectangle has 4 exposed edges → 4 kerbs, each on a concrete bed
    expect(b.parts.filter((p) => p.layer === "paving_edging")).toHaveLength(4);
    expect(b.parts.filter((p) => p.layer === "kerb_concrete")).toHaveLength(4);
    // the L: one kerb per exposed edge (7 — the front edge is two collinear runs), none along the seam
    const lp = lPath();
    const kerbs = buildLayout(lp, "en").parts.filter((p) => p.layer === "paving_edging");
    expect(kerbs).toHaveLength(7);
    const A = lp.type === "paving" ? lp.zones[0] : undefined!;
    const seamX = A.x + A.w;
    expect(kerbs.some((p) => Math.abs(p.pos[0] - seamX) < 0.1 && p.pos[2] > A.z && p.pos[2] < A.z + A.d)).toBe(false);
    const bare = buildLayout(applyOps(path(), [{ op: "set_option", key: "edging", value: false }]).layout, "en");
    expect(bare.parts.some((p) => p.layer === "paving_edging" || p.layer === "kerb_concrete")).toBe(false);
    const drive = applyOps(path(), [{ op: "set_option", key: "use", value: "driveway" }]).layout;
    const base = (l: Layout) => buildLayout(l, "en").parts.find((p) => p.id === "A-base")!.size[1];
    expect(base(drive)).toBeGreaterThan(base(path()) + (PAVING_BUILDUP.driveway.base - PAVING_BUILDUP.path.base) - 0.03);
  });
});
