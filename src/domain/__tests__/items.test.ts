import { describe, expect, it } from "vitest";
import { buildLayout } from "../../components/blueprint/builders";
import { calculateProject } from "../calculators";
import { ITEMS, itemRect, overlaps } from "../items";
import { applyOps, checkLayout, defaultLayout, layoutParams, SketchEditError } from "../layout";
import type { Layout } from "../layout";

const bath = () => defaultLayout("tiling", { lengthM: 2.5, widthM: 2, roomType: "bathroom" });
const items = (l: Layout) => l.items ?? [];

describe("placing items where the customer says", () => {
  it("puts a toilet next to the door, against the same wall, beside the opening", () => {
    const l0 = bath();
    const door = l0.type === "tiling" ? l0.openings[0] : undefined;
    const { layout, changes } = applyOps(l0, [{ op: "add_item", item: "toilet", near: "door" }], "ro");
    const t = items(layout)[0];
    expect(changes[0]).toMatch(/vas wc lângă ușă/i);
    expect(t.rot).toBe(180); // door is on the front wall → back to the front wall
    const doorX = -2.5 / 2 + door!.pos * 2.5;
    expect(Math.abs(t.x - doorX)).toBeGreaterThanOrEqual(door!.width / 2 + ITEMS.toilet.w / 2);
    expect(t.z + ITEMS.toilet.d / 2).toBeCloseTo(1, 2); // flush with the front wall
  });

  it("puts a washbasin on the left wall and the mirror right above it", () => {
    let l = applyOps(bath(), [{ op: "add_item", item: "sink", wall: "w" }]).layout;
    const sink = items(l)[0];
    expect(sink.rot).toBe(90);
    expect(sink.x - ITEMS.sink.d / 2).toBeCloseTo(-1.25, 2);
    const r = applyOps(l, [{ op: "add_item", item: "mirror", near: "sink" }], "en");
    l = r.layout;
    const mirror = items(l)[1];
    expect(r.changes[0]).toMatch(/above the washbasin/);
    expect(mirror.z).toBeCloseTo(sink.z, 2);
  });

  it("slides a second item along the wall instead of stacking it", () => {
    const l = applyOps(bath(), [
      { op: "add_item", item: "sink", wall: "n" },
      { op: "add_item", item: "toilet", wall: "n" },
    ]).layout;
    const [a, b] = items(l);
    expect(overlaps(itemRect(a), itemRect(b))).toBe(false);
  });

  it("refuses what can't fit or doesn't belong", () => {
    const deck = defaultLayout("deck", { lengthM: 4, widthM: 3 });
    expect(() => applyOps(deck, [{ op: "add_item", item: "toilet" }])).toThrow(SketchEditError);
    expect(() => applyOps(deck, [{ op: "add_item", item: "ceiling_lamp" }])).toThrow(SketchEditError);
    expect(() => applyOps(bath(), [{ op: "add_item", item: "bbq" }])).toThrow(SketchEditError);
    const tiny = defaultLayout("tiling", { lengthM: 1.2, widthM: 1, roomType: "bathroom" });
    expect(() => applyOps(tiny, [{ op: "add_item", item: "bathtub" }, { op: "add_item", item: "bathtub" }])).toThrow(SketchEditError);
  });

  it("stands deck furniture on the deck, in corners and by the steps", () => {
    let deck = defaultLayout("deck", { lengthM: 4, widthM: 3 });
    deck = applyOps(deck, [{ op: "set_height", value: 0.5 }, { op: "add_steps", zone: "A", side: "s" }]).layout;
    const l = applyOps(deck, [
      { op: "add_item", item: "table" },
      { op: "add_item", item: "bbq", corner: "ne" },
      { op: "add_item", item: "garden_light", near: "steps" },
    ]).layout;
    const [table, bbq, light] = items(l);
    expect(table.x).toBeCloseTo(0, 1);
    expect(bbq.x + ITEMS.bbq.w / 2).toBeCloseTo(2, 2);
    expect(bbq.z - ITEMS.bbq.d / 2).toBeCloseTo(-1.5, 2);
    expect(light.z).toBeGreaterThan(0.5);
    // drawn on the deck surface, not the ground
    const parts = buildLayout(l, "ro").parts.filter((p) => p.id.startsWith(`item-${table.id}`));
    expect(Math.min(...parts.map((p) => p.pos[1] - p.size[1] / 2))).toBeGreaterThanOrEqual(0.49);
  });

  it("moves, rotates and removes by kind", () => {
    let l = applyOps(bath(), [{ op: "add_item", item: "sink", wall: "n" }]).layout;
    l = applyOps(l, [{ op: "move_item", item: "sink", wall: "e" }]).layout;
    expect(items(l)[0].rot).toBe(270);
    l = applyOps(l, [{ op: "rotate_item", item: "sink" }]).layout;
    expect(items(l)[0].rot).toBe(0);
    l = applyOps(l, [{ op: "remove_item", item: "sink" }]).layout;
    expect(items(l)).toHaveLength(0);
  });

  it("items the store sells land on the shopping list; context items don't", () => {
    const l = applyOps(bath(), [
      { op: "add_item", item: "toilet", near: "door" },
      { op: "add_item", item: "sink", wall: "w" },
      { op: "add_item", item: "washing_machine", corner: "ne" },
    ]).layout;
    const r = calculateProject("tiling", layoutParams(l));
    expect(r.requirements.find((q) => q.role === "toilet")?.quantity).toBe(1);
    expect(r.requirements.find((q) => q.role === "washbasin")?.quantity).toBe(1);
    expect(r.requirements.some((q) => (q.role as string) === "washing_machine")).toBe(false);
  });

  it("survives the browser round trip and draws with unique ids", () => {
    const l = applyOps(defaultLayout("paint_room", { lengthM: 4, widthM: 3.5 }), [
      { op: "add_item", item: "ceiling_lamp" },
      { op: "add_item", item: "sofa", wall: "s" },
      { op: "add_item", item: "tv", near: "sofa" },
      { op: "add_item", item: "bed", corner: "nw" },
    ]).layout;
    expect(checkLayout(JSON.parse(JSON.stringify(l)), "paint_room")).not.toBeNull();
    expect(checkLayout({ ...l, items: [{ id: "x", kind: "rocket", x: 0, z: 0, rot: 0 }] }, "paint_room")).toBeNull();
    const b = buildLayout(l, "en");
    expect(new Set(b.parts.map((p) => p.id)).size).toBe(b.parts.length);
    expect(b.layers.some((x) => x.id === "ceiling_light")).toBe(true);
    expect(b.layers.some((x) => x.id === "items")).toBe(true);
  });
});

