import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * A username/password gate for the whole site, for demos with the live AI on a public URL.
 * On when SITE_LOGIN_USER and SITE_LOGIN_PASSWORD are set (Vercel → Settings → Environment
 * Variables): every page asks to sign in, every API answers 401 without the login cookie.
 *
 * The cookie is `v2.<exp>.<session>.<sig>`, signed with a key derived from the password, so changing
 * the password signs everyone out. `session` is random per sign-in (per device): the AI limits and
 * cooldown apply to it, since everyone at a demo may share the same user name. No accounts, no
 * database. Separate from the pass-link mode (REQUIRE_PASS_LINK), which says *which member* is using
 * it; this says who may use the site.
 */

type Env = Record<string, string | undefined>;

export interface SiteLogin {
  user: string;
  password: string;
  /** Session length in seconds (SITE_LOGIN_DAYS, default 7). */
  maxAgeS: number;
}

export function siteLogin(env: Env = process.env): SiteLogin | null {
  const user = env.SITE_LOGIN_USER?.trim();
  const password = env.SITE_LOGIN_PASSWORD;
  if (!user || !password) return null;
  const days = Number(env.SITE_LOGIN_DAYS);
  return { user, password, maxAgeS: Math.round((Number.isFinite(days) && days > 0 ? Math.min(days, 30) : 7) * 86_400) };
}

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest();

/** Constant-time: neither the user name nor the password leaks through timing. */
export function checkCredentials(login: SiteLogin, user: unknown, password: unknown): boolean {
  if (typeof user !== "string" || typeof password !== "string" || user.length > 200 || password.length > 200) return false;
  const okUser = timingSafeEqual(sha(user.trim().toLowerCase()), sha(login.user.toLowerCase()));
  const okPass = timingSafeEqual(sha(password), sha(login.password));
  return okUser && okPass;
}

function key(login: SiteLogin): Buffer {
  return createHmac("sha256", `${login.user}\n${login.password}`).update("blueprint:site-login:v1").digest();
}

function sign(login: SiteLogin, exp: number, session: string): string {
  return createHmac("sha256", key(login)).update(`v2.${exp}.${session}`).digest("base64url");
}

export function loginCookieValue(login: SiteLogin, now = Date.now()): { value: string; maxAge: number } {
  const exp = Math.floor(now / 1000) + login.maxAgeS;
  const session = randomBytes(12).toString("base64url");
  return { value: `v2.${exp}.${session}.${sign(login, exp, session)}`, maxAge: login.maxAgeS };
}

/** The sign-in's session id when the cookie is valid, else null. */
export function loginSession(login: SiteLogin, value: string | undefined, now = Date.now()): string | null {
  if (!value || value.length > 140) return null;
  const m = value.match(/^v2\.(\d{1,12})\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{43})$/);
  if (!m) return null;
  const exp = Number(m[1]);
  if (exp < Math.floor(now / 1000)) return null;
  const want = Buffer.from(sign(login, exp, m[2]));
  const got = Buffer.from(m[3]);
  return got.length === want.length && timingSafeEqual(got, want) ? m[2] : null;
}

export function validLoginCookie(login: SiteLogin, value: string | undefined, now = Date.now()): boolean {
  return loginSession(login, value, now) !== null;
}

/** In an API route: the signed-in session's id (null when the sign-in is off or the cookie is missing). */
export function siteSessionId(req: Request, env: Env = process.env): string | null {
  const login = siteLogin(env);
  if (!login) return null;
  const name = loginCookieName(env);
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return loginSession(login, decodeURIComponent(part.slice(i + 1).trim()));
  }
  return null;
}

/** `__Host-` in production: Secure, path "/", no Domain. */
export function loginCookieName(env: Env = process.env): string {
  return env.NODE_ENV === "production" ? "__Host-blueprint_login" : "blueprint_login";
}

export function loginCookieOptions(maxAge: number, env: Env = process.env) {
  return { httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge };
}

/** Where to go after signing in: only a path on this site (no open redirects). */
export function safeNext(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || next.length > 500) return "/";
  if (next.startsWith("/login") || next.startsWith("/api/")) return "/";
  return next;
}
