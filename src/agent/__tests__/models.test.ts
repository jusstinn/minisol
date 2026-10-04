import { describe, expect, it } from "vitest";
import type { CounterStore } from "@/lib/budget";
import { estimateTokens, modelSpec, reserve, settle } from "../models";

function store(): CounterStore {
  const m = new Map<string, number>();
  return { hit: async (k, _w, by = 1) => (m.set(k, (m.get(k) ?? 0) + by), m.get(k)!) };
}

describe("model specs", () => {
  it("chat defaults to the fast model; the plan model only when configured", () => {
    expect(modelSpec("chat", {})).toMatchObject({ model: "gpt-5.4-mini", effort: "low", rpm: 0, tpm: 0, rpd: 0 });
    expect(modelSpec("plan", {})).toBeNull();
    expect(modelSpec("plan", { OPENAI_PLAN_MODEL: "gpt-5.5", OPENAI_PLAN_TPM: "10000", OPENAI_PLAN_RPD: "45", OPENAI_PLAN_REASONING_EFFORT: "medium" })).toMatchObject({
      model: "gpt-5.5",
      effort: "medium",
      tpm: 10000,
      rpd: 45,
    });
    expect(modelSpec("chat", { OPENAI_REASONING_EFFORT: "nonsense" })?.effort).toBe("low");
  });
});

describe("the governor", () => {
  const t0 = Date.UTC(2026, 9, 5, 9, 0, 10);

  it("lets calls through until the minute's tokens run out, then asks to wait for the next minute", async () => {
    const s = store();
    const spec = { ...modelSpec("plan", { OPENAI_PLAN_MODEL: "gpt-5.5", OPENAI_PLAN_TPM: "10000" })! };
    expect(await reserve(spec, 4000, t0, s)).toEqual({ ok: true, tokens: 4000 });
    expect(await reserve(spec, 4000, t0, s)).toEqual({ ok: true, tokens: 4000 });
    const third = await reserve(spec, 4000, t0, s);
    expect(third).toEqual({ ok: false, waitMs: 50_000 + 250 });
    // Next minute: room again.
    expect((await reserve(spec, 4000, t0 + 60_000, s)).ok).toBe(true);
  });

  it("a call bigger than the whole minute still goes when the minute is empty", async () => {
    const spec = modelSpec("plan", { OPENAI_PLAN_MODEL: "gpt-5.5", OPENAI_PLAN_TPM: "10000" })!;
    expect((await reserve(spec, 14000, t0, store())).ok).toBe(true);
  });

  it("corrects the estimate with real usage", async () => {
    const s = store();
    const spec = modelSpec("chat", { OPENAI_TPM: "10000" })!;
    await reserve(spec, 9000, t0, s);
    await settle(spec, 9000, 3000, t0, s);
    expect((await reserve(spec, 6000, t0, s)).ok).toBe(true);
  });

  it("stops at the daily request limit and per-minute request limit", async () => {
    const s = store();
    const spec = modelSpec("chat", { OPENAI_RPD: "2", OPENAI_RPM: "5" })!;
    expect((await reserve(spec, 10, t0, s)).ok).toBe(true);
    expect((await reserve(spec, 10, t0 + 61_000, s)).ok).toBe(true);
    expect(await reserve(spec, 10, t0 + 122_000, s)).toEqual({ ok: false, reason: "gpt-5.4-mini: daily request limit reached" });
    const rpm = modelSpec("chat", { OPENAI_RPM: "1" })!;
    const s2 = store();
    expect((await reserve(rpm, 10, t0, s2)).ok).toBe(true);
    expect(await reserve(rpm, 10, t0, s2)).toMatchObject({ ok: false, waitMs: 50_250 });
  });

  it("estimates tokens from the request size plus the answer's room", () => {
    expect(estimateTokens(["x".repeat(4000)], 1500)).toBe(2500);
  });
});

describe("writtenIn", () => {
  it("follows the language the customer wrote in", async () => {
    const { writtenIn } = await import("../run");
    expect(writtenIn("Refac baia: 2,5 x 2 m, gresie pe jos și faianță pe pereți.")).toBe("ro");
    expect(writtenIn("Vreau un gard de 20 m")).toBe("ro");
    expect(writtenIn("I want to build a 4 x 3 m deck")).toBe("en");
    expect(writtenIn("4 x 3")).toBeUndefined();
  });
});
