import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildPassLink, CLOCK_SKEW_S, passLinkSecret, requirePassLink, signPassToken, verifyPassToken } from "../passToken";
import type { PassPayload } from "../passToken";

const SECRET = "test-secret-0123456789-abcdefghijklmnop";
const NOW = Date.UTC(2026, 8, 27, 12, 0, 0);
const nowS = NOW / 1000;
const payload: PassPayload = { m: "WL-RO-100231", t: "hornbach", exp: nowS + 3600, l: "ro", n: "abc123" };
const verify = (token: unknown, over: Partial<{ secret: string; tenant: string; now: number; purpose: "link" | "session" }> = {}) =>
  verifyPassToken(token, { secret: SECRET, tenant: "hornbach", now: NOW, ...over });

/** Replace one segment of a v1.payload.sig token. */
const withSegment = (token: string, i: number, value: string) => token.split(".").map((p, j) => (j === i ? value : p)).join(".");
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");

describe("signPassToken / verifyPassToken", () => {
  it("round-trips the payload", () => {
    const token = signPassToken(payload, SECRET);
    expect(token).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
    expect(verify(token)).toEqual({ ok: true, payload });
  });

  it("round-trips a minimal payload (no language, no nonce)", () => {
    const token = signPassToken({ m: "WL-RO-309877", t: "demo", exp: nowS + 60 }, SECRET);
    expect(verify(token, { tenant: "demo" })).toEqual({ ok: true, payload: { m: "WL-RO-309877", t: "demo", exp: nowS + 60 } });
  });

  it("is the documented HMAC-SHA256 over 'v1.<payload>' (what the pass backend implements)", () => {
    const body = `v1.${b64(JSON.stringify({ m: "WL-RO-100231", t: "hornbach", exp: nowS + 3600 }))}`;
    const token = `${body}.${createHmac("sha256", SECRET).update(body).digest("base64url")}`;
    expect(verify(token)).toMatchObject({ ok: true, payload: { m: "WL-RO-100231" } });
  });

  it("rejects a tampered payload (other member, same signature)", () => {
    const token = signPassToken(payload, SECRET);
    const forged = withSegment(token, 1, b64(JSON.stringify({ ...payload, m: "WL-RO-204518" })));
    expect(verify(forged)).toEqual({ ok: false, reason: "signature" });
  });

  it("rejects a tampered or truncated signature", () => {
    const token = signPassToken(payload, SECRET);
    const sig = token.split(".")[2];
    const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
    expect(verify(withSegment(token, 2, flipped))).toEqual({ ok: false, reason: "signature" });
    expect(verify(withSegment(token, 2, sig.slice(0, -1)))).toEqual({ ok: false, reason: "signature" });
    expect(verify(withSegment(token, 2, sig + "A"))).toEqual({ ok: false, reason: "signature" });
  });

  it("rejects a token signed with another secret", () => {
    const token = signPassToken(payload, "another-secret-0123456789-abcdefghijkl");
    expect(verify(token)).toEqual({ ok: false, reason: "signature" });
  });

  it("keeps link and session tokens apart", () => {
    const link = signPassToken(payload, SECRET, "link");
    const session = signPassToken(payload, SECRET, "session");
    expect(verify(link, { purpose: "session" })).toEqual({ ok: false, reason: "signature" });
    expect(verify(session)).toEqual({ ok: false, reason: "signature" });
    expect(verify(session, { purpose: "session" })).toMatchObject({ ok: true });
  });

  it("rejects expired tokens, allowing 60 s of clock skew", () => {
    const token = signPassToken({ ...payload, exp: nowS - 30 }, SECRET);
    expect(verify(token)).toMatchObject({ ok: true });
    expect(verify(token, { now: NOW + (CLOCK_SKEW_S - 30) * 1000 })).toMatchObject({ ok: true });
    expect(verify(token, { now: NOW + (CLOCK_SKEW_S - 29) * 1000 })).toEqual({ ok: false, reason: "expired" });
    expect(verify(signPassToken({ ...payload, exp: nowS - 3600 }, SECRET))).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a token for another tenant", () => {
    const token = signPassToken({ ...payload, t: "brico" }, SECRET);
    expect(verify(token)).toEqual({ ok: false, reason: "tenant" });
    expect(verify(token, { tenant: "brico" })).toMatchObject({ ok: true });
  });

  it("rejects unknown versions", () => {
    const token = signPassToken(payload, SECRET);
    expect(verify(withSegment(token, 0, "v2"))).toEqual({ ok: false, reason: "version" });
    expect(verify(withSegment(token, 0, ""))).toEqual({ ok: false, reason: "version" });
  });

  it("rejects malformed input", () => {
    const token = signPassToken(payload, SECRET);
    for (const bad of [undefined, null, 42, {}, "", "v1", "v1.abc", `${token}.x`, "v1..sig", "v1.a+b.c/d", "x".repeat(3000)]) {
      expect(verify(bad).ok, String(bad).slice(0, 20)).toBe(false);
    }
    expect(verify("v1.abc")).toEqual({ ok: false, reason: "malformed" });
    expect(verify("v1.a+b.c/d")).toEqual({ ok: false, reason: "malformed" });
  });

  it("rejects correctly signed payloads that are not valid JSON or have invalid fields", () => {
    const signed = (json: string) => {
      const body = `v1.${b64(json)}`;
      return `${body}.${createHmac("sha256", SECRET).update(body).digest("base64url")}`;
    };
    expect(verify(signed("not json"))).toEqual({ ok: false, reason: "malformed" });
    expect(verify(signed("[1,2]"))).toEqual({ ok: false, reason: "malformed" });
    expect(verify(signed(JSON.stringify({ t: "hornbach", exp: nowS + 60 })))).toEqual({ ok: false, reason: "malformed" });
    expect(verify(signed(JSON.stringify({ m: "WL 1", t: "hornbach", exp: nowS + 60 })))).toEqual({ ok: false, reason: "malformed" });
    expect(verify(signed(JSON.stringify({ m: "WL-1", t: "hornbach", exp: "soon" })))).toEqual({ ok: false, reason: "malformed" });
    expect(verify(signed(JSON.stringify({ m: "WL-1", t: "hornbach", exp: nowS + 60, l: "de" })))).toEqual({ ok: false, reason: "malformed" });
  });

  it("refuses to sign an invalid payload", () => {
    expect(() => signPassToken({ ...payload, m: "" }, SECRET)).toThrow();
    expect(() => signPassToken({ ...payload, exp: 1.5 }, SECRET)).toThrow();
  });
});

