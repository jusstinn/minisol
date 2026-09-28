import { describe, expect, it } from "vitest";
import { explainEditError } from "../editErrors";

describe("sketch edit errors for customers", () => {
  // QA 2026-09-28: RO replies and the plan editor showed '("w" must be between 0.5 and 30 m)' and
  // '(The new zone would overlap an existing one — try another side or alignment)'.
  it("speaks Romanian with decimal commas", () => {
    expect(explainEditError('"w" must be between 0.5 and 30 m', "ro")).toBe("dimensiunea trebuie să fie între 0,5 și 30 m");
    expect(explainEditError('"value" must be between 0.1 and 1.2 m', "ro")).toBe("dimensiunea trebuie să fie între 0,1 și 1,2 m");
    expect(explainEditError("The new zone would overlap an existing one — try another side or alignment", "ro")).toMatch(/s-ar suprapune/);
    expect(explainEditError("That fence segment is too short for this gate", "ro")).toMatch(/prea scurt/);
    expect(explainEditError("Maximum 4 flights of steps", "ro")).toBe("cel mult 4 seturi de trepte");
  });

  it("keeps Romanian messages and never leaks unknown English text into Romanian", () => {
    expect(explainEditError("Nu există o versiune anterioară a schiței.", "ro")).toBe("Nu există o versiune anterioară a schiței");
    expect(explainEditError("Unknown edit \"foo\"", "ro")).toBe("modificarea nu se poate face așa");
  });

  it("English stays readable", () => {
    expect(explainEditError('"w" must be between 0.5 and 30 m', "en")).toBe("sizes here go from 0.5 to 30 m");
    expect(explainEditError("Unknown edit \"foo\"", "en")).toBe('Unknown edit "foo"');
  });
});
