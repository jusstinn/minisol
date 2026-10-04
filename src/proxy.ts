import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getTenant } from "@/config/tenant";
import { claimOnce } from "@/lib/budget";
import { maxLinkLifetimeS, passLinkSecret, requirePassLink, verifyPassToken } from "@/lib/passToken";
import { createSession, sessionCookieName, sessionCookieOptions } from "@/lib/session";
import { loginCookieName, safeNext, siteLogin, validLoginCookie } from "@/lib/siteLogin";
import type { SiteLogin } from "@/lib/siteLogin";

/**
 * Two gates, both off by default (the open demo):
 * - Site sign-in (SITE_LOGIN_USER / SITE_LOGIN_PASSWORD): without the login cookie, pages go to
 *   /login and APIs answer 401 — so a public URL can run the live AI for the people you let in.
 * - Signed pass links (REQUIRE_PASS_LINK=1): `/?retailer=<tenant>&t=<token>` from the member's
 *   wallet pass is verified and exchanged for a short httpOnly session cookie, then the URL is
 *   reloaded without `t`, so the token never stays in the address bar, history or Referer headers.
 */
export async function proxy(req: NextRequest) {
  const login = siteLogin();
  if (login) {
    const stop = siteGate(req, login);
    if (stop) return stop;
  }
  if (requirePassLink() && req.nextUrl.searchParams.has("t") && !req.nextUrl.pathname.startsWith("/api/")) return passLink(req);
  return NextResponse.next();
}

/** Reachable without signing in: the form and the two endpoints it uses. */
const OPEN = new Set(["/login", "/api/login", "/api/logout"]);

function siteGate(req: NextRequest, login: SiteLogin): NextResponse | null {
  const path = req.nextUrl.pathname;
  const signedIn = validLoginCookie(login, req.cookies.get(loginCookieName())?.value);
  if (OPEN.has(path)) {
    // Already signed in: skip the form.
    if (path === "/login" && signedIn) return noStore(NextResponse.redirect(new URL(safeNext(req.nextUrl.searchParams.get("next")), req.url), 303));
    return null;
  }
  if (signedIn) return null;
  if (path.startsWith("/api/")) return noStore(NextResponse.json({ error: "Sign in required" }, { status: 401 }));
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  if (path !== "/" || req.nextUrl.search) url.searchParams.set("next", path + req.nextUrl.search);
  return noStore(NextResponse.redirect(url, 303));
}

async function passLink(req: NextRequest) {
  const secret = passLinkSecret();
  const url = req.nextUrl.clone();
  const token = url.searchParams.get("t");
  url.searchParams.delete("t");
  url.searchParams.delete("pass");

  const tenant = getTenant(url.searchParams.get("retailer"));
  let v = verifyPassToken(token, { secret, tenant: tenant.id, maxLifetimeS: maxLinkLifetimeS() });
  // Single-use links (when the pass backend mints one per tap): a second use is refused.
  if (v.ok && process.env.PASS_LINK_SINGLE_USE === "1") {
    const first = v.payload.n ? await claimOnce(`pass:${tenant.id}:${v.payload.n}`, (v.payload.exp + 120) * 1000 - Date.now()) : false;
    if (!first) v = { ok: false, reason: "used" };
  }
  const session = v.ok ? createSession(v.payload, secret) : null;
  const name = sessionCookieName();

  if (!session || session.maxAge <= 0) {
    // Never fall back to an older session: a shared phone would otherwise show the previous member.
    const reason = v.ok ? "expired" : v.reason;
    console.warn(`[pass-link] rejected (${reason}) for tenant ${tenant.id}`);
    url.searchParams.set("pass", reason === "expired" ? "expired" : "invalid");
    const res = NextResponse.redirect(url, 303);
    res.cookies.set(name, "", sessionCookieOptions(0));
    return noStore(res);
  }

  const res = NextResponse.redirect(url, 303);
  res.cookies.set(name, session.value, sessionCookieOptions(session.maxAge));
  return noStore(res);
}

function noStore(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}

export const config = {
  // Everything but static assets; with both gates off this returns straight away.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
