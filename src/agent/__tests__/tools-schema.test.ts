import { describe, expect, it } from "vitest";
import { TOOL_DEFINITIONS } from "../tools";

/** A strict OpenAI function-calling schema must list every property as required (nullable via `type: [..., "null"]` for the optional ones) and reject stray fields. */
function assertStrictValid(params: unknown, name: string) {
  const p = params as { type: string; properties?: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
  expect(p.type, `${name}: top-level type`).toBe("object");
  expect(p.additionalProperties, `${name}: additionalProperties`).toBe(false);
  const props = Object.keys(p.properties ?? {});
  expect([...(p.required ?? [])].sort(), `${name}: required must list every property`).toEqual([...props].sort());
}

describe("tool schemas stay strict-valid", () => {
  it("every top-level strict tool has properties === required, additionalProperties false", () => {
    for (const tool of TOOL_DEFINITIONS) {
      if (!tool.strict) continue;
      assertStrictValid(tool.parameters, tool.name);
    }
  });

  it("nested object schemas (e.g. modify_basket's operations items) are strict-valid too", () => {
    const basket = TOOL_DEFINITIONS.find((t) => t.name === "modify_basket")!;
    const ops = basket.parameters.properties.operations as { items: { type: string; properties: Record<string, unknown>; required: string[]; additionalProperties: boolean } };
    assertStrictValid(ops.items, "modify_basket.operations.items");
  });
});

describe("control_view's camera field", () => {
  const tool = TOOL_DEFINITIONS.find((t) => t.name === "control_view")!;

  it("is present, nullable, and offers exactly the six presets", () => {
    const props = tool.parameters.properties as Record<string, { type: string[]; enum: (string | null)[] }>;
    expect(props.camera.type).toEqual(["string", "null"]);
    expect(props.camera.enum).toEqual(["iso", "top", "front", "side", "eye", "tour", null]);
  });

  it("is required (nullable fields are still listed, per strict mode)", () => {
    expect(tool.parameters.required).toContain("camera");
  });
});
