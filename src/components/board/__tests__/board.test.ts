import { describe, expect, it } from "vitest";
import type { SketchChange } from "@/agent/types";
import { km, times, unitText } from "@/lib/format";
import { sketchInFocus } from "../Board";

const change = (source: SketchChange["source"]) => ({
  kind: "change" as const,
  id: "c1",
  change: { edits: [], lines: [], totalBefore: 1, totalAfter: 2, delta: 1, source },
});

describe("desktop board focus", () => {
  // QA 2026-09-28: "adaugă 3 trepte" from the chat left the board on the list — the new sketch and its receipt stayed out of view.
  it("brings the sketch into view after a sketch edit from the chat", () => {
    expect(sketchInFocus({ last: "change", change: change("agent") })).toBe(true);
    expect(sketchInFocus({ last: "project" })).toBe(true);
  });

  it("leaves the view alone for hand edits (the sketch is already on screen) and other updates", () => {
    expect(sketchInFocus({ last: "change", change: change("editor") })).toBe(false);
    expect(sketchInFocus({ last: "quote" })).toBe(false);
    expect(sketchInFocus({ last: "plan" })).toBe(false);
  });
});

describe("store distances", () => {
  it("use the language's decimal separator", () => {
    expect(km(9.9, "ro")).toBe("9,9 km");
    expect(km(9.9, "en")).toBe("9.9 km");
    expect(km(12, "ro")).toBe("12 km");
  });

  it("points multipliers too ('×1.5 tier' in the Romanian list)", () => {
    expect(times(1.5, "ro")).toBe("×1,5");
    expect(times(2, "en")).toBe("×2");
  });

  it("measurement units follow the language (EN showed '11 buc', '20 rânduri')", () => {
    expect(unitText("buc", "en")).toBe("pcs");
    expect(unitText("rânduri", "en")).toBe("rows");
    expect(unitText("rânduri", "ro")).toBe("rânduri");
    expect(unitText("m²", "en")).toBe("m²");
  });
});
