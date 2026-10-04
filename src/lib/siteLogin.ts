import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * A username/password gate for the whole site, for demos with the live AI on a public URL.
 * On when SITE_LOGIN_USER and SITE_LOGIN_PASSWORD are set (Vercel → Settings → Environment
 * Variables): every page asks to sign in, every API answers 401 without the login cookie.
 *
 * The cookie is `v1.<exp>.<sig>`, signed with a key derived from the password, so changing the
 * password signs everyone out. No accounts, no database. Separate from the pass-link mode
 * (REQUIRE_PASS_LINK), which says *which member* is using it; this says who may use the site.
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

function sign(login: SiteLogin, exp: number): string {
  return createHmac("sha256", key(login)).update(`v1.${exp}`).digest("base64url");
}

export function loginCookieValue(login: SiteLogin, now = Date.now()): { value: string; maxAge: number } {
  const exp = Math.floor(now / 1000) + login.maxAgeS;
  return { value: `v1.${exp}.${sign(login, exp)}`, maxAge: login.maxAgeS };
}

export function validLoginCookie(login: SiteLogin, value: string | undefined, now = Date.now()): boolean {
  if (!value || value.length > 120) return false;
  const m = value.match(/^v1\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/);
  if (!m) return false;
  const exp = Number(m[1]);
  if (exp < Math.floor(now / 1000)) return false;
  const want = Buffer.from(sign(login, exp));
  const got = Buffer.from(m[2]);
  return got.length === want.length && timingSafeEqual(got, want);
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
