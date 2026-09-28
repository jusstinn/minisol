import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The OpenAI SDK is replaced by a fake: no network, and we can see what would be sent.
const create = vi.fn();
vi.mock("openai", () => ({
  default: class {
    responses = { create };
  },
}));

const { GET, POST } = await import("../app/api/plan-read/route");

const jpeg = `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300)]).toString("base64")}`;
let ip = 0;
const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request("http://localhost/api/plan-read", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${++ip}`, ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

beforeEach(() => {
  create.mockReset();
  vi.stubEnv("REQUIRE_PASS_LINK", "");
  vi.stubEnv("AGENT_MODE", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("/api/plan-read", () => {
  it("is unavailable (GET) and answers 501 (POST) without an OpenAI key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(await (await GET(new Request("http://localhost/api/plan-read"))).json()).toEqual({ available: false });
    const res = await post({ image: jpeg, type: "tiling", lang: "ro" });
    expect(res.status).toBe(501);
    expect(create).not.toHaveBeenCalled();
  });

  it("is off in scripted mode even with a key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("AGENT_MODE", "scripted");
    expect(await (await GET(new Request("http://localhost/api/plan-read"))).json()).toEqual({ available: false });
    expect((await post({ image: jpeg })).status).toBe(501);
  });

  it("validates the body before anything else", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    expect((await post("{nope")).status).toBe(400);
    expect((await post({ image: "https://example.com/a.jpg" })).status).toBe(400);
    expect((await post({ image: `data:image/jpeg;base64,${"A".repeat(2_200_000)}` })).status).toBe(413);
    // No (or a lying) content-length: the body is cut off while it streams in.
    const big = new ReadableStream({
      start(c) {
        for (let i = 0; i < 40; i++) c.enqueue(new TextEncoder().encode("A".repeat(100_000)));
        c.close();
      },
    });
    const streamed = await POST(new Request("http://localhost/api/plan-read", { method: "POST", body: big, duplex: "half" } as RequestInit));
    expect(streamed.status).toBe(413);
    expect(create).not.toHaveBeenCalled();
  });

  it("reads the plan with a (mocked) model and returns sanitised rooms", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("OPENAI_MODEL", "gpt-5.4-mini");
    create.mockResolvedValue({
      output_text: JSON.stringify({ rooms: [{ name: "Baie", widthM: 3.2, depthM: 2.4, areaM2: null }], openings: [{ kind: "door", room: "Baie", widthM: 0.8 }], confidence: "high", note: "Cote clare." }),
    });
    expect(await (await GET(new Request("http://localhost/api/plan-read"))).json()).toEqual({ available: true });
    const res = await post({ image: jpeg, type: "tiling", lang: "ro" });
    expect(res.status).toBe(200);
    const { result } = await res.json();
    expect(result.rooms).toEqual([{ name: "Baie", widthM: 3.2, depthM: 2.4, areaM2: null }]);
    expect(create).toHaveBeenCalledTimes(1);
    const body = create.mock.calls[0][0];
    expect(body).toMatchObject({ model: "gpt-5.4-mini", store: false, text: { format: { type: "json_schema", strict: true } } });
  });

  it("maps a provider rate limit to 429 and never logs the image", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    create.mockRejectedValue(Object.assign(new Error(`429 for ${jpeg}`), { status: 429 }));
    const res = await post({ image: jpeg });
    expect(res.status).toBe(429);
    for (const call of warn.mock.calls) expect(call.join(" ")).not.toMatch(/base64/);
    warn.mockRestore();
  });

  it("rate-limits per visitor", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("PLAN_READS_PER_10_MIN", "2");
    create.mockResolvedValue({ output_text: JSON.stringify({ rooms: [], openings: [], confidence: "low", note: "" }) });
    const headers = { "x-forwarded-for": "10.9.9.9" };
    expect((await post({ image: jpeg }, headers)).status).toBe(200);
    expect((await post({ image: jpeg }, headers)).status).toBe(200);
    expect((await post({ image: jpeg }, headers)).status).toBe(429);
  });

  it("requires the pass session in product mode", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("REQUIRE_PASS_LINK", "1");
    vi.stubEnv("PASS_LINK_SECRET", "test-secret-0123456789-abcdefghijklmnop");
    expect((await post({ image: jpeg })).status).toBe(401);
    expect(await (await GET(new Request("http://localhost/api/plan-read"))).json()).toEqual({ available: false });
    expect(create).not.toHaveBeenCalled();
  });
});
