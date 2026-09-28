import { afterEach, describe, expect, it, vi } from "vitest";
import { getDataSources } from "@/adapters";
import { signPassToken } from "../passToken";
import { createSession, memberFromRequest, readCookie, SESSION_MAX_S, sessionCookieName, sessionFromRequest, verifySession } from "../session";

const SECRET = "test-secret-0123456789-abcdefghijklmnop";
const PRODUCT = { REQUIRE_PASS_LINK: "1", PASS_LINK_SECRET: SECRET, NODE_ENV: "test" };
const DEMO = { NODE_ENV: "test" };
const nowS = () => Math.floor(Date.now() / 1000);
const sources = getDataSources("hornbach");

const req = (cookie?: string) => new Request("http://localhost/api/quote", { method: "POST", headers: cookie ? { cookie } : {} });
const sessionFor = (memberId: string, tenant = "hornbach", exp = nowS() + 600) =>
  createSession({ m: memberId, t: tenant, exp }, SECRET).value;
const cookieFor = (value: string) => `theme=dark; ${sessionCookieName(PRODUCT)}=${value}; other=1`;

afterEach(() => vi.unstubAllEnvs());

describe("memberFromRequest — demo (REQUIRE_PASS_LINK unset)", () => {
  it("uses the memberId the browser sends, as before", async () => {
    const r = await memberFromRequest(req(), sources, { tenantId: "hornbach", claimedMemberId: "WL-RO-204518" }, DEMO);
    expect(r).toMatchObject({ ok: true, session: null, customer: { memberId: "WL-RO-204518" } });
  });

  it("404s on an unknown or missing member", async () => {
    expect(await memberFromRequest(req(), sources, { tenantId: "hornbach", claimedMemberId: "nobody" }, DEMO)).toMatchObject({ ok: false, status: 404 });
    expect(await memberFromRequest(req(), sources, { tenantId: "hornbach" }, DEMO)).toMatchObject({ ok: false, status: 404 });
  });

  it("ignores session cookies entirely", async () => {
    const r = await memberFromRequest(req(cookieFor(sessionFor("WL-RO-100231"))), sources, { tenantId: "hornbach", claimedMemberId: "WL-RO-204518" }, DEMO);
    expect(r).toMatchObject({ ok: true, customer: { memberId: "WL-RO-204518" } });
  });

  it("reads process.env by default", async () => {
    vi.stubEnv("REQUIRE_PASS_LINK", "");
    expect(sessionFromRequest(req(), "hornbach")).toEqual({ ok: true, session: null });
  });
});

describe("memberFromRequest — product mode (REQUIRE_PASS_LINK=1)", () => {
  it("401s without a session cookie, whatever memberId the body claims", async () => {
    const r = await memberFromRequest(req(), sources, { tenantId: "hornbach", claimedMemberId: "WL-RO-204518" }, PRODUCT);
    expect(r).toMatchObject({ ok: false, status: 401 });
  });

  it("takes the member from the session and ignores the claimed memberId", async () => {
    const r = await memberFromRequest(req(cookieFor(sessionFor("WL-RO-100231"))), sources, { tenantId: "hornbach", claimedMemberId: "WL-RO-204518" }, PRODUCT);
    expect(r).toMatchObject({ ok: true, customer: { memberId: "WL-RO-100231" }, session: { memberId: "WL-RO-100231", tenantId: "hornbach" } });
  });

  it("401s on a tampered, expired, foreign-tenant or link (not session) token", async () => {
    const value = sessionFor("WL-RO-100231");
    const [v, , sig] = value.split(".");
    const forged = [v, Buffer.from(JSON.stringify({ m: "WL-RO-204518", t: "hornbach", exp: nowS() + 600 })).toString("base64url"), sig].join(".");
    const expired = signPassToken({ m: "WL-RO-100231", t: "hornbach", exp: nowS() - 3600 }, SECRET, "session");
    const link = signPassToken({ m: "WL-RO-100231", t: "hornbach", exp: nowS() + 600 }, SECRET, "link");
    for (const bad of [forged, expired, sessionFor("WL-RO-100231", "brico"), link, "garbage"]) {
      const r = await memberFromRequest(req(cookieFor(bad)), sources, { tenantId: "hornbach", claimedMemberId: "WL-RO-100231" }, PRODUCT);
      expect(r).toMatchObject({ ok: false, status: 401 });
    }
  });

  it("404s when the session's member no longer exists", async () => {
    const r = await memberFromRequest(req(cookieFor(sessionFor("WL-RO-000000"))), sources, { tenantId: "hornbach" }, PRODUCT);
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it("throws a clear configuration error without a secret", async () => {
    await expect(memberFromRequest(req(), sources, { tenantId: "hornbach" }, { REQUIRE_PASS_LINK: "1" })).rejects.toThrow(/PASS_LINK_SECRET/);
  });

  it("uses the __Host- cookie in production", () => {
    expect(sessionCookieName({ NODE_ENV: "production" })).toBe("__Host-blueprint_session");
    const value = sessionFor("WL-RO-100231");
    const prod = { ...PRODUCT, NODE_ENV: "production" };
    expect(sessionFromRequest(req(`__Host-blueprint_session=${value}`), "hornbach", prod)).toMatchObject({ ok: true });
    expect(sessionFromRequest(req(`blueprint_session=${value}`), "hornbach", prod)).toMatchObject({ ok: false, status: 401 });
  });
});

describe("createSession", () => {
  it("never outlives the pass link", () => {
    const now = Date.now();
    const s = createSession({ m: "WL-RO-100231", t: "hornbach", exp: Math.floor(now / 1000) + 300 }, SECRET, now);
    expect(s.exp).toBe(Math.floor(now / 1000) + 300);
    expect(s.maxAge).toBe(300);
    expect(verifySession(s.value, "hornbach", PRODUCT, now)).toMatchObject({ memberId: "WL-RO-100231", exp: s.exp });
  });

  it("is capped at SESSION_MAX_S for long-lived links", () => {
    const now = Date.now();
    const s = createSession({ m: "WL-RO-100231", t: "hornbach", exp: Math.floor(now / 1000) + 30 * 86400, l: "en" }, SECRET, now);
    expect(s.maxAge).toBe(SESSION_MAX_S);
    expect(verifySession(s.value, "hornbach", PRODUCT, now)).toMatchObject({ lang: "en" });
  });

  it("returns a non-positive maxAge for a link accepted only thanks to clock skew", () => {
    const now = Date.now();
    expect(createSession({ m: "WL-RO-100231", t: "hornbach", exp: Math.floor(now / 1000) - 10 }, SECRET, now).maxAge).toBeLessThanOrEqual(0);
  });
});

describe("readCookie", () => {
  it("finds a cookie by exact name", () => {
    expect(readCookie("a=1; blueprint_session=xyz; b=2", "blueprint_session")).toBe("xyz");
    expect(readCookie("xblueprint_session=1", "blueprint_session")).toBeUndefined();
    expect(readCookie(null, "blueprint_session")).toBeUndefined();
  });
});