describe("configuration", () => {
  it("product mode is REQUIRE_PASS_LINK=1", () => {
    expect(requirePassLink({})).toBe(false);
    expect(requirePassLink({ REQUIRE_PASS_LINK: "0" })).toBe(false);
    expect(requirePassLink({ REQUIRE_PASS_LINK: "1" })).toBe(true);
    expect(requirePassLink({ REQUIRE_PASS_LINK: "true" })).toBe(true);
  });

  it("requires a secret of at least 32 characters", () => {
    expect(() => passLinkSecret({})).toThrow(/PASS_LINK_SECRET is not set/);
    expect(() => passLinkSecret({ PASS_LINK_SECRET: "short" })).toThrow(/too short/);
    expect(passLinkSecret({ PASS_LINK_SECRET: SECRET })).toBe(SECRET);
  });
});

describe("buildPassLink", () => {
  it("builds <base>/?retailer=<tenant>&t=<token> with a verifiable token", () => {
    const link = buildPassLink({ memberId: "WL-RO-204518", tenant: "hornbach", hours: 2, secret: SECRET, baseUrl: "https://blueprint.example.com", now: NOW });
    const url = new URL(link);
    expect(url.origin + url.pathname).toBe("https://blueprint.example.com/");
    expect(url.searchParams.get("retailer")).toBe("hornbach");
    const v = verify(url.searchParams.get("t"));
    expect(v).toMatchObject({ ok: true, payload: { m: "WL-RO-204518", t: "hornbach", exp: nowS + 7200 } });
    expect(v.ok && v.payload.n).toBeTruthy();
  });

  it("gives every link a fresh nonce", () => {
    const a = buildPassLink({ memberId: "WL-RO-204518", tenant: "demo", secret: SECRET, baseUrl: "http://localhost:3100" });
    const b = buildPassLink({ memberId: "WL-RO-204518", tenant: "demo", secret: SECRET, baseUrl: "http://localhost:3100" });
    expect(a).not.toBe(b);
  });

  it("rejects a non-positive lifetime", () => {
    expect(() => buildPassLink({ memberId: "WL-RO-204518", tenant: "demo", secret: SECRET, hours: 0 })).toThrow();
  });
});
