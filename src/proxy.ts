import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getTenant } from "@/config/tenant";
import { claimOnce } from "@/lib/budget";
import { maxLinkLifetimeS, passLinkSecret, requirePassLink, verifyPassToken } from "@/lib/passToken";
import { createSession, sessionCookieName, sessionCookieOptions } from "@/lib/session";

/**
 * Signed pass link → session cookie (product mode, REQUIRE_PASS_LINK=1).
 *
 * The customer taps the Blueprint link on their wallet pass: `/?retailer=<tenant>&t=<token>`.
 * We verify the token, exchange it for a short httpOnly session cookie and redirect to the same
 * URL without `t`, so the token never stays in the address bar, history or Referer headers.
 * Only runs for page requests that carry `t` (see matcher); in the demo it is a no-op.
 */
export async function proxy(req: NextRequest) {
  if (!requirePassLink()) return NextResponse.next();

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
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg).*)",
      has: [{ type: "query", key: "t" }],
    },
  ],
};