describe("items follow the shape", () => {
  it("shrinking the room pulls items back in; an item that no longer fits is removed with a note", () => {
    let l = applyOps(bath(), [
      { op: "add_item", item: "bathtub", wall: "n" },
      { op: "add_item", item: "sink", wall: "e" },
    ]).layout;
    const r = applyOps(l, [{ op: "resize", w: 1.9, d: 1.6 }], "ro");
    l = r.layout;
    for (const it of items(l)) {
      const rr = itemRect(it);
      expect(rr.minX).toBeGreaterThanOrEqual(-0.96);
      expect(rr.maxX).toBeLessThanOrEqual(0.96);
    }
    const tiny = applyOps(l, [{ op: "resize", w: 1, d: 0.9 }], "ro");
    expect(tiny.changes.some((c) => /nu mai încape/.test(c))).toBe(true);
  });

  it("removing a deck zone moves its furniture to the remaining deck", () => {
    let l = defaultLayout("deck", { lengthM: 4, widthM: 3 });
    l = applyOps(l, [{ op: "add_zone", zone: "A", side: "e", w: 3, d: 3 }]).layout;
    const bZone = l.type === "deck" ? l.zones[1] : undefined;
    l = applyOps(l, [{ op: "add_item", item: "lounger", x: bZone!.x + 1.5, z: bZone!.z + 1.5 }]).layout;
    expect(items(l)[0].zone).toBe("B");
    l = applyOps(l, [{ op: "remove_zone", zone: "B" }]).layout;
    expect(items(l)[0].zone).toBe("A");
  });
});
