import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPassLink } from "@/lib/passToken";
import { verifySession } from "@/lib/session";
import { proxy } from "../proxy";

const SECRET = "test-secret-0123456789-abcdefghijklmnop";
const BASE = "http://localhost:3100";

beforeEach(() => {
  vi.stubEnv("REQUIRE_PASS_LINK", "1");
  vi.stubEnv("PASS_LINK_SECRET", SECRET);
});
afterEach(() => vi.unstubAllEnvs());

describe("proxy: signed pass link → session cookie", () => {
  it("sets an httpOnly session cookie and redirects to the same URL without the token", () => {
    const link = buildPassLink({ memberId: "WL-RO-100231", tenant: "hornbach", hours: 1, secret: SECRET, baseUrl: BASE });
    const res = proxy(new NextRequest(`${link}&lang=en`));
    expect(res.status).toBe(303);
    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("t")).toBeNull();
    expect(location.searchParams.get("retailer")).toBe("hornbach");
    expect(location.searchParams.get("lang")).toBe("en");
    expect(res.headers.get("cache-control")).toBe("no-store");

    const setCookie = res.headers.get("set-cookie")!;
    expect(setCookie).toMatch(/^blueprint_session=v1\./);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).toMatch(/Path=\//);
    const cookie = res.cookies.get("blueprint_session")!;
    expect(cookie.maxAge).toBeGreaterThan(3500);
    expect(cookie.maxAge).toBeLessThanOrEqual(3600);
    expect(verifySession(cookie.value, "hornbach")).toMatchObject({ memberId: "WL-RO-100231" });
  });

  it("refuses a link for another retailer and clears any existing session", () => {
    const link = buildPassLink({ memberId: "WL-RO-100231", tenant: "brico", secret: SECRET, baseUrl: BASE }).replace("retailer=brico", "retailer=hornbach");
    const res = proxy(new NextRequest(link, { headers: { cookie: "blueprint_session=old" } }));
    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("t")).toBeNull();
    expect(location.searchParams.get("pass")).toBe("invalid");
    expect(res.cookies.get("blueprint_session")).toMatchObject({ value: "", maxAge: 0 });
  });

  it("flags an expired link", () => {
    const link = buildPassLink({ memberId: "WL-RO-100231", tenant: "hornbach", hours: 1, secret: SECRET, baseUrl: BASE, now: Date.now() - 2 * 3600_000 });
    const res = proxy(new NextRequest(link));
    expect(new URL(res.headers.get("location")!).searchParams.get("pass")).toBe("expired");
    expect(res.cookies.get("blueprint_session")?.value).toBe("");
  });

  it("does nothing in the demo (REQUIRE_PASS_LINK unset)", () => {
    vi.stubEnv("REQUIRE_PASS_LINK", "");
    const link = buildPassLink({ memberId: "WL-RO-100231", tenant: "hornbach", secret: SECRET, baseUrl: BASE });
    const res = proxy(new NextRequest(link));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("fails loudly in product mode without a secret", () => {
    vi.stubEnv("PASS_LINK_SECRET", "");
    expect(() => proxy(new NextRequest(`${BASE}/?t=v1.a.b`))).toThrow(/PASS_LINK_SECRET/);
  });
});
