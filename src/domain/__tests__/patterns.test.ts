import { describe, expect, it } from "vitest";
import { calculateProject } from "../calculators";
import { applyOps, checkLayout, defaultLayout, describeLayout, layoutParams, SketchEditError } from "../layout";
import type { Layout } from "../layout";
import {
  DECK_BOARD_WASTE,
  DECK_FRAME_WASTE,
  DECK_JOIST_SPACING,
  PAVING_BOND_WASTE,
  deckFrameFor,
  deckFrameSides,
  parseDeckBoards,
  parsePavingBond,
  pavingWaste,
} from "../patterns";

const req = (r: ReturnType<typeof calculateProject>, role: string) => r.requirements.find((x) => x.role === role);
const calc = (l: Layout) => calculateProject(l.type, layoutParams(l));
const path = () => defaultLayout("paving", calculateProject("paving", { lengthM: 6, widthM: 1.2 }).inputs);
const deck = () => defaultLayout("deck", calculateProject("deck", { lengthM: 5, widthM: 4 }).inputs);
const set = (l: Layout, key: string, value: string) => applyOps(l, [{ op: "set_option", key, value }]).layout;

describe("paving bonds: waste per pattern", () => {
  it("each bond has its own waste, running bond keeping today's 5%", () => {
    expect(PAVING_BOND_WASTE).toEqual({ running: 0.05, herringbone: 0.1, basketweave: 0.07, stack: 0.05 });
    expect(pavingWaste(undefined, 1)).toBe(0.05);
    expect(pavingWaste("running", 1)).toBe(0.05);
  });

  it("more than one zone adds the same 2 points to every bond (today's 5% → 7%)", () => {
    expect(pavingWaste("running", 2)).toBe(0.07);
    expect(pavingWaste("herringbone", 2)).toBe(0.12);
    expect(pavingWaste("basketweave", 3)).toBe(0.09);
    expect(pavingWaste("stack", 2)).toBe(0.07);
  });

  it.each([
    ["running", 1.05],
    ["herringbone", 1.1],
    ["basketweave", 1.07],
    ["stack", 1.05],
  ] as const)("a 6 × 1,2 m path in %s bond buys %s × the area in pavers", (bond, factor) => {
    const l = set(path(), "bond", bond);
    const pavers = req(calc(l), "pavers")!;
    expect(pavers.quantity).toBeCloseTo(7.2 * factor, 2);
    expect(pavers.basis).toContain(`${Math.round((factor - 1) * 100)}%`);
  });

  it("only the pavers change — base, sand, kerbs and the rest are the same for every bond", () => {
    const base = calc(path());
    for (const bond of ["herringbone", "basketweave", "stack"]) {
      const r = calc(set(path(), "bond", bond));
      for (const role of ["paving_base", "paving_sand", "weed_membrane", "paving_edging", "kerb_concrete", "joint_sand"]) {
        expect(req(r, role)!.quantity).toBe(req(base, role)!.quantity);
      }
    }
  });

  it("herringbone costs 5% more pavers than the plain bond, and says what the product must be", () => {
    const run = req(calc(path()), "pavers")!.quantity;
    const herring = calc(set(path(), "bond", "herringbone"));
    expect(req(herring, "pavers")!.quantity / run).toBeCloseTo(1.1 / 1.05, 2);
    expect(herring.assumptions.join(" ")).toMatch(/2:1/);
    expect(calc(path()).assumptions.join(" ")).not.toMatch(/2:1/);
  });

  it("an L-shaped path wastes 2 points more in every bond", () => {
    const l = applyOps(set(path(), "bond", "herringbone"), [{ op: "add_zone", zone: "A", side: "e", w: 1.2, d: 3, align: "end" }]).layout;
    const area = 6 * 1.2 + 1.2 * 3;
    expect(req(calc(l), "pavers")!.quantity).toBeCloseTo(area * 1.12, 1);
  });

  it("the calculator reads the bond from plain parameters too, and ignores nonsense", () => {
    expect(req(calculateProject("paving", { lengthM: 6, widthM: 1.2, bond: "herringbone" }), "pavers")!.quantity).toBeCloseTo(7.92, 2);
    expect(req(calculateProject("paving", { lengthM: 6, widthM: 1.2, bond: "zigzag" }), "pavers")!.quantity).toBeCloseTo(7.56, 2);
  });

  it("no bond given = running bond, exactly as before", () => {
    const r = calculateProject("paving", { lengthM: 6, widthM: 1.2 });
    expect(r.inputs).not.toHaveProperty("bond");
    expect(req(r, "pavers")!.quantity).toBeCloseTo(7.56, 2);
  });
});

