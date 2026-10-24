import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * A sign-in in front of the whole site, for demos with the live AI on a public URL. On when at
 * least one account is configured (Vercel → Settings → Environment Variables):
 * - the owner: SITE_LOGIN_USER + SITE_LOGIN_PASSWORD;
 * - guests (e.g. the retailer's team): SITE_LOGIN_USERS, a comma-separated list of
 *   `login:salt:hash[:YYYY-MM-DD]` — scrypt hashes, never passwords, and an optional last day.
 *   Made by `node scripts/make-users.mjs`; removing an entry revokes it at once.
 * Every page asks to sign in, every API answers 401 without the login cookie.
 *
 * The cookie is `v3.<exp>.<session>.<account>.<sig>`, signed with a key derived from that account's
 * secret, so changing a password (or removing the account) signs it out everywhere. `session` is
 * random per sign-in (per device): the AI limits and cooldown apply to it.
 */

type Env = Record<string, string | undefined>;

export interface Account {
  login: string;
  kind: "owner" | "guest";
  /** Last moment the account works (unix seconds), for guests with an end date. */
  expires?: number;
  /** Key material for this account's cookies. */
  key: Buffer;
  verify(password: string): boolean;
}

export interface SiteLogin {
  accounts: Account[];
  /** Session length in seconds (SITE_LOGIN_DAYS, default 7). */
  maxAgeS: number;
}

/** scrypt parameters shared with scripts/make-users.mjs. */
export const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 } as const;
const LOGIN = /^[a-z0-9][a-z0-9._@-]{1,39}$/;

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest();
const accountKey = (material: string) => createHmac("sha256", material).update("blueprint:site-login:v3").digest();
const scrypt = (password: string, salt: string) => scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });

/** `login:salt:hash[:YYYY-MM-DD]` entries; malformed ones are skipped (and logged by the caller). */
export function parseGuests(raw: string | undefined): { login: string; salt: string; hash: string; until?: string }[] {
  if (!raw) return [];
  const out: { login: string; salt: string; hash: string; until?: string }[] = [];
  for (const entry of raw.split(",")) {
    const [login, salt, hash, until] = entry.trim().split(":");
    if (!login || !LOGIN.test(login.toLowerCase()) || !/^[A-Za-z0-9_-]{16,}$/.test(salt ?? "") || !/^[A-Za-z0-9_-]{43}$/.test(hash ?? "")) continue;
    if (until !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(until)) continue;
    out.push({ login: login.toLowerCase(), salt, hash, ...(until ? { until } : {}) });
  }
  return out;
}

export function siteLogin(env: Env = process.env): SiteLogin | null {
  const accounts: Account[] = [];
  const user = env.SITE_LOGIN_USER?.trim().toLowerCase();
  const password = env.SITE_LOGIN_PASSWORD;
  if (user && password) {
    const want = sha(password);
    accounts.push({ login: user, kind: "owner", key: accountKey(`${user}\n${password}`), verify: (p) => timingSafeEqual(sha(p), want) });
  }
  for (const g of parseGuests(env.SITE_LOGIN_USERS)) {
    if (accounts.some((a) => a.login === g.login)) continue;
    const want = Buffer.from(g.hash, "base64url");
    accounts.push({
      login: g.login,
      kind: "guest",
      ...(g.until ? { expires: Math.floor(Date.parse(`${g.until}T23:59:59Z`) / 1000) } : {}),
      key: accountKey(`${g.login}\n${g.salt}:${g.hash}`),
      verify: (p) => timingSafeEqual(scrypt(p, g.salt), want),
    });
  }
  if (!accounts.length) return null;
  const days = Number(env.SITE_LOGIN_DAYS);
  return { accounts, maxAgeS: Math.round((Number.isFinite(days) && days > 0 ? Math.min(days, 30) : 7) * 86_400) };
}

const live = (a: Account, nowS: number) => a.expires === undefined || a.expires >= nowS;

/**
 * The account these credentials open, or why not. Roughly constant time: an unknown user name still
 * costs a password check, so timing doesn't reveal which accounts exist. `expired` only when the
 * password was right (so a guest learns their access ended, nobody else learns anything).
 */
export function checkCredentials(login: SiteLogin, user: unknown, password: unknown, now = Date.now()): { ok: true; account: string } | { ok: false; expired?: boolean } {
  if (typeof user !== "string" || typeof password !== "string" || user.length > 200 || password.length > 200) return { ok: false };
  const name = user.trim().toLowerCase();
  const account = login.accounts.find((a) => a.login === name);
  if (!account) {
    scrypt(password, "blueprint-no-such-account");
    return { ok: false };
  }
  if (!account.verify(password)) return { ok: false };
  if (!live(account, Math.floor(now / 1000))) return { ok: false, expired: true };
  return { ok: true, account: account.login };
}

function sign(account: Account, exp: number, session: string, who: string): string {
  return createHmac("sha256", account.key).update(`v3.${exp}.${session}.${who}`).digest("base64url");
}

export function loginCookieValue(login: SiteLogin, accountLogin: string, now = Date.now()): { value: string; maxAge: number } {
  const account = login.accounts.find((a) => a.login === accountLogin);
  if (!account) throw new Error("unknown account");
  const nowS = Math.floor(now / 1000);
  const exp = Math.min(nowS + login.maxAgeS, account.expires ?? Infinity);
  const session = randomBytes(12).toString("base64url");
  const who = Buffer.from(account.login, "utf8").toString("base64url");
  return { value: `v3.${exp}.${session}.${who}.${sign(account, exp, session, who)}`, maxAge: Math.max(0, exp - nowS) };
}

/** The sign-in behind a valid cookie (its session id and account), else null. */
export function loginSession(login: SiteLogin, value: string | undefined, now = Date.now()): { session: string; account: string } | null {
  if (!value || value.length > 200) return null;
  const m = value.match(/^v3\.(\d{1,12})\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{1,64})\.([A-Za-z0-9_-]{43})$/);
  if (!m) return null;
  const exp = Number(m[1]);
  const nowS = Math.floor(now / 1000);
  if (exp < nowS) return null;
  const name = Buffer.from(m[3], "base64url").toString("utf8");
  const account = login.accounts.find((a) => a.login === name);
  if (!account || !live(account, nowS)) return null;
  const want = Buffer.from(sign(account, exp, m[2], m[3]));
  const got = Buffer.from(m[4]);
  return got.length === want.length && timingSafeEqual(got, want) ? { session: m[2], account: account.login } : null;
}

export function validLoginCookie(login: SiteLogin, value: string | undefined, now = Date.now()): boolean {
  return loginSession(login, value, now) !== null;
}

function cookieFrom(req: Request, env: Env): string | undefined {
  const name = loginCookieName(env);
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

/** In an API route: the signed-in sign-in (session id + account), or null when off / not signed in. */
export function siteSignIn(req: Request, env: Env = process.env): { session: string; account: string } | null {
  const login = siteLogin(env);
  return login ? loginSession(login, cookieFrom(req, env)) : null;
}

/** In an API route: the signed-in session's id (null when the sign-in is off or the cookie is missing). */
export function siteSessionId(req: Request, env: Env = process.env): string | null {
  return siteSignIn(req, env)?.session ?? null;
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
