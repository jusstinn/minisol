import { describe, expect, it } from "vitest";
import type { Part } from "../../builders";
import { BEVEL_RADIUS, isBevelShape, shapeFor } from "../shapes";

const base: Part = { id: "p", layer: "deck_board", pos: [0, 0, 0], size: [4, 0.028, 0.145], color: "#c9935a", delay: 0, grow: "slide" };

describe("shapeFor", () => {
  it("is always a plain box outside the REAL view, no matter the layer/finish", () => {
    expect(shapeFor(base, { real: false, lite: false })).toBe("box");
    expect(shapeFor({ ...base, layer: "deck_support" }, { real: false, lite: false })).toBe("box");
  });

  it("is always a plain box on phones/low-end, even in REAL mode", () => {
    expect(shapeFor(base, { real: true, lite: true })).toBe("box");
    expect(shapeFor(base, { real: true, lite: "low" })).toBe("box");
  });

  it("an explicit part.shape always wins, even for a layer that would otherwise get a bevel", () => {
    expect(shapeFor({ ...base, shape: "cylinder" }, { real: true, lite: false })).toBe("cylinder");
  });

  it("gives the deck's adjustable supports a round pedestal, not a box", () => {
    expect(shapeFor({ ...base, layer: "deck_support", size: [0.1, 0.2, 0.1] }, { real: true, lite: false })).toBe("pedestal");
  });

  it("gives fence post caps a small finial shape", () => {
    expect(shapeFor({ ...base, layer: "post_cap", size: [0.12, 0.03, 0.12] }, { real: true, lite: false })).toBe("postCap");
  });

  it("structural context parts (walls, slabs) get the barely-there flat bevel", () => {
    expect(shapeFor({ ...base, context: true }, { real: true, lite: false })).toBe("bevelFlat");
  });

  it("a membrane or bare soil finish stays flat even when it isn't marked context", () => {
    expect(shapeFor({ ...base, finish: { kind: "membrane" } }, { real: true, lite: false })).toBe("bevelFlat");
    expect(shapeFor({ ...base, finish: { kind: "soil" } }, { real: true, lite: false })).toBe("bevelFlat");
  });

  it("joists, studs, posts and skirting get the crisper trim chamfer", () => {
    for (const layer of ["deck_joist", "cw_profile", "fence_post", "skirting_board", "paving_edging"]) {
      expect(shapeFor({ ...base, layer }, { real: true, lite: false })).toBe("bevelCrisp");
    }
  });

  it("an ordinary product (a board, a paver) gets the soft product bevel", () => {
    expect(shapeFor(base, { real: true, lite: false })).toBe("bevelSoft");
    expect(shapeFor({ ...base, layer: "pavers", finish: { kind: "paver" } }, { real: true, lite: false })).toBe("bevelSoft");
  });

  it("floor tile gets its own much crisper, smaller bevel class — not the soft product one", () => {
    expect(shapeFor({ ...base, layer: "floor_tiles", size: [0.3, 0.01, 0.3], finish: { kind: "tile" } }, { real: true, lite: false })).toBe("bevelTile");
  });

  it("wall tiles stay plain boxes: they're butted together and their joints are in the texture", () => {
    expect(shapeFor({ ...base, layer: "wall_tiles", size: [0.6, 0.3, 0.008], finish: { kind: "tileWall" } }, { real: true, lite: false })).toBe("box");
  });

  it("a hair-thin sheet (a vapour barrier, a foil) stays a plain box — the bevel would be bigger than the part", () => {
    expect(shapeFor({ ...base, size: [2, 0.003, 2] }, { real: true, lite: false })).toBe("box");
  });

  it("a grass ground plane stays flat, same as a membrane or bare soil", () => {
    expect(shapeFor({ ...base, finish: { kind: "grass" } }, { real: true, lite: false })).toBe("bevelFlat");
  });

  it("isBevelShape only accepts the four bevel kinds", () => {
    expect(isBevelShape("bevelSoft")).toBe(true);
    expect(isBevelShape("bevelCrisp")).toBe(true);
    expect(isBevelShape("bevelFlat")).toBe(true);
    expect(isBevelShape("bevelTile")).toBe(true);
    expect(isBevelShape("box")).toBe(false);
    expect(isBevelShape("pedestal")).toBe(false);
  });
});

describe("BEVEL_RADIUS", () => {
  it("orders chamfer sizes from barely-there to crisp trim, tile crisper again than flat", () => {
    expect(BEVEL_RADIUS.bevelTile).toBeLessThan(BEVEL_RADIUS.bevelFlat);
    expect(BEVEL_RADIUS.bevelFlat).toBeLessThan(BEVEL_RADIUS.bevelSoft);
    expect(BEVEL_RADIUS.bevelSoft).toBeLessThan(BEVEL_RADIUS.bevelCrisp);
  });

  it("stays well under a millimetre-scale real part — no toy-like fillets", () => {
    for (const r of Object.values(BEVEL_RADIUS)) expect(r).toBeLessThan(0.01);
  });
});
