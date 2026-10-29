import { describe, expect, it } from "vitest";
import type { Part } from "../../builders";
import { buildScene } from "../../builders";
import { groupByMaterial, materialSpecFor } from "../grouping";
import { placeParts } from "../placement";
import type { PlacedPart } from "../placement";

const placed = (over: Partial<Part> & { id: string }): PlacedPart => {
  const part: Part = { layer: "deck_board", pos: [0, 0.1, 0], size: [1, 0.2, 1], color: "#c9935a", delay: 0, grow: "drop", ...over };
  return { part, pos: part.pos, size: part.size };
};

describe("material specs", () => {
  it("identify a finish by kind, colour and opacity", () => {
    expect(materialSpecFor(placed({ id: "a", finish: { kind: "wood" } }))).toMatchObject({ kind: "wood", color: "#c9935a", opacity: 1 });
    expect(materialSpecFor(placed({ id: "a" }))).toMatchObject({ kind: null, key: "flat|#c9935a|1" });
  });

  it("normalise the colour's case and clamp/round the opacity", () => {
    expect(materialSpecFor(placed({ id: "a", color: " #C9935A " })).color).toBe("#c9935a");
    expect(materialSpecFor(placed({ id: "a", opacity: 0.304 })).opacity).toBe(0.3);
    expect(materialSpecFor(placed({ id: "a", opacity: 7 })).opacity).toBe(1);
  });
});

describe("grouping by material", () => {
  it("puts parts with the same finish, colour and opacity in one group, whatever their size or layer", () => {
    const groups = groupByMaterial([
      placed({ id: "board", size: [4, 0.028, 0.145], finish: { kind: "wood" } }),
      placed({ id: "short", size: [1.2, 0.028, 0.145], finish: { kind: "wood", unit: [0.5, 0.1] } }),
      placed({ id: "joist", layer: "deck_joist", size: [3, 0.07, 0.045], finish: { kind: "wood" } }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].parts.map((p) => p.part.id)).toEqual(["board", "short", "joist"]);
  });

  it("separates different colours, kinds and opacities", () => {
    const groups = groupByMaterial([
      placed({ id: "a", finish: { kind: "wood" } }),
      placed({ id: "b", finish: { kind: "wood" }, color: "#8e6038" }),
      placed({ id: "c", finish: { kind: "wpc" } }),
      placed({ id: "d", finish: { kind: "wood" }, opacity: 0.5 }),
      placed({ id: "e" }),
    ]);
    expect(groups.map((g) => g.parts.map((p) => p.part.id))).toEqual([["a"], ["b"], ["c"], ["d"], ["e"]]);
  });

  it("keeps first-seen order so the file is deterministic", () => {
    const parts = [placed({ id: "x", color: "#111111" }), placed({ id: "y", color: "#222222" }), placed({ id: "z", color: "#111111" })];
    const groups = groupByMaterial(parts);
    expect(groups.map((g) => g.spec.color)).toEqual(["#111111", "#222222"]);
    expect(groups[0].parts.map((p) => p.part.id)).toEqual(["x", "z"]);
  });

  it("is empty for nothing", () => {
    expect(groupByMaterial([])).toEqual([]);
  });

  it("collapses a real build: far fewer materials than parts, and no part lost", () => {
    for (const [type, inputs, maxMaterials] of [
      ["deck", { lengthM: 4, widthM: 3 }, 8],
      ["tiling", { roomType: "bathroom" }, 6],
      ["paving", {}, 10],
      ["laminate_floor", {}, 10],
    ] as const) {
      const all = placeParts(buildScene(type, inputs, "ro"));
      const groups = groupByMaterial(all);
      expect(groups.length, type).toBeLessThanOrEqual(maxMaterials);
      expect(groups.length, type).toBeLessThan(all.length / 3);
      expect(groups.reduce((n, g) => n + g.parts.length, 0), type).toBe(all.length);
    }
  });
});