describe("deck board layouts: quantities", () => {
  const boardsOf = (l: Layout) => calc(l);

  it("straight boards are today's numbers: 27 rows × 5 m + 10%, joists at 40 cm", () => {
    const r = boardsOf(deck());
    expect(req(r, "deck_board")!.quantity).toBeCloseTo(27 * 5 * 1.1, 2);
    expect(r.measurements.find((m) => m.unit === "buc" && /joist|grinz/i.test(m.label))!.value).toBe(14);
    expect(r.inputs).not.toHaveProperty("boards");
  });

  it("diagonal boards need ~10% more boards (20% waste instead of 10%) and joists at 30 cm", () => {
    const straight = boardsOf(deck());
    const diag = boardsOf(set(deck(), "boards", "diagonal"));
    expect(DECK_BOARD_WASTE).toEqual({ straight: 0.1, diagonal: 0.2, frame: 0.1 });
    expect(DECK_JOIST_SPACING.diagonal).toBe(0.3);
    expect(req(diag, "deck_board")!.quantity).toBeCloseTo(27 * 5 * 1.2, 2);
    expect(req(diag, "deck_board")!.quantity / req(straight, "deck_board")!.quantity).toBeCloseTo(1.2 / 1.1, 2);
    // ceil(5 / 0.3) + 1 = 18 joists instead of ceil(5 / 0.4) + 1 = 14
    expect(diag.measurements.find((m) => /joist|grinz/i.test(m.label))!.value).toBe(18);
    expect(req(diag, "deck_joist")!.quantity).toBeGreaterThan(req(straight, "deck_joist")!.quantity);
    expect(req(diag, "deck_screws")!.quantity).toBeGreaterThan(req(straight, "deck_screws")!.quantity);
    expect(req(diag, "deck_support")!.quantity).toBeGreaterThan(req(straight, "deck_support")!.quantity);
    expect(diag.assumptions.join(" ")).toMatch(/30 cm/);
  });

  it("a picture frame: one mitred border board on every open side and a smaller field", () => {
    const frame = boardsOf(set(deck(), "boards", "frame"));
    // field 4,7 × 3,7 m → 25 rows × 4,7 m at 10%; border 2 × 5 m + 2 × 4 m at 15% (mitres)
    expect(req(frame, "deck_board")!.quantity).toBeCloseTo(25 * 4.7 * 1.1 + (2 * 5 + 2 * 4) * 1.15, 2);
    expect(DECK_FRAME_WASTE).toBe(0.15);
    expect(frame.measurements.find((m) => /frame|ramă/i.test(m.label))!.value).toBe(4);
    // the two border boards that run with the joists each get a joist of their own
    expect(frame.measurements.find((m) => /joist|grinz/i.test(m.label))!.value).toBe(14 + 2);
    expect(frame.assumptions.join(" ")).toMatch(/15%/);
  });

  it("with the boards across, it is the other two border boards that need joists", () => {
    const l = applyOps(set(deck(), "boards", "frame"), [{ op: "set_option", key: "direction", value: "z" }]).layout;
    const r = calc(l);
    // run = 4 m (ceil(4 / 0.4) + 1 = 11 joists) + the 2 border boards that now run with the joists (north / south)
    expect(r.measurements.find((m) => /joist|grinz/i.test(m.label))!.value).toBe(11 + 2);
  });

  it("an L-shaped deck has no frame across the joint", () => {
    const l = applyOps(set(deck(), "boards", "frame"), [{ op: "add_zone", zone: "A", side: "e", w: 2, d: 2, align: "end" }]).layout;
    const sides = deckFrameSides((l as Extract<Layout, { type: "deck" }>).zones);
    expect(sides[0]).toEqual({ n: true, e: false, s: true, w: true });
    expect(sides[1]).toEqual({ n: true, e: true, s: true, w: false });
    expect(req(calc(l), "deck_board")!.quantity).toBeGreaterThan(0);
  });

  it("a deck too narrow for a frame is laid straight", () => {
    const narrow = defaultLayout("deck", { lengthM: 5, widthM: 0.5, boards: "frame" });
    const z = (narrow as Extract<Layout, { type: "deck" }>).zones[0];
    expect(deckFrameFor(z, deckFrameSides([z])[0])).toBeNull();
    const straight = calculateProject("deck", { lengthM: 5, widthM: 0.5 });
    expect(req(calc(narrow), "deck_board")!.quantity).toBe(req(straight, "deck_board")!.quantity);
  });

  it("steps are always 10% waste whatever the layout", () => {
    const withSteps = (b: string) => calc(applyOps(set(deck(), "boards", b), [{ op: "add_steps", zone: "A", side: "s", count: 2 }]).layout);
    const stepsM = 2 * 2 * 1.5; // 2 treads × 2 boards × 1,5 m wide (the default step)
    const noSteps = (b: string) => calc(set(deck(), "boards", b));
    for (const b of ["straight", "diagonal", "frame"]) {
      const diff = req(withSteps(b), "deck_board")!.quantity - req(noSteps(b), "deck_board")!.quantity;
      expect(diff).toBeCloseTo(stepsM * 1.1, 1);
    }
  });
});

