import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as chat } from "../chat/route";
import { POST as quote } from "../quote/route";
import { POST as sketch } from "../sketch/route";

/** Malformed or hostile request bodies must get a clean 4xx, never a 500 / stack trace. */
const post = (body: string) => new Request("http://localhost/api", { method: "POST", headers: { "Content-Type": "application/json" }, body });
const M = "WL-RO-100231";

beforeEach(() => vi.stubEnv("AGENT_MODE", "scripted"));
afterEach(() => vi.unstubAllEnvs());

async function events(res: Response) {
  return (await res.text())
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { type: string; message?: string; items?: unknown[] });
}

describe("POST /api/chat input validation", () => {
  it.each(["null", "[]", "5", '"hi"'])("rejects a non-object body %s with 400", async (body) => {
    const res = await chat(post(body));
    expect(res.status).toBe(400);
  });

  it.each([5, { a: 1 }, ["x"], true])("rejects a non-string message (%j) with 400", async (message) => {
    const res = await chat(post(JSON.stringify({ message, memberId: M })));
    expect(res.status).toBe(400);
  });

  it("does not crash on a numeric tenant", async () => {
    const res = await chat(post(JSON.stringify({ message: "salut", memberId: M, tenant: 5, mode: "scripted" })));
    expect(res.status).toBe(200);
    expect((await events(res)).some((e) => e.type === "error")).toBe(false);
  });

  it("ignores an unsupported lang instead of passing it through", async () => {
    const res = await chat(post(JSON.stringify({ message: "salut", memberId: M, lang: "xx", mode: "scripted" })));
    expect(res.status).toBe(200);
    const evs = await events(res);
    expect(evs.some((e) => e.type === "error")).toBe(false);
  });

  it("tolerates junk history items (null, numbers, strings)", async () => {
    const res = await chat(post(JSON.stringify({ message: "nu știu dimensiunile", memberId: M, history: [null, 1, "a", { role: "user", content: "Vreau o terasă" }], mode: "scripted" })));
    const evs = await events(res);
    expect(evs.find((e) => e.type === "error")).toBeUndefined();
    expect(evs.some((e) => e.type === "done")).toBe(true);
  });

  it("bounds the history it echoes back", async () => {
    const history = Array.from({ length: 500 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `m${i}` }));
    const res = await chat(post(JSON.stringify({ message: "salut", memberId: M, history, mode: "scripted" })));
    const h = (await events(res)).find((e) => e.type === "history");
    expect(h?.items?.length).toBeLessThanOrEqual(122);
  });
});

describe("POST /api/quote and /api/sketch input validation", () => {
  it("quote: a numeric tenant is ignored, not a 500", async () => {
    const res = await quote(post(JSON.stringify({ memberId: M, tenant: 1, items: [] })));
    expect(res.status).toBe(200);
  });

  it("sketch: a rejected edit is explained in the customer's language (the plan editor shows `error`)", async () => {
    const state = { basket: [], project: { type: "deck", inputs: { lengthM: 4, widthM: 3 } } };
    const res = await sketch(post(JSON.stringify({ memberId: M, lang: "ro", state, edits: [{ op: "resize", zone: "A", w: 50 }] })));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.error).toBe("dimensiunea trebuie să fie între 0,5 și 30 m");
    expect(body.code).toMatch(/must be between/);
  });

  it("sketch: a numeric tenant is ignored, not a 500", async () => {
    const res = await sketch(post(JSON.stringify({ memberId: M, tenant: 3, edits: [] })));
    expect(res.status).toBeLessThan(500);
  });
});

describe("request size caps", () => {
  it("refuses oversized bodies with 413 before parsing them", async () => {
    const { POST } = await import("../chat/route");
    const big = JSON.stringify({ memberId: "WL-RO-100231", message: "x".repeat(2_100_000) });
    const res = await POST(new Request("http://t/api/chat", { method: "POST", body: big, headers: { "content-type": "application/json" } }));
    expect(res.status).toBe(413);
  });
});
