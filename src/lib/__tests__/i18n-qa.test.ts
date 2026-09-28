import { describe, expect, it } from "vitest";
import { tr } from "../i18n";

describe("phone copy", () => {
  // QA 2026-09-28: on a 360–390 px phone the landing placeholder wrapped to 4–5 lines in a 2-line box (clipped, with a scrollbar).
  it("the short landing placeholder fits three ~150 px lines", () => {
    for (const lang of ["ro", "en"] as const) {
      const s = tr("placeholderShort", lang);
      expect(s.length).toBeLessThanOrEqual(45);
      expect(s.length).toBeLessThan(tr("placeholder", lang).length);
    }
  });
});
