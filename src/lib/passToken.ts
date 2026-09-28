import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Signed pass links (product mode).
 *
 * In production the customer never picks who they are: they tap the Blueprint link on the back of
 * their WalletLoop wallet pass, and WalletLoop's pass backend signs that link for them:
 *
 *   v1.<base64url(JSON payload)>.<base64url(HMAC-SHA256(secret, "v1.<base64url(JSON payload)>"))>
 *
 * payload = { m: memberId, t: tenantId, exp: unix seconds, l?: "ro" | "en", n?: nonce }
 *
 * The same format (with a derived key, see `keyFor`) is reused for the short session cookie the
 * app sets after verifying a link, so a session cookie can never be replayed as a link or vice versa.
 *
 * Node runtime only (node:crypto). Never log tokens.
 */

export type PassLang = "ro" | "en";

export interface PassPayload {
  /** WalletLoop member id. */
  m: string;
  /** Tenant (retailer) id the pass belongs to. */
  t: string;
  /** Expiry, unix seconds. */
  exp: number;
  /** Preferred language. */
  l?: PassLang;
  /** Nonce: makes every token unique (lets the pass backend track / revoke single links). */
  n?: string;
}

/** "link": tokens minted by the pass backend. "session": the app's own session cookie. */
export type TokenPurpose = "link" | "session";

export type VerifyFailure = "malformed" | "version" | "signature" | "expired" | "tenant";
export type VerifyResult = { ok: true; payload: PassPayload } | { ok: false; reason: VerifyFailure };

export const PASS_TOKEN_VERSION = "v1";
/** Tolerated clock difference between the pass backend and this server. */
export const CLOCK_SKEW_S = 60;
export const MIN_SECRET_LENGTH = 32;
const MAX_TOKEN_LENGTH = 2048;
/** base64url of a 32-byte HMAC-SHA256, unpadded. */
const SIG_LENGTH = 43;
const B64URL = /^[A-Za-z0-9_-]+$/;
const MEMBER_ID = /^[A-Za-z0-9._:@-]{1,128}$/;
const TENANT_ID = /^[a-z0-9-]{1,32}$/;
const NONCE = /^[A-Za-z0-9_-]{1,64}$/;

type Env = Record<string, string | undefined>;

/** Product mode: REQUIRE_PASS_LINK=1 → the member comes from a signed pass link, never from the browser. */
export function requirePassLink(env: Env = process.env): boolean {
  const v = env.REQUIRE_PASS_LINK?.trim().toLowerCase();
  return v === "1" || v === "true";
}

/** The shared HMAC secret. Throws a configuration error when it is missing or too short. */
export function passLinkSecret(env: Env = process.env): string {
  const secret = env.PASS_LINK_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `PASS_LINK_SECRET is ${secret ? "too short" : "not set"}: signed pass links (REQUIRE_PASS_LINK=1) need a secret of at least ` +
        `${MIN_SECRET_LENGTH} characters, shared with the WalletLoop pass backend. Generate one with: openssl rand -base64 48`,
    );
  }
  return secret;
}

export function newNonce(): string {
  return randomBytes(12).toString("base64url");
}

function keyFor(secret: string, purpose: TokenPurpose): Buffer | string {
  // Links use the shared secret as-is (simple to implement on the pass backend);
  // sessions use a key derived from it, so the two kinds of token are not interchangeable.
  return purpose === "link" ? secret : createHmac("sha256", secret).update("blueprint:session:v1").digest();
}

function signatureOf(signingInput: string, secret: string, purpose: TokenPurpose): string {
  return createHmac("sha256", keyFor(secret, purpose)).update(signingInput).digest("base64url");
}

/** Returns the payload in canonical form, or null when any field is invalid. */
function parsePayload(raw: unknown): PassPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const { m, t, exp, l, n } = raw as Record<string, unknown>;
  if (typeof m !== "string" || !MEMBER_ID.test(m)) return null;
  if (typeof t !== "string" || !TENANT_ID.test(t)) return null;
  if (typeof exp !== "number" || !Number.isSafeInteger(exp) || exp <= 0) return null;
  if (l !== undefined && l !== "ro" && l !== "en") return null;
  if (n !== undefined && (typeof n !== "string" || !NONCE.test(n))) return null;
  return { m, t, exp, ...(l ? { l } : {}), ...(n ? { n } : {}) };
}

export function signPassToken(payload: PassPayload, secret: string, purpose: TokenPurpose = "link"): string {
  const clean = parsePayload(payload);
  if (!clean) throw new Error("Invalid pass token payload");
  const body = `${PASS_TOKEN_VERSION}.${Buffer.from(JSON.stringify(clean), "utf8").toString("base64url")}`;
  return `${body}.${signatureOf(body, secret, purpose)}`;
}

export function verifyPassToken(
  token: unknown,
  opts: { secret: string; tenant: string; purpose?: TokenPurpose; now?: number },
): VerifyResult {
  if (typeof token !== "string" || !token || token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [version, body, sig] = parts;
  if (version !== PASS_TOKEN_VERSION) return { ok: false, reason: "version" };
  if (!B64URL.test(body) || !B64URL.test(sig)) return { ok: false, reason: "malformed" };

  // Signature first: nothing inside the payload is looked at before it is authenticated.
  // Compare the canonical encodings (not decoded bytes) so no alternative spelling verifies.
  const expected = Buffer.from(signatureOf(`${version}.${body}`, opts.secret, opts.purpose ?? "link"), "utf8");
  const given = Buffer.from(sig, "utf8");
  if (given.length !== SIG_LENGTH || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: "signature" };
  }

  let payload: PassPayload | null;
  try {
    payload = parsePayload(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
  } catch {
    payload = null;
  }
  if (!payload) return { ok: false, reason: "malformed" };

  const nowS = Math.floor((opts.now ?? Date.now()) / 1000);
  if (nowS > payload.exp + CLOCK_SKEW_S) return { ok: false, reason: "expired" };
  if (payload.t !== opts.tenant) return { ok: false, reason: "tenant" };
  return { ok: true, payload };
}

/**
 * Build the link printed on a member's wallet pass (what WalletLoop's pass backend does):
 * `<base>/?retailer=<tenant>&t=<token>`.
 */
export function buildPassLink(opts: {
  memberId: string;
  tenant: string;
  secret: string;
  /** Link lifetime in hours (default 24). */
  hours?: number;
  lang?: PassLang;
  /** Default: PUBLIC_BASE_URL, else http://localhost:3100. */
  baseUrl?: string;
  now?: number;
}): string {
  const hours = opts.hours ?? 24;
  if (!Number.isFinite(hours) || hours <= 0) throw new Error("hours must be a positive number");
  const nowS = Math.floor((opts.now ?? Date.now()) / 1000);
  const token = signPassToken(
    { m: opts.memberId, t: opts.tenant, exp: nowS + Math.round(hours * 3600), ...(opts.lang ? { l: opts.lang } : {}), n: newNonce() },
    opts.secret,
  );
  const url = new URL(opts.baseUrl ?? process.env.PUBLIC_BASE_URL ?? "http://localhost:3100");
  url.search = "";
  url.hash = "";
  url.searchParams.set("retailer", opts.tenant);
  url.searchParams.set("t", token);
  return url.toString();
}
