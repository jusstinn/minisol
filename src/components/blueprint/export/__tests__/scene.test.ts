import * as THREE from "three";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Build, Part } from "../../builders";
import { buildScene } from "../../builders";
import { isPowerOfTwo } from "../pixels";
import { boundsOf, placeParts } from "../placement";
import { buildExportScene, disposeModel } from "../scene";
import { installDomShim } from "./domShim";

let restore: () => void;
beforeAll(() => {
  restore = installDomShim();
});
afterAll(() => restore());

const meshes = (root: THREE.Object3D) => {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => (o as THREE.Mesh).isMesh && out.push(o as THREE.Mesh));
  return out;
};
const box = (root: THREE.Object3D) => new THREE.Box3().setFromObject(root);

const part = (over: Partial<Part> & { id: string }): Part => ({ layer: "deck_board", pos: [0, 0.5, 0], size: [1, 1, 1], color: "#c9935a", delay: 0, grow: "drop", ...over });
const build = (parts: Part[], center?: [number, number]): Build => ({ parts, dims: [], extent: [1, 1, 1], center, layers: [], duration: 1 });

describe("placement in the scene graph", () => {
  it("puts a part at its real position and size, recentred on the plan centre", () => {
    const { root } = buildExportScene(build([part({ id: "a", pos: [13, 0.5, -2], size: [2, 1, 0.5] })], [10, -2]));
    const b = box(root);
    expect(b.min.toArray().map((v) => +v.toFixed(6))).toEqual([2, 0, -0.25]);
    expect(b.max.toArray().map((v) => +v.toFixed(6))).toEqual([4, 1, 0.25]);
  });

  it("fills the part's box whatever shape it draws as: exactly for flat-sided shapes, inside it for round ones", () => {
    // A 14-sided pedestal or a diamond post cap stops short of its box's corners; a bevelled board or a slatted panel fills it.
    for (const [layer, shape, exact] of [["deck_board", undefined, true], ["fence_panel", undefined, true], ["deck_support", undefined, false], ["post_cap", undefined, false], ["item", "cylinder", false]] as const) {
      const { root } = buildExportScene(build([part({ id: "p", layer, shape, pos: [1, 0.3, 2], size: [0.6, 0.6, 0.6] })]));
      const b = box(root);
      for (const [lo, hi, from, to] of [[b.min.x, b.max.x, 0.7, 1.3], [b.min.y, b.max.y, 0, 0.6], [b.min.z, b.max.z, 1.7, 2.3]]) {
        if (exact) {
          expect(lo, layer).toBeCloseTo(from, 3);
          expect(hi, layer).toBeCloseTo(to, 3);
        } else {
          expect(lo, layer).toBeGreaterThanOrEqual(from - 1e-6);
          expect(hi, layer).toBeLessThanOrEqual(to + 1e-6);
          expect(hi - lo, layer).toBeGreaterThan(0.4);
        }
      }
    }
  });

  it("equals the placed bounds of the build (the deck's 4.2 × 3.2 m, 18 cm tall)", () => {
    const deck = buildScene("deck", { lengthM: 4, widthM: 3 }, "ro");
    const model = buildExportScene(deck);
    const want = boundsOf(placeParts(deck))!;
    const got = box(model.root);
    for (let a = 0; a < 3; a++) {
      expect(got.min.getComponent(a)).toBeCloseTo(want.min[a], 3);
      // Screws sit 1 mm above the boards.
      expect(got.max.getComponent(a)).toBeGreaterThanOrEqual(want.max[a] - 1e-3);
      expect(got.max.getComponent(a)).toBeLessThanOrEqual(want.max[a] + 0.0025);
    }
    expect(model.stats.bounds!.max[0] - model.stats.bounds!.min[0]).toBeCloseTo(4.2, 2);
    expect(model.stats.bounds!.min[1]).toBeCloseTo(0, 3);
  });

  it("is centred on the origin on the ground, so AR can put it on the floor", () => {
    for (const [type, inputs] of [["deck", { lengthM: 4, widthM: 3 }], ["tiling", { roomType: "bathroom" }], ["fence", { lengthM: 20 }]] as const) {
      const b = box(buildExportScene(buildScene(type, inputs, "ro")).root);
      expect((b.min.x + b.max.x) / 2, type).toBeCloseTo(0, 1);
      expect((b.min.z + b.max.z) / 2, type).toBeCloseTo(0, 1);
      expect(b.min.y, type).toBeGreaterThanOrEqual(-1e-6);
    }
  });

  it("leaves the surroundings out: the bathroom is the tiles and membrane, not its walls", () => {
    const bath = buildScene("tiling", { roomType: "bathroom" }, "ro");
    const model = buildExportScene(bath);
    const layers = new Set(meshes(model.root).flatMap((m) => (m.userData.layers as string[] | undefined) ?? []));
    expect(layers.has("structure")).toBe(false);
    expect(layers.has("floor_tiles")).toBe(true);
    expect(layers.has("wall_tiles")).toBe(true);
    expect(buildExportScene(bath, { includeContext: true }).stats.parts).toBeGreaterThan(model.stats.parts);
  });

  it("keeps the footings for a download and cuts them for AR", () => {
    const fence = buildScene("fence", { lengthM: 20 }, "ro");
    expect(box(buildExportScene(fence).root).min.y).toBeGreaterThanOrEqual(-1e-6);
    expect(box(buildExportScene(fence, { underground: "keep" }).root).min.y).toBeLessThan(-0.5);
  });
});

