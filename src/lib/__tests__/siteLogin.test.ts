import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as login } from "@/app/api/login/route";
import { GET as logoutGet } from "@/app/api/logout/route";
import { proxy } from "@/proxy";
import { randomBytes, scryptSync } from "node:crypto";
import { SCRYPT, checkCredentials, loginCookieValue, loginSession, safeNext, siteLogin, siteSessionId, validLoginCookie } from "../siteLogin";

const ENV = { SITE_LOGIN_USER: "Demo", SITE_LOGIN_PASSWORD: "correct horse battery staple" };

/** A guest entry like scripts/make-users.mjs writes (same scrypt parameters). */
function guest(login: string, password: string, until?: string): string {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }).toString("base64url");
  return [login, salt, hash, ...(until ? [until] : [])].join(":");
}

describe("siteLogin", () => {
  it("is off unless an account is configured", () => {
    expect(siteLogin({})).toBeNull();
    expect(siteLogin({ SITE_LOGIN_USER: "a" })).toBeNull();
    expect(siteLogin(ENV)).toMatchObject({ accounts: [{ login: "demo", kind: "owner" }], maxAgeS: 7 * 86_400 });
    expect(siteLogin({ ...ENV, SITE_LOGIN_DAYS: "90" })?.maxAgeS).toBe(30 * 86_400);
    expect(siteLogin({ SITE_LOGIN_USERS: guest("hornbach-1", "pw-one-long-enough") })?.accounts.map((a) => a.login)).toEqual(["hornbach-1"]);
  });

  it("checks credentials (user name case-insensitive, password exact)", () => {
    const l = siteLogin(ENV)!;
    expect(checkCredentials(l, " demo ", "correct horse battery staple")).toEqual({ ok: true, account: "demo" });
    expect(checkCredentials(l, "demo", "Correct horse battery staple")).toEqual({ ok: false });
    expect(checkCredentials(l, "other", "correct horse battery staple")).toEqual({ ok: false });
    expect(checkCredentials(l, undefined, "x")).toEqual({ ok: false });
    expect(checkCredentials(l, "demo", "x".repeat(500))).toEqual({ ok: false });
  });

  it("guest accounts: hashed passwords, an end date, revocation", () => {
    const env = { ...ENV, SITE_LOGIN_USERS: [guest("hornbach-1", "alpha-bravo-charl"), guest("hornbach-2", "delta-echo-foxtr", "2026-11-07"), "broken:entry", ""].join(",") };
    const l = siteLogin(env)!;
    expect(l.accounts.map((a) => `${a.login}/${a.kind}`)).toEqual(["demo/owner", "hornbach-1/guest", "hornbach-2/guest"]);
    const before = Date.UTC(2026, 10, 1);
    const after = Date.UTC(2026, 10, 8, 1);
    expect(checkCredentials(l, "Hornbach-1", "alpha-bravo-charl", before)).toEqual({ ok: true, account: "hornbach-1" });
    expect(checkCredentials(l, "hornbach-1", "delta-echo-foxtr", before)).toEqual({ ok: false });
    expect(checkCredentials(l, "hornbach-2", "delta-echo-foxtr", after)).toEqual({ ok: false, expired: true });
    // The wrong password on an expired account says nothing about the expiry.
    expect(checkCredentials(l, "hornbach-2", "nope", after)).toEqual({ ok: false });

    const c2 = loginCookieValue(l, "hornbach-2", Date.UTC(2026, 10, 6));
    expect(c2.maxAge).toBeLessThanOrEqual(2 * 86_400);
    expect(loginSession(l, c2.value, Date.UTC(2026, 10, 6, 12))).toMatchObject({ account: "hornbach-2" });
    expect(loginSession(l, c2.value, after)).toBeNull();

    // Removing the account (or giving it a new password) signs it out everywhere.
    const c1 = loginCookieValue(l, "hornbach-1", before);
    const without = siteLogin({ ...ENV, SITE_LOGIN_USERS: guest("hornbach-2", "delta-echo-foxtr") })!;
    expect(loginSession(without, c1.value, before)).toBeNull();
    // A cookie can't be re-labelled with another account.
    const [v, exp, sid, , sig] = c1.value.split(".");
    const relabelled = [v, exp, sid, Buffer.from("demo").toString("base64url"), sig].join(".");
    expect(loginSession(l, relabelled, before)).toBeNull();
  });

  it("signs cookies that expire and die with a password change", () => {
    const l = siteLogin(ENV)!;
    const now = Date.UTC(2026, 9, 5, 9);
    const c = loginCookieValue(l, "demo", now);
    expect(validLoginCookie(l, c.value, now)).toBe(true);
    expect(validLoginCookie(l, c.value, now + 8 * 86_400_000)).toBe(false);
    expect(validLoginCookie(siteLogin({ ...ENV, SITE_LOGIN_PASSWORD: "new password" })!, c.value, now)).toBe(false);
    expect(validLoginCookie(l, c.value.replace(/.$/, (ch) => (ch === "A" ? "B" : "A")), now)).toBe(false);
    expect(validLoginCookie(l, "v3.99999999999." + "a".repeat(16) + ".ZGVtbw." + "a".repeat(43), now)).toBe(false);
    // Each sign-in gets its own session id (the AI limits apply per device).
    const other = loginCookieValue(l, "demo", now);
    expect(loginSession(l, other.value, now)?.session).not.toBe(loginSession(l, c.value, now)?.session);
    expect(loginSession(l, c.value, now)?.session).toMatch(/^[A-Za-z0-9_-]{16}$/);
  });

  it("only redirects to paths on this site", () => {
    expect(safeNext("/pitch?lang=en")).toBe("/pitch?lang=en");
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil", "/login", "/api/chat", undefined, 5]) expect(safeNext(bad)).toBe("/");
  });
});

