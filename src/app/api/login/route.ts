import { readJson } from "@/lib/body";
import { clientKey, rateLimit } from "@/lib/rateLimit";
import { checkCredentials, loginCookieName, loginCookieOptions, loginCookieValue, safeNext, siteLogin } from "@/lib/siteLogin";

export const runtime = "nodejs";

/** Sign in to the site gate (src/lib/siteLogin.ts). Slow to brute-force: 8 tries per 10 minutes per visitor. */
export async function POST(req: Request) {
  const login = siteLogin();
  if (!login) return Response.json({ error: "Sign-in is not enabled" }, { status: 404 });

  const ip = clientKey(req);
  const limit = rateLimit(`login:${ip}`, 8, 10 * 60_000);
  if (!limit.ok) return Response.json({ error: "too_many" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterS) } });

  const parsed = await readJson(req, 4_000);
  if (!parsed.ok) return parsed.res;
  const body = parsed.body as { user?: unknown; password?: unknown; next?: unknown } | null;
  if (!body || !checkCredentials(login, body.user, body.password)) {
    console.warn("[login] failed sign-in");
    return Response.json({ error: "invalid" }, { status: 401 });
  }

  const cookie = loginCookieValue(login);
  const res = Response.json({ ok: true, next: safeNext(body.next) }, { headers: { "Cache-Control": "no-store" } });
  const o = loginCookieOptions(cookie.maxAge);
  res.headers.append(
    "Set-Cookie",
    `${loginCookieName()}=${cookie.value}; Path=${o.path}; Max-Age=${o.maxAge}; HttpOnly; SameSite=Lax${o.secure ? "; Secure" : ""}`,
  );
  return res;
}