describe("merging by material", () => {
  it("makes one mesh per material, each with its own material", () => {
    const deck = buildExportScene(buildScene("deck", { lengthM: 4, widthM: 3 }, "ro"));
    const ms = meshes(deck.root);
    expect(new Set(ms.map((m) => m.material)).size).toBe(ms.length);
    expect(deck.stats.meshes).toBe(ms.length);
    expect(deck.stats.materials).toBe(ms.length);
    // 98 parts → a handful of meshes.
    expect(ms.length).toBeLessThanOrEqual(9);
    expect(deck.stats.parts).toBe(98);
  });

  it("merges the pavers of a path by colour", () => {
    const paving = buildScene("paving", {}, "ro");
    const model = buildExportScene(paving);
    // One mesh per paver colour (three shades), not one per paver.
    const pavers = meshes(model.root).filter((m) => (m.userData.layers as string[]).includes("pavers"));
    expect(pavers.length).toBeLessThanOrEqual(4);
    expect(paving.parts.filter((p) => p.layer === "pavers").length).toBeGreaterThan(300);
  });

  it("indexes the merged geometry (shared vertices) so the file stays small", () => {
    for (const m of meshes(buildExportScene(buildScene("deck", { lengthM: 4, widthM: 3 }, "ro")).root)) {
      expect(m.geometry.index, m.name).not.toBeNull();
      expect(m.geometry.getAttribute("position").count, m.name).toBeLessThan(65536);
    }
  });
});