describe("the gate", () => {
  beforeEach(() => {
    vi.stubEnv("SITE_LOGIN_USER", ENV.SITE_LOGIN_USER);
    vi.stubEnv("SITE_LOGIN_PASSWORD", ENV.SITE_LOGIN_PASSWORD);
  });
  afterEach(() => vi.unstubAllEnvs());
  const B = "http://localhost:3100";

  it("sends pages to /login (keeping where you were going) and refuses APIs", async () => {
    const page = await proxy(new NextRequest(`${B}/pitch?lang=en`));
    expect(page.status).toBe(303);
    const to = new URL(page.headers.get("location")!);
    expect(to.pathname).toBe("/login");
    expect(to.searchParams.get("next")).toBe("/pitch?lang=en");
    const api = await proxy(new NextRequest(`${B}/api/chat`, { method: "POST" }));
    expect(api.status).toBe(401);
    expect((await proxy(new NextRequest(`${B}/login`))).headers.get("x-middleware-next")).toBe("1");
  });

  it("signs in, lets the cookie through, and signs out", async () => {
    const bad = await login(new Request(`${B}/api/login`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.1" }, body: JSON.stringify({ user: "demo", password: "nope" }) }));
    expect(bad.status).toBe(401);
    expect(bad.headers.get("set-cookie")).toBeNull();

    const ok = await login(new Request(`${B}/api/login`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.1" }, body: JSON.stringify({ user: "demo", password: ENV.SITE_LOGIN_PASSWORD, next: "/pitch" }) }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, next: "/pitch" });
    const setCookie = ok.headers.get("set-cookie")!;
    expect(setCookie).toMatch(/^blueprint_login=v3\.\d+\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}; Path=\/; Max-Age=604800; HttpOnly; SameSite=Lax/);
    const cookie = setCookie.split(";")[0];

    expect(siteSessionId(new Request(`${B}/api/chat`, { headers: { cookie } }))).toMatch(/^[A-Za-z0-9_-]{16}$/);
    const through = await proxy(new NextRequest(`${B}/api/chat`, { method: "POST", headers: { cookie } }));
    expect(through.headers.get("x-middleware-next")).toBe("1");
    // Signed in already: the form steps aside.
    const form = await proxy(new NextRequest(`${B}/login?next=/pitch`, { headers: { cookie } }));
    expect(new URL(form.headers.get("location")!).pathname).toBe("/pitch");

    const out = await logoutGet(new Request(`${B}/api/logout`));
    expect(out.status).toBe(303);
    expect(out.headers.get("set-cookie")).toMatch(/^blueprint_login=; Path=\/; Max-Age=0/);
  });

  it("slows down password guessing", async () => {
    const tryOnce = () =>
      login(new Request(`${B}/api/login`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.99" }, body: JSON.stringify({ user: "demo", password: "guess" }) }));
    const codes = [];
    for (let i = 0; i < 9; i++) codes.push((await tryOnce()).status);
    expect(codes.slice(0, 8).every((c) => c === 401)).toBe(true);
    expect(codes[8]).toBe(429);
  });
});
