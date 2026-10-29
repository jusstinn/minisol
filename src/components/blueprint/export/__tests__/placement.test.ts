import { describe, expect, it } from "vitest";
import type { Build, Part } from "../../builders";
import { buildScene } from "../../builders";
import { boundsOf, exportOrigin, isExportable, placeParts } from "../placement";

const part = (over: Partial<Part> & { id: string }): Part => ({ layer: "deck_board", pos: [0, 0.1, 0], size: [1, 0.2, 1], color: "#c9935a", delay: 0, grow: "drop", ...over });
const build = (parts: Part[], center?: [number, number]): Pick<Build, "parts" | "center"> => ({ parts, center });

describe("which parts are exported", () => {
  it("leaves out context (walls, slab) by default and keeps it when asked", () => {
    const parts = [part({ id: "a" }), part({ id: "wall", context: true }), part({ id: "slab", context: true, layer: "structure" })];
    expect(placeParts(build(parts)).map((p) => p.part.id)).toEqual(["a"]);
    expect(placeParts(build(parts), { includeContext: true }).map((p) => p.part.id)).toEqual(["a", "wall", "slab"]);
  });

  it("skips invisible and degenerate parts", () => {
    const parts = [
      part({ id: "ok" }),
      part({ id: "ghost", opacity: 0 }),
      part({ id: "glass", opacity: 0.3 }),
      part({ id: "flat", size: [1, 0.0004, 1] }),
      part({ id: "nan", size: [1, Number.NaN, 1] }),
      part({ id: "inf", pos: [Infinity, 0, 0] }),
    ];
    expect(placeParts(build(parts)).map((p) => p.part.id)).toEqual(["ok", "glass"]);
    expect(isExportable(parts[1])).toBe(false);
  });

  it("keeps the order of the build", () => {
    const parts = ["c", "a", "b"].map((id) => part({ id }));
    expect(placeParts(build(parts)).map((p) => p.part.id)).toEqual(["c", "a", "b"]);
  });

  it("exports no context for the real projects (the customer buys the floor, not the room)", () => {
    const bath = buildScene("tiling", { roomType: "bathroom" }, "ro");
    const placed = placeParts(bath);
    expect(placed.length).toBeGreaterThan(0);
    expect(placed.every((p) => !p.part.context)).toBe(true);
    expect(placed.length).toBe(bath.parts.filter((p) => !p.context).length);
  });
});

describe("where parts sit", () => {
  it("recentres x/z on the plan centre and leaves y alone (y = 0 is the floor)", () => {
    const placed = placeParts(build([part({ id: "a", pos: [12, 0.3, -4] })], [10, -5]));
    expect(placed[0].pos).toEqual([2, 0.3, 1]);
  });

  it("uses the origin when the build has no centre", () => {
    expect(exportOrigin({})).toEqual([0, 0]);
    expect(placeParts(build([part({ id: "a", pos: [1, 0.1, 2] })]))[0].pos).toEqual([1, 0.1, 2]);
  });

  it("keeps each part's real size", () => {
    const placed = placeParts(build([part({ id: "a", size: [4, 0.028, 0.145] })]));
    expect(placed[0].size).toEqual([4, 0.028, 0.145]);
  });
});

describe("the ground", () => {
  const footing = part({ id: "footing", layer: "post_concrete", pos: [0, -0.3, 0], size: [0.3, 0.6, 0.3] });
  const straddling = part({ id: "post", pos: [0, 0.4, 0], size: [0.1, 1.4, 0.1] }); // -0.3 .. 1.1
  const above = part({ id: "board", pos: [0, 0.5, 0], size: [1, 0.1, 1] });

  it("clips by default: drops what is entirely underground and cuts the rest at the floor", () => {
    const placed = placeParts(build([footing, straddling, above]));
    expect(placed.map((p) => p.part.id)).toEqual(["post", "board"]);
    const post = placed[0];
    expect(post.pos[1] - post.size[1] / 2).toBeCloseTo(0, 9);
    expect(post.pos[1] + post.size[1] / 2).toBeCloseTo(1.1, 9);
    expect(placed[1].pos).toEqual([0, 0.5, 0]);
  });

  it("keeps the underground for a download", () => {
    const placed = placeParts(build([footing, straddling]), { underground: "keep" });
    expect(placed.map((p) => p.part.id)).toEqual(["footing", "post"]);
    expect(placed[0].pos[1]).toBe(-0.3);
    expect(placed[1].size[1]).toBe(1.4);
  });

  it("a part resting on the floor is left exactly as it is", () => {
    const resting = part({ id: "r", pos: [0, 0.05, 0], size: [1, 0.1, 1] });
    expect(placeParts(build([resting]))[0]).toMatchObject({ pos: [0, 0.05, 0], size: [1, 0.1, 1] });
  });

  it("the real fence loses its footings below the floor but keeps posts, caps and panels", () => {
    const fence = buildScene("fence", { lengthM: 20 }, "ro");
    const clipped = placeParts(fence);
    expect(clipped.some((p) => p.part.layer === "post_concrete")).toBe(false);
    expect(Math.min(...clipped.map((p) => p.pos[1] - p.size[1] / 2))).toBeGreaterThanOrEqual(-1e-9);
    const kept = placeParts(fence, { underground: "keep" });
    expect(kept.some((p) => p.part.layer === "post_concrete")).toBe(true);
    expect(boundsOf(kept)!.min[1]).toBeLessThan(-0.5);
  });
});