describe("real-size detail geometry", () => {
  it("draws deck supports as pedestals, not boxes, and boards with a bevel", () => {
    const deck = buildExportScene(buildScene("deck", { lengthM: 4, widthM: 3 }, "ro"));
    const metal = meshes(deck.root).find((m) => (m.userData.layers as string[]).includes("deck_support"))!;
    const supports = buildScene("deck", { lengthM: 4, widthM: 3 }, "ro").parts.filter((p) => p.layer === "deck_support").length;
    // A plain box has 24 vertices; a pedestal (base, column, plate) many more.
    expect(metal.geometry.getAttribute("position").count / supports).toBeGreaterThan(100);
    // A bevelled board has more than a box's 24 vertices (the rounded arrises); the 20 boards come in four colours.
    const boards = meshes(deck.root).filter((m) => (m.userData.layers as string[]).includes("deck_board") && m.name !== "screws");
    expect(boards.reduce((n, m) => n + m.geometry.getAttribute("position").count, 0) / 20).toBeGreaterThan(24);
  });

  it("draws fence panels as separate boards with gaps", () => {
    const fence = buildExportScene(buildScene("fence", { lengthM: 20 }, "ro"));
    const panels = meshes(fence.root).find((m) => (m.userData.layers as string[]).includes("fence_panel"))!;
    expect(panels.geometry.getAttribute("position").count).toBeGreaterThan(11 * 18 * 24);
  });

  it("adds the deck's screw heads, and the lawn's blades", () => {
    const deck = buildExportScene(buildScene("deck", { lengthM: 4, widthM: 3 }, "ro"));
    expect(meshes(deck.root).some((m) => m.name === "screws")).toBe(true);
    const lawn = buildExportScene(buildScene("lawn", {}, "ro"));
    expect(meshes(lawn.root).filter((m) => m.name.startsWith("grass blades")).length).toBeGreaterThan(0);
  });

  it("caps the blades and gives USDZ (a text format with no double-sided material) fewer, with back faces", () => {
    const lawn = buildScene("lawn", {}, "ro");
    const count = (o: Parameters<typeof buildExportScene>[1]) => meshes(buildExportScene(lawn, o).root).filter((m) => m.name.startsWith("grass blades")).reduce((n, m) => n + m.geometry.getAttribute("position").count, 0);
    const glb = count({ format: "glb" });
    const usdz = count({ format: "usdz" });
    expect(glb).toBeLessThanOrEqual(3500 * 6 + 600);
    expect(usdz).toBeLessThan(glb);
    expect(count({ format: "glb", maxBlades: 100 })).toBeLessThanOrEqual(110 * 6);
    expect(count({ format: "glb", maxBlades: 0 })).toBe(0);
    const mats = meshes(buildExportScene(lawn, { format: "glb" }).root).filter((m) => m.name.startsWith("grass blades")).map((m) => m.material as THREE.MeshStandardMaterial);
    expect(mats.every((m) => m.side === THREE.DoubleSide && m.vertexColors)).toBe(true);
    const mu = meshes(buildExportScene(lawn, { format: "usdz" }).root).filter((m) => m.name.startsWith("grass blades")).map((m) => m.material as THREE.MeshStandardMaterial);
    expect(mu.every((m) => m.side === THREE.FrontSide && !m.vertexColors)).toBe(true);
  });
});