describe("layout options: validation", () => {
  it("set_option bond / boards accept the listed values and the plain aliases", () => {
    expect((set(path(), "bond", "herringbone") as Extract<Layout, { type: "paving" }>).bond).toBe("herringbone");
    expect((set(path(), "bond", "Basket-weave") as Extract<Layout, { type: "paving" }>).bond).toBe("basketweave");
    expect((set(path(), "bond", "stretcher") as Extract<Layout, { type: "paving" }>).bond).toBe("running");
    expect((set(deck(), "boards", "picture frame") as Extract<Layout, { type: "deck" }>).boards).toBe("frame");
    expect((set(deck(), "boards", "diagonal") as Extract<Layout, { type: "deck" }>).boards).toBe("diagonal");
  });

  it("rejects an unknown value, or a key on the wrong project", () => {
    expect(() => set(path(), "bond", "zigzag")).toThrow(SketchEditError);
    expect(() => set(deck(), "boards", "circular")).toThrow(SketchEditError);
    expect(() => set(deck(), "bond", "herringbone")).toThrow(SketchEditError);
    expect(() => set(path(), "boards", "diagonal")).toThrow(SketchEditError);
    expect(() => applyOps(defaultLayout("fence", { lengthM: 10 }), [{ op: "set_option", key: "bond", value: "stack" }])).toThrow(SketchEditError);
  });

  it("the change card names the pattern, in both languages", () => {
    expect(applyOps(path(), [{ op: "set_option", key: "bond", value: "herringbone" }]).changes).toEqual(["Pavele în spic"]);
    expect(applyOps(path(), [{ op: "set_option", key: "bond", value: "basketweave" }], "en").changes).toEqual(["Pavers in basketweave"]);
    expect(applyOps(deck(), [{ op: "set_option", key: "boards", value: "frame" }], "en").changes[0]).toMatch(/picture-frame/);
    expect(applyOps(deck(), [{ op: "set_option", key: "boards", value: "diagonal" }]).changes[0]).toMatch(/diagonal/);
  });

  it("a new layout takes the pattern from its inputs, otherwise leaves it unset", () => {
    expect((defaultLayout("paving", { lengthM: 6, widthM: 2, bond: "stack" }) as Extract<Layout, { type: "paving" }>).bond).toBe("stack");
    expect((defaultLayout("deck", { lengthM: 4, widthM: 3, boards: "diagonal" }) as Extract<Layout, { type: "deck" }>).boards).toBe("diagonal");
    expect(path()).not.toHaveProperty("bond");
    expect(deck()).not.toHaveProperty("boards");
    expect((defaultLayout("paving", { lengthM: 6, widthM: 2, bond: "nonsense" }) as Extract<Layout, { type: "paving" }>).bond).toBeUndefined();
  });

  it("flows into the calculator params and the model's view of the sketch", () => {
    const l = set(path(), "bond", "herringbone");
    expect(layoutParams(l)).toMatchObject({ bond: "herringbone" });
    expect(describeLayout(l)).toMatchObject({ bond: "herringbone" });
    expect(describeLayout(path())).toMatchObject({ bond: "running" });
    expect(describeLayout(set(deck(), "boards", "frame"))).toMatchObject({ boards: "frame" });
    expect(describeLayout(deck())).toMatchObject({ boards: "straight" });
  });

  it("layouts round-trip through the browser: the new fields are optional, validated and kept", () => {
    const withBond = set(path(), "bond", "herringbone");
    expect(checkLayout(JSON.parse(JSON.stringify(withBond)), "paving")).toEqual(withBond);
    const withBoards = set(deck(), "boards", "diagonal");
    expect(checkLayout(JSON.parse(JSON.stringify(withBoards)), "deck")).toEqual(withBoards);
    // an older saved sketch has neither
    expect(checkLayout(JSON.parse(JSON.stringify(path())), "paving")).toEqual(path());
    expect(checkLayout(JSON.parse(JSON.stringify(deck())), "deck")).toEqual(deck());
    // a crafted one is refused
    expect(checkLayout({ ...withBond, bond: "evil<script>" }, "paving")).toBeNull();
    expect(checkLayout({ ...withBoards, boards: 3 }, "deck")).toBeNull();
    expect(checkLayout({ ...withBoards, boards: "diagonal ".repeat(20) }, "deck")).toBeNull();
  });

  it("the alias parsers return undefined for anything else", () => {
    expect(parsePavingBond("Herringbone")).toBe("herringbone");
    expect(parsePavingBond("")).toBeUndefined();
    expect(parsePavingBond(null)).toBeUndefined();
    expect(parseDeckBoards("diagonal")).toBe("diagonal");
    expect(parseDeckBoards("sideways")).toBeUndefined();
  });
});
