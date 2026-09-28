import { describe, expect, it } from "vitest";
import { getTenant } from "../tenant";

describe("getTenant", () => {
  it("resolves known tenants case-insensitively", () => {
    expect(getTenant("hornbach").id).toBe("hornbach");
    expect(getTenant("HORNBACH").id).toBe("hornbach");
  });

  it("falls back to the demo tenant for unknown ids", () => {
    expect(getTenant("nope").id).toBe("demo");
    expect(getTenant("").id).toBe("demo");
  });

  // ?retailer=constructor used to return Object (500 on the page); a number crashed the API routes.
  it.each(["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"])("never resolves prototype members (%s)", (id) => {
    expect(getTenant(id)).toEqual(expect.objectContaining({ id: "demo", name: "Atelier" }));
  });

  it.each([5, {}, ["hornbach"], true])("treats non-string ids as not given (%j)", (id) => {
    expect(getTenant(id).id).toBe("demo");
  });
});