describe("materials", () => {
  const finishOf = (root: THREE.Object3D, layer: string) => meshes(root).find((m) => (m.userData.layers as string[]).includes(layer))!.material as THREE.MeshStandardMaterial;

  it("carry the part's colour and the finish's own roughness/metalness", () => {
    const deck = buildExportScene(buildScene("deck", { lengthM: 4, widthM: 3 }, "ro")).root;
    const board = buildScene("deck", { lengthM: 4, widthM: 3 }, "ro").parts.find((p) => p.layer === "deck_board")!;
    const mat = finishOf(deck, "deck_board");
    expect(mat.color.getHexString()).toBe(new THREE.Color(board.color).getHexString());
    expect(mat.roughness).toBeCloseTo(0.75, 2);
    expect(finishOf(deck, "deck_support").metalness).toBeGreaterThan(0.5);
  });

  it("bake baseColor, metallic-roughness and normal maps at power-of-two sizes, in glTF's orientation", () => {
    const model = buildExportScene(buildScene("deck", { lengthM: 4, widthM: 3 }, "ro"));
    const mat = finishOf(model.root, "deck_board");
    for (const t of [mat.map!, mat.roughnessMap!, mat.metalnessMap!, mat.normalMap!]) {
      const img = t.image as { width: number; height: number };
      expect(isPowerOfTwo(img.width) && isPowerOfTwo(img.height)).toBe(true);
      expect(Math.max(img.width, img.height)).toBeLessThanOrEqual(256);
      expect(t.flipY).toBe(false);
      expect(t.repeat.toArray()).toEqual([1, 1]);
    }
    expect(mat.roughnessMap).toBe(mat.metalnessMap);
    expect(mat.map!.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(mat.normalMap!.colorSpace).toBe(THREE.NoColorSpace);
    expect(mat.normalScale.toArray()).toEqual([1, -1]);
  });

  it("honour the texture size cap", () => {
    const small = buildExportScene(buildScene("deck", { lengthM: 4, widthM: 3 }, "ro"), { maxTextureSize: 64 });
    const mat = finishOf(small.root, "deck_board");
    expect(Math.max((mat.map!.image as { width: number }).width, (mat.map!.image as { height: number }).height)).toBeLessThanOrEqual(64);
  });

  it("share textures between materials of the same finish kind", () => {
    const bath = buildExportScene(buildScene("tiling", { roomType: "bathroom" }, "ro"));
    const tiles = meshes(bath.root).filter((m) => (m.material as THREE.MeshStandardMaterial).map);
    const maps = new Set(tiles.map((m) => (m.material as THREE.MeshStandardMaterial).map));
    expect(maps.size).toBeLessThan(tiles.length + 1);
    // 3 finish kinds in a bathroom (membrane, floor tile, wall tile) × 3 images each.
    expect(bath.stats.textures).toBeLessThanOrEqual(3 * 3);
  });

  it("bake the finish's UV repeat into the geometry so a 4 m board and a 1.2 m board share a material", () => {
    const wood = { kind: "wood" as const };
    const model = buildExportScene(build([part({ id: "long", size: [4, 0.03, 0.14], pos: [0, 0.015, 0], finish: wood }), part({ id: "short", size: [1, 0.03, 0.14], pos: [0, 0.015, 1], finish: wood })]));
    expect(meshes(model.root)).toHaveLength(1);
    const uv = meshes(model.root)[0].geometry.getAttribute("uv");
    let maxU = 0;
    for (let i = 0; i < uv.count; i++) maxU = Math.max(maxU, uv.getX(i));
    // 4 m of 0.9 m wood = 4.4 repeats along the board.
    expect(maxU).toBeGreaterThan(4);
    expect(maxU).toBeLessThan(4.6);
  });

  it("give glazed tile its clearcoat and glass-like parts transparency", () => {
    const bath = buildExportScene(buildScene("tiling", { roomType: "bathroom" }, "ro")).root;
    const tile = finishOf(bath, "floor_tiles") as THREE.MeshPhysicalMaterial;
    expect(tile.isMeshPhysicalMaterial).toBe(true);
    expect(tile.clearcoat).toBeGreaterThan(0);
    const glass = buildExportScene(build([part({ id: "g", opacity: 0.3 }), part({ id: "s", color: "#222222", pos: [2, 0.5, 0] })]));
    const ms = meshes(glass.root);
    // Opaque meshes come first, transparent ones last (so they blend over what is behind them).
    expect((ms[ms.length - 1].material as THREE.Material).transparent).toBe(true);
    expect((ms[0].material as THREE.Material).transparent).toBe(false);
    expect((ms[ms.length - 1].material as THREE.Material).opacity).toBe(0.3);
  });

  it("use a plain material for parts with no procedural finish", () => {
    const m = finishOf(buildExportScene(build([part({ id: "p" })])).root, "deck_board");
    expect(m.map).toBeNull();
    expect(m.normalMap).toBeNull();
  });
});

describe("stats", () => {
  it("count what is in the scene", () => {
    const model = buildExportScene(buildScene("tiling", { roomType: "bathroom" }, "ro"));
    const ms = meshes(model.root);
    expect(model.stats.meshes).toBe(ms.length);
    expect(model.stats.vertices).toBe(ms.reduce((n, m) => n + m.geometry.getAttribute("position").count, 0));
    expect(model.stats.triangles).toBe(ms.reduce((n, m) => n + m.geometry.index!.count / 3, 0));
  });

  it("are empty, not a crash, for a build with nothing to show", () => {
    const empty = buildExportScene(build([part({ id: "wall", context: true })]));
    expect(empty.stats).toMatchObject({ meshes: 0, materials: 0, vertices: 0, bounds: null });
    expect(empty.root.children).toHaveLength(0);
  });

  it("can be freed", () => {
    const model = buildExportScene(buildScene("deck", { lengthM: 4, widthM: 3 }, "ro"));
    expect(() => disposeModel(model)).not.toThrow();
  });
});
