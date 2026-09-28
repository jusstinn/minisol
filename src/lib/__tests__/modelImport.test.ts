import { describe, expect, it } from "vitest";
import { modelProjectPrompt, scaleModelDimensions } from "../modelImport";

describe("3D model import", () => {
  it("converts centimetres to metres", () => {
    expect(scaleModelDimensions(400, 260, 300, "cm")).toEqual({ widthM: 4, heightM: 2.6, depthM: 3 });
  });

  it("builds a calculator-compatible Romanian deck request", () => {
    expect(modelProjectPrompt("deck", { widthM: 4, heightM: 0.3, depthM: 3 }, "ro")).toContain("4 m lungime și 3 m lățime");
  });

  it("uses model height for a fence", () => {
    expect(modelProjectPrompt("fence", { widthM: 12, heightM: 1.8, depthM: 0.1 }, "en")).toContain("12 m long and 1.8 m high");
  });
});
