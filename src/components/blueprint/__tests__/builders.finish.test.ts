import { describe, expect, it } from "vitest";
import { buildScene } from "../builders";
import type { Part } from "../builders";

const byLayer = (parts: Part[], layer: string) => parts.filter((p) => p.layer === layer);
const kinds = (parts: Part[]) => new Set(parts.map((p) => p.finish?.kind));

describe("deck finishes", () => {
  it("boards and joists default to wood; supports are metal; membrane is its own finish", () => {
    const b = buildScene("deck", {}, "ro");
    expect(byLayer(b.parts, "deck_board").every((p) => p.finish?.kind === "wood")).toBe(true);
    expect(byLayer(b.parts, "deck_joist").every((p) => p.finish?.kind === "wood")).toBe(true);
    expect(byLayer(b.parts, "deck_support").every((p) => p.finish?.kind === "metal")).toBe(true);
    expect(byLayer(b.parts, "weed_membrane").every((p) => p.finish?.kind === "membrane")).toBe(true);
  });

  it("switches the boards to WPC when the chosen product's name says so", () => {
    const b = buildScene("deck", {}, "ro", undefined, { deck_board: { color: "#3d3f43", name: "Deck WPC compozit gri Kronwald 25 × 140 mm, 4 m" } });
    expect(byLayer(b.parts, "deck_board").every((p) => p.finish?.kind === "wpc")).toBe(true);
  });

  it("switches joists to metal for an aluminium joist product", () => {
    const b = buildScene("deck", {}, "ro", undefined, { deck_joist: { color: "#b8bec6", name: "Grindă aluminiu pentru deck WPC" } });
    expect(byLayer(b.parts, "deck_joist").every((p) => p.finish?.kind === "metal")).toBe(true);
  });

  it("sizes a board's finish unit so the grain repeat scales with its real length", () => {
    const b = buildScene("deck", {}, "ro");
    const board = byLayer(b.parts, "deck_board")[0];
    expect(board.size[0]).toBeGreaterThan(1); // the run is the deck's ~4 m default length
    expect(board.finish?.kind).toBe("wood");
  });
});

describe("fence finishes", () => {
  it("panels and gates get the dedicated 'fence' finish, distinct from plain wood/WPC", () => {
    const b = buildScene("fence", {}, "ro");
    expect(byLayer(b.parts, "fence_panel").every((p) => p.finish?.kind === "fence")).toBe(true);
  });

  it("footings are concrete, caps are metal, posts default to wood", () => {
    const b = buildScene("fence", {}, "ro");
    expect(byLayer(b.parts, "post_concrete").every((p) => p.finish?.kind === "concrete")).toBe(true);
    expect(byLayer(b.parts, "post_cap").every((p) => p.finish?.kind === "metal")).toBe(true);
    expect(byLayer(b.parts, "fence_post").every((p) => p.finish?.kind === "wood")).toBe(true);
  });

  it("switches posts to metal for an aluminium post product", () => {
    const b = buildScene("fence", {}, "ro", undefined, { fence_post: { color: "#b8bec6", name: "Stâlp aluminiu vopsit" } });
    expect(byLayer(b.parts, "fence_post").every((p) => p.finish?.kind === "metal")).toBe(true);
  });
});

describe("paving finishes", () => {
  it("pavers, base, sand, membrane and (with edging) kerb concrete each get their own finish", () => {
    const b = buildScene("paving", {}, "ro");
    expect(byLayer(b.parts, "pavers").every((p) => p.finish?.kind === "paver")).toBe(true);
    expect(byLayer(b.parts, "paving_base").every((p) => p.finish?.kind === "gravel")).toBe(true);
    expect(byLayer(b.parts, "paving_sand").every((p) => p.finish?.kind === "sand")).toBe(true);
    expect(byLayer(b.parts, "weed_membrane").every((p) => p.finish?.kind === "membrane")).toBe(true);
    expect(byLayer(b.parts, "paving_edging").every((p) => p.finish?.kind === "concrete")).toBe(true);
  });

  it("keeps the paver's finish unit at the real catalogue format even when the drawn box is enlarged", () => {
    const b = buildScene("paving", { lengthM: 40, widthM: 20 }, "ro"); // big area → builder scales pavers up
    const pavers = byLayer(b.parts, "pavers");
    const drawn = pavers[0].size[0] * pavers[0].size[2];
    const real = (pavers[0].finish?.unit?.[0] ?? 1) * (pavers[0].finish?.unit?.[1] ?? 1);
    expect(drawn).toBeGreaterThan(real); // the box got bigger, but the finish still tiles at 0.2 × 0.1 m
  });
});

describe("tiling finishes", () => {
  it("floor tiles get the 'tile' finish; wall tiles get the glossier 'tileWall' one, correct in-plane axes", () => {
    // Wall tile height defaults from the raw input's roomType (not the layout's own default).
    const b = buildScene("tiling", { roomType: "bathroom" }, "ro");
    expect(byLayer(b.parts, "floor_tiles").every((p) => p.finish?.kind === "tile")).toBe(true);
    const wall = byLayer(b.parts, "wall_tiles");
    expect(wall.length).toBeGreaterThan(0);
    expect(wall.every((p) => p.finish?.kind === "tileWall")).toBe(true);
    expect(wall.some((p) => p.finish?.axes === "xy" || p.finish?.axes === "zy")).toBe(true);
  });
});

describe("laminate and drywall finishes", () => {
  it("laminate planks and skirting are wood; transition profiles are metal", () => {
    const b = buildScene("laminate_floor", {}, "ro");
    expect(byLayer(b.parts, "laminate").every((p) => p.finish?.kind === "wood")).toBe(true);
    expect(byLayer(b.parts, "skirting_board").every((p) => p.finish?.kind === "wood")).toBe(true);
    expect(byLayer(b.parts, "transition_profile").every((p) => p.finish?.kind === "metal")).toBe(true);
  });

  it("drywall boards are plaster; the steel profiles are metal", () => {
    const b = buildScene("drywall_partition", {}, "ro");
    expect(byLayer(b.parts, "drywall_board").every((p) => p.finish?.kind === "plaster")).toBe(true);
    expect(byLayer(b.parts, "uw_profile").every((p) => p.finish?.kind === "metal")).toBe(true);
    expect(byLayer(b.parts, "cw_profile").every((p) => p.finish?.kind === "metal")).toBe(true);
  });
});

describe("paint and lawn finishes", () => {
  it("painted walls get the plaster finish", () => {
    const b = buildScene("paint_room", {}, "ro");
    expect(byLayer(b.parts, "interior_paint").length).toBeGreaterThan(0);
    expect(byLayer(b.parts, "interior_paint").every((p) => p.finish?.kind === "plaster")).toBe(true);
  });

  it("lawn soil and topsoil get the soil finish", () => {
    const b = buildScene("lawn", {}, "ro");
    expect(byLayer(b.parts, "topsoil").every((p) => p.finish?.kind === "soil")).toBe(true);
    expect(b.parts.filter((p) => p.id.endsWith("-soil")).every((p) => p.finish?.kind === "soil")).toBe(true);
  });
});

describe("parts without a finish", () => {
  it("leaves non-purchasable thin plastic layers (foil, tape) without a finish", () => {
    const b = buildScene("paint_room", {}, "ro");
    expect(kinds(byLayer(b.parts, "protective_foil"))).toEqual(new Set([undefined]));
    expect(kinds(byLayer(b.parts, "painters_tape"))).toEqual(new Set([undefined]));
  });
});
