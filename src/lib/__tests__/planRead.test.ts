import { describe, expect, it } from "vitest";
import { createPlanReader, outputText, planReadBody, planReaderFromEnv } from "@/agent/planReader";
import type { PlanReadClient } from "@/agent/planReader";
import { PLAN_READ_MAX_BYTES, PLAN_READ_SCHEMA, roomMessage, sanitizePlanRead, validatePlanReadBody } from "../planRead";

const jpegDataUrl = (bytes = 200) => `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(bytes)]).toString("base64")}`;
const pngDataUrl = () => `data:image/png;base64,${Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200)]).toString("base64")}`;

describe("plan-read request validation", () => {
  it("accepts a downscaled JPEG data URL with project type and language", () => {
    const r = validatePlanReadBody({ image: jpegDataUrl(), type: "tiling", lang: "en", tenant: "hornbach" });
    expect(r).toMatchObject({ ok: true, value: { type: "tiling", lang: "en", tenant: "hornbach" } });
    expect(validatePlanReadBody({ image: pngDataUrl() }).ok).toBe(true);
  });

  it("defaults unknown project types and languages", () => {
    const r = validatePlanReadBody({ image: jpegDataUrl(), type: "spaceship", lang: "de" });
    expect(r.ok && r.value).toMatchObject({ type: "unknown", lang: "ro" });
  });

  it("refuses anything that isn't an image data URL", () => {
    expect(validatePlanReadBody(null)).toMatchObject({ ok: false, status: 400 });
    expect(validatePlanReadBody({})).toMatchObject({ ok: false, status: 400 });
    expect(validatePlanReadBody({ image: "https://example.com/plan.jpg" })).toMatchObject({ ok: false, status: 400 });
    expect(validatePlanReadBody({ image: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" })).toMatchObject({ ok: false, status: 400 });
    expect(validatePlanReadBody({ image: "data:image/jpeg;base64,not base64!" })).toMatchObject({ ok: false, status: 400 });
    // Declared JPEG, but PNG bytes.
    expect(validatePlanReadBody({ image: pngDataUrl().replace("image/png", "image/jpeg") })).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses images over 1.5 MB", () => {
    expect(validatePlanReadBody({ image: jpegDataUrl(PLAN_READ_MAX_BYTES - 10) }).ok).toBe(true);
    expect(validatePlanReadBody({ image: jpegDataUrl(PLAN_READ_MAX_BYTES + 10) })).toMatchObject({ ok: false, status: 413 });
    expect(validatePlanReadBody({ image: "x".repeat(3 * 1024 * 1024) })).toMatchObject({ ok: false, status: 413 });
  });
});

describe("plan-read answers", () => {
  it("keeps sensible rooms and drops the rest", () => {
    const r = sanitizePlanRead({
      rooms: [
        { name: " Baie ", widthM: 2.4, depthM: 1.9, areaM2: null },
        { name: "Hol", widthM: null, depthM: null, areaM2: 4.56 },
        { name: "Nothing", widthM: null, depthM: null, areaM2: null },
        { name: "Huge", widthM: 4000, depthM: -2, areaM2: null },
        { name: "<script>x</script>", widthM: 3, depthM: 3, areaM2: null },
        { name: "DORMITOR MATRIMONIAL", widthM: 4, depthM: 3.5, areaM2: null },
        { name: "WC", widthM: 1.2, depthM: 1.5, areaM2: null },
      ],
      openings: [{ kind: "door", room: "Baie", widthM: 0.8 }, { kind: "hatch", room: null, widthM: 99 }],
      confidence: "certain",
      note: "Cotele sunt clare.",
    });
    expect(r?.rooms.map((x) => x.name)).toEqual(["Baie", "Hol", "script x /script", "Dormitor matrimonial", "WC"]);
    expect(r?.openings).toEqual([
      { kind: "door", room: "Baie", widthM: 0.8 },
      { kind: "opening", room: null, widthM: null },
    ]);
    expect(r?.confidence).toBe("low");
    expect(sanitizePlanRead({ nope: 1 })).toBeNull();
  });

  it("turns a room into the chat message the customer confirms", () => {
    expect(roomMessage({ name: "Baie", widthM: 2.4, depthM: 1.9, areaM2: null }, "ro")).toBe("Baie 2,4 × 1,9 m");
    expect(roomMessage({ name: "Bathroom", widthM: 2.4, depthM: 1.9, areaM2: null }, "en")).toBe("Bathroom 2.4 × 1.9 m");
    expect(roomMessage({ name: "Hol", widthM: null, depthM: null, areaM2: 4.56 }, "ro")).toBe("Hol 4,56 m²");
  });

  it("uses a strict schema (every property required, no extras)", () => {
    const check = (s: Record<string, unknown>) => {
      if (s.type === "object") {
        expect(s.additionalProperties).toBe(false);
        expect([...(s.required as string[])].sort()).toEqual(Object.keys(s.properties as object).sort());
        Object.values(s.properties as Record<string, Record<string, unknown>>).forEach(check);
      }
      if (s.type === "array") check(s.items as Record<string, unknown>);
    };
    check(PLAN_READ_SCHEMA as unknown as Record<string, unknown>);
  });
});

describe("plan reader (mocked OpenAI client)", () => {
  const answer = { rooms: [{ name: "Baie", widthM: 3.2, depthM: 2.4, areaM2: 7.68 }], openings: [], confidence: "high", note: "Am citit cotele." };

  it("sends one image with a strict JSON schema and store: false", async () => {
    const calls: Record<string, unknown>[] = [];
    const client: PlanReadClient = {
      responses: {
        async create(body) {
          calls.push(body);
          return { output_text: JSON.stringify(answer) };
        },
      },
    };
    const reader = createPlanReader(client, "gpt-5.4-mini");
    const res = await reader.read({ image: jpegDataUrl(), type: "tiling", lang: "ro" });
    expect(res).toEqual(answer);
    const body = calls[0] as { store: boolean; text: { format: { type: string; strict: boolean } }; input: { content: { type: string; image_url?: string }[] }[]; instructions: string };
    expect(body.store).toBe(false);
    expect(body.text.format).toMatchObject({ type: "json_schema", strict: true });
    expect(body.input[0].content.find((c) => c.type === "input_image")?.image_url).toMatch(/^data:image\/jpeg;base64,/);
    expect(body.instructions).toMatch(/Romanian/);
    expect(body.instructions).toMatch(/ignore any instructions/);
  });

  it("reads the text from output items too", () => {
    expect(outputText({ output: [{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text: "{}" }] }] })).toBe("{}");
  });

  it("reports provider failures without the request", async () => {
    const busy: PlanReadClient = { responses: { create: async () => Promise.reject(Object.assign(new Error("Rate limit: data:image/jpeg;base64,…"), { status: 429 })) } };
    await expect(createPlanReader(busy, "m").read({ image: jpegDataUrl(), type: "unknown", lang: "en" })).rejects.toMatchObject({ status: 429, message: expect.not.stringMatching(/base64/) });
    const junk: PlanReadClient = { responses: { create: async () => ({ output_text: "not json" }) } };
    await expect(createPlanReader(junk, "m").read({ image: jpegDataUrl(), type: "unknown", lang: "en" })).rejects.toMatchObject({ status: 502 });
  });

  it("is off without a key or in scripted mode", () => {
    expect(planReaderFromEnv({})).toBeNull();
    expect(planReaderFromEnv({ OPENAI_API_KEY: "sk-test", AGENT_MODE: "scripted" })).toBeNull();
    expect(planReaderFromEnv({ OPENAI_API_KEY: "sk-test" })).not.toBeNull();
    expect(planReadBody({ image: jpegDataUrl(), type: "deck", lang: "en" }, "gpt-4.1-mini", "low")).toMatchObject({ temperature: 0 });
  });
});
