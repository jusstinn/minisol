import type { DataSources } from "@/adapters/types";
import type { MemberSummary } from "@/components/entry/WalletPass";
import type { Customer, Lang, Store } from "@/domain/types";
import { newNonce, passLinkSecret, requirePassLink, signPassToken, verifyPassToken } from "./passToken";
import type { PassPayload } from "./passToken";

/**
 * Who is the customer? In the demo (default) the browser says so (`memberId` in the body).
 * In product mode (REQUIRE_PASS_LINK=1) only the httpOnly session cookie counts: it is set by
 * src/proxy.ts after verifying a signed pass link, and anything the browser claims is ignored.
 */

type Env = Record<string, string | undefined>;

/** Upper bound for a session, even when the pass link lives longer. */
export const SESSION_MAX_S = 12 * 60 * 60;

export interface PassSession {
  memberId: string;
  tenantId: string;
  /** Unix seconds. */
  exp: number;
  lang?: Lang;
}

export type SessionCheck = { ok: true; session: PassSession | null } | { ok: false; status: 401; error: string };
export type MemberCheck =
  | { ok: true; customer: Customer; session: PassSession | null }
  | { ok: false; status: 401 | 404; error: string };

/** `__Host-` in production: Secure, path "/", no Domain — the browser enforces all three. */
export function sessionCookieName(env: Env = process.env): string {
  return env.NODE_ENV === "production" ? "__Host-blueprint_session" : "blueprint_session";
}

export function sessionCookieOptions(maxAge: number, env: Env = process.env) {
  return { httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge };
}

/**
 * Exchange a verified pass link for a session token. The session never outlives the link
 * (and is capped at SESSION_MAX_S); `maxAge` ≤ 0 means the link is (nearly) expired: set no cookie.
 */
export function createSession(link: PassPayload, secret: string, now = Date.now()): { value: string; exp: number; maxAge: number } {
  const nowS = Math.floor(now / 1000);
  const exp = Math.min(link.exp, nowS + SESSION_MAX_S);
  const value = signPassToken({ m: link.m, t: link.t, exp, ...(link.l ? { l: link.l } : {}), n: newNonce() }, secret, "session");
  return { value, exp, maxAge: exp - nowS };
}

/**
 * Verify a session cookie value for this tenant. Null = no valid session.
 * Throws when PASS_LINK_SECRET is missing, even without a cookie: a misconfigured server must fail loudly.
 */
export function verifySession(value: string | undefined, tenantId: string, env: Env = process.env, now = Date.now()): PassSession | null {
  const secret = passLinkSecret(env);
  if (!value) return null;
  const v = verifyPassToken(value, { secret, tenant: tenantId, purpose: "session", now });
  if (!v.ok) return null;
  return { memberId: v.payload.m, tenantId: v.payload.t, exp: v.payload.exp, ...(v.payload.l ? { lang: v.payload.l } : {}) };
}

export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0 || part.slice(0, i).trim() !== name) continue;
    const raw = part.slice(i + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return undefined;
}

/**
 * Demo: always ok with `session: null` (nothing to check).
 * Product mode: 401 unless the request carries a valid session cookie for `tenantId`.
 */
export function sessionFromRequest(req: Request, tenantId: string, env: Env = process.env, now = Date.now()): SessionCheck {
  if (!requirePassLink(env)) return { ok: true, session: null };
  const session = verifySession(readCookie(req.headers.get("cookie"), sessionCookieName(env)), tenantId, env, now);
  if (!session) return { ok: false, status: 401, error: "No valid pass session: open Blueprint from your loyalty card in Wallet." };
  return { ok: true, session };
}

/**
 * The member for this request. Demo: the `memberId` the browser sent (as before).
 * Product mode: the session's member; `claimedMemberId` is ignored.
 */
export async function memberFromRequest(
  req: Request,
  sources: DataSources,
  opts: { tenantId: string; claimedMemberId?: unknown },
  env: Env = process.env,
): Promise<MemberCheck> {
  const check = sessionFromRequest(req, opts.tenantId, env);
  if (!check.ok) return check;
  const memberId = check.session ? check.session.memberId : String(opts.claimedMemberId ?? "");
  const customer = memberId ? await sources.loyalty.getMember(memberId) : undefined;
  if (!customer) return { ok: false, status: 404, error: "Unknown member" };
  return { ok: true, customer, session: check.session };
}

/** What the entry screen / wallet pass shows about a member (no persona: that is demo-only). */
export function memberSummary(m: Customer, stores: Store[]): MemberSummary {
  return {
    memberId: m.memberId,
    firstName: m.firstName,
    tier: m.tier,
    points: m.points,
    language: m.language,
    city: m.location.city,
    homeStore: stores.find((s) => s.id === m.homeStoreId)?.name ?? m.homeStoreId,
    homeStoreId: m.homeStoreId,
    memberSince: m.memberSince,
    platform: m.walletPass.platform,
    personalization: m.consent.personalization,
  };
}