describe("bounds", () => {
  it("are the union of the placed boxes", () => {
    const placed = placeParts(build([part({ id: "a", pos: [-1, 0.1, 0], size: [2, 0.2, 1] }), part({ id: "b", pos: [2, 0.5, 1], size: [2, 1, 1] })]));
    expect(boundsOf(placed)).toEqual({ min: [-2, 0, -0.5], max: [3, 1, 1.5] });
  });

  it("are null for nothing", () => {
    expect(boundsOf([])).toBeNull();
  });
});

describe("the exported extent equals the build's extent", () => {
  // A deck's boards overhang the framing by a few centimetres and a paved path has its edging: the
  // model may exceed `build.extent` slightly, and by a hair (turf is drawn 1 cm inside its zone)
  // fall short of it, but it must be the same footprint, centred on the origin — that is what puts
  // it in the middle of the room in AR. A fence or a partition is a line: only its length counts.
  const areas: [string, Record<string, unknown>][] = [
    ["deck", { lengthM: 4, widthM: 3 }],
    ["tiling", { roomType: "bathroom" }],
    ["lawn", {}],
    ["paving", {}],
    ["laminate_floor", {}],
  ];
  const lines: [string, Record<string, unknown>][] = [
    ["fence", { lengthM: 20 }],
    ["drywall_partition", {}],
  ];
  const centred = (b: NonNullable<ReturnType<typeof boundsOf>>) => {
    expect((b.min[0] + b.max[0]) / 2).toBeCloseTo(0, 1);
    expect((b.min[2] + b.max[2]) / 2).toBeCloseTo(0, 1);
    // On the floor, not floating or sunk.
    expect(b.min[1]).toBeGreaterThanOrEqual(-1e-9);
    expect(b.min[1]).toBeLessThan(0.02);
  };
  for (const [type, inputs] of areas) {
    it(`${type}: the footprint of the build, centred on the origin`, () => {
      const b = buildScene(type as never, inputs, "ro");
      const bb = boundsOf(placeParts(b))!;
      const [w, , d] = b.extent;
      expect(bb.max[0] - bb.min[0]).toBeGreaterThanOrEqual(w - 0.05);
      expect(bb.max[2] - bb.min[2]).toBeGreaterThanOrEqual(d - 0.05);
      expect(bb.max[0] - bb.min[0]).toBeLessThan(w + 0.4);
      expect(bb.max[2] - bb.min[2]).toBeLessThan(d + 0.4);
      centred(bb);
    });
  }
  for (const [type, inputs] of lines) {
    it(`${type}: the length of the build, centred on the origin`, () => {
      const b = buildScene(type as never, inputs, "ro");
      const bb = boundsOf(placeParts(b))!;
      expect(bb.max[0] - bb.min[0]).toBeGreaterThanOrEqual(b.extent[0] - 0.05);
      expect(bb.max[0] - bb.min[0]).toBeLessThan(b.extent[0] + 0.4);
      centred(bb);
    });
  }


  it("deck 4 × 3 m: 4.2 × 3.2 m with the boards' overhang, 18 cm tall", () => {
    const bb = boundsOf(placeParts(buildScene("deck", { lengthM: 4, widthM: 3 }, "ro")))!;
    expect(bb.max[0] - bb.min[0]).toBeCloseTo(4.2, 2);
    expect(bb.max[2] - bb.min[2]).toBeCloseTo(3.2, 2);
    expect(bb.max[1]).toBeCloseTo(0.18, 2);
  });

  it("follows the plan centre when the drawing is not at the origin", () => {
    const b = buildScene("deck", { lengthM: 4, widthM: 3 }, "ro");
    const shifted: Build = { ...b, center: [7, -3], parts: b.parts.map((p) => ({ ...p, pos: [p.pos[0] + 7, p.pos[1], p.pos[2] - 3] })) };
    const a = boundsOf(placeParts(b))!;
    const c = boundsOf(placeParts(shifted))!;
    for (let i = 0; i < 3; i++) {
      expect(c.min[i]).toBeCloseTo(a.min[i], 9);
      expect(c.max[i]).toBeCloseTo(a.max[i], 9);
    }
  });
});
