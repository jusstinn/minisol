import { describe, expect, it } from "vitest";
import { buildScene } from "../builders";

describe("Build.interior / Build.outdoor flags (cameraPresets.tourArcFor, Scene.tsx's ground halo)", () => {
  it("flags cut-away rooms as interior, not outdoor", () => {
    expect(buildScene("tiling", {}, "ro").interior).toBe(true);
    expect(buildScene("tiling", {}, "ro").outdoor).toBeFalsy();
    expect(buildScene("paint_room", {}, "ro").interior).toBe(true);
  });

  it("flags garden/outdoor projects as outdoor, not interior", () => {
    for (const type of ["deck", "fence", "paving", "lawn"] as const) {
      const b = buildScene(type, {}, "ro");
      expect(b.outdoor, type).toBe(true);
      expect(b.interior, type).toBeFalsy();
    }
  });

  it("an indoor-but-not-room project (laminate, drywall) is neither", () => {
    for (const type of ["laminate_floor", "drywall_partition"] as const) {
      const b = buildScene(type, {}, "ro");
      expect(b.interior, type).toBeFalsy();
      expect(b.outdoor, type).toBeFalsy();
    }
  });
});
