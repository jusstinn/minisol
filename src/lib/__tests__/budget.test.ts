import { afterEach, describe, expect, it, vi } from "vitest";
import { allowAiTurn, allowPlanRead, recordAiTokens, setCounterStore, upstashStore } from "../budget";
import type { CounterStore } from "../budget";

/** A fresh in-memory store per test (the module's default one is shared across tests). */
function fresh(): CounterStore & { keys: string[] } {
  const m = new Map<string, number>();
  const keys: string[] = [];
  return {
    keys,
    async hit(key, _w, by = 1) {
      keys.push(key);
      const n = (m.get(key) ?? 0) + by;
      m.set(key, n);
      return n;
    },
  };
}

afterEach(() => setCounterStore(null));

describe("allowAiTurn", () => {
  it("stops a visitor after LLM_TURNS_PER_10_MIN", async () => {
    setCounterStore(fresh());
    const env = { LLM_TURNS_PER_10_MIN: "3" };
    const who = { ip: "1.1.1.1", tenant: "demo" };
    const got = [];
    for (let i = 0; i < 4; i++) got.push((await allowAiTurn(who, env)).ok);
    expect(got).toEqual([true, true, true, false]);
    expect(await allowAiTurn({ ...who, ip: "2.2.2.2" }, env)).toEqual({ ok: true });
  });

  it("caps a signed-in member per day, whatever IPs they use", async () => {
    setCounterStore(fresh());
    const env = { LLM_MEMBER_TURNS_PER_DAY: "2" };
    const r = [];
    for (const ip of ["a", "b", "c"]) r.push(await allowAiTurn({ ip, tenant: "hornbach", memberId: "WL-1" }, env));
    expect(r.map((x) => x.ok)).toEqual([true, true, false]);
    expect(r[2]).toEqual({ ok: false, reason: "daily AI limit for this member reached" });
  });

  it("caps the whole deployment per day — the backstop for IP rotation", async () => {
    setCounterStore(fresh());
    const env = { LLM_DAILY_TURNS: "5" };
    const r = [];
    for (let i = 0; i < 7; i++) r.push((await allowAiTurn({ ip: `10.0.0.${i}`, tenant: "demo" }, env)).ok);
    expect(r).toEqual([true, true, true, true, true, false, false]);
  });

  it("stops live AI once the day's tokens are used — overall and per member", async () => {
    setCounterStore(fresh());
    const env = { LLM_DAILY_TOKENS: "10000", LLM_MEMBER_TOKENS_PER_DAY: "3000" };
    const member = { ip: "a", tenant: "hornbach", memberId: "WL-1" };
    expect((await allowAiTurn(member, env)).ok).toBe(true);
    await recordAiTokens(member, 3500, env);
    expect(await allowAiTurn(member, env)).toEqual({ ok: false, reason: "daily AI limit for this member reached" });
    expect((await allowAiTurn({ ip: "b", tenant: "hornbach", memberId: "WL-2" }, env)).ok).toBe(true);
    await recordAiTokens({ tenant: "hornbach" }, 7000, env);
    expect(await allowAiTurn({ ip: "c", tenant: "hornbach", memberId: "WL-3" }, env)).toEqual({ ok: false, reason: "daily AI budget reached" });
  });

  it("in Vercel production, no shared store means no live AI — unless explicitly allowed", async () => {
    const prod = { VERCEL_ENV: "production" };
    expect(await allowAiTurn({ ip: "p1", tenant: "demo" }, prod)).toEqual({ ok: false, reason: "AI budget store not configured" });
    expect((await allowPlanRead({ ip: "p1", tenant: "demo" }, prod)).ok).toBe(false);
    expect((await allowAiTurn({ ip: "p2", tenant: "demo" }, { ...prod, ALLOW_MEMORY_BUDGET: "1" })).ok).toBe(true);
    expect((await allowAiTurn({ ip: "p3", tenant: "demo" }, { VERCEL_ENV: "preview" })).ok).toBe(true);
    // Behind the site sign-in only invited people get in: per-instance counters are enough.
    expect((await allowAiTurn({ ip: "p4", tenant: "demo" }, { ...prod, SITE_LOGIN_USER: "u", SITE_LOGIN_PASSWORD: "p" })).ok).toBe(true);
  });

  it("fails closed when the counter store is down", async () => {
    setCounterStore({ hit: async () => Promise.reject(new Error("timeout")) });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await allowAiTurn({ ip: "x", tenant: "demo" }, {})).toEqual({ ok: false, reason: "AI budget check unavailable" });
    warn.mockRestore();
  });

  it("limits plan reading per visitor and per day", async () => {
    setCounterStore(fresh());
    const env = { PLAN_READS_PER_10_MIN: "1", PLAN_READS_PER_DAY: "2" };
    expect((await allowPlanRead({ ip: "a", tenant: "demo" }, env)).ok).toBe(true);
    expect((await allowPlanRead({ ip: "a", tenant: "demo" }, env)).ok).toBe(false);
    expect((await allowPlanRead({ ip: "b", tenant: "demo" }, env)).ok).toBe(true);
    expect(await allowPlanRead({ ip: "c", tenant: "demo" }, env)).toEqual({ ok: false, reason: "daily plan-reading budget reached" });
  });
});

describe("upstashStore", () => {
  it("starts the window once and counts in one round trip", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify([{ result: "OK" }, { result: 3 }])));
    const s = upstashStore("https://eu1-x.upstash.io/", "tok", fetcher as unknown as typeof fetch);
    expect(await s.hit("ai:ip:1.1.1.1", 600_000)).toBe(3);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://eu1-x.upstash.io/pipeline");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body as string)).toEqual([
      ["SET", "ai:ip:1.1.1.1", "0", "PX", "600000", "NX"],
      ["INCRBY", "ai:ip:1.1.1.1", "1"],
    ]);
  });

  it("throws on errors so the caller fails closed", async () => {
    const bad = upstashStore("https://x", "t", (async () => new Response("no", { status: 500 })) as unknown as typeof fetch);
    await expect(bad.hit("k", 1000)).rejects.toThrow(/HTTP 500/);
  });
});
