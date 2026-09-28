import type { SessionState } from "@/agent/types";
import type { ProjectType } from "@/domain/calculators";
import type { Layout } from "@/domain/layout";
import type { Lang, QualityTier } from "@/domain/types";

/**
 * "Send to phone": a link that reopens THIS project on another device.
 *
 * The link carries a compact snapshot of the project in the URL fragment (`#p=…`, never sent to
 * any server by the browser): project type + inputs + the edited sketch + the basket (sku × qty +
 * role) + store + quality + language. Not the conversation, not the member, nothing personal —
 * the other device identifies the member through the normal flow (demo picker / pass link),
 * and /api/restore re-validates everything and re-prices it for that member.
 *
 * Encoding: JSON → deflate-raw (CompressionStream, when the browser has it) → base64url, with a
 * one-letter prefix: "z" compressed, "j" plain JSON. Typical projects stay well under 2 kB.
 */

export interface ShareSnapshot {
  v: 1;
  type: ProjectType;
  /** Project title, for the "project received" banner before it is recalculated. */
  title?: string;
  inputs: Record<string, unknown>;
  layout?: Layout;
  sketched?: boolean;
  /** [sku, qty, role] per basket line. */
  basket: [string, number, string?][];
  store?: string;
  quality?: QualityTier;
  lang: Lang;
}

export const SHARE_PARAM = "p";
/** Refuse anything bigger: a real snapshot is a few hundred bytes. */
export const MAX_TOKEN_CHARS = 12_000;
const MAX_JSON_BYTES = 64_000;

/** The shareable part of the session (null when there is no project yet). */
export function snapshotOf(state: SessionState, lang: Lang): ShareSnapshot | null {
  const p = state.project;
  if (!p) return null;
  return {
    v: 1,
    type: p.type,
    title: p.title ? p.title.slice(0, 80) : undefined,
    inputs: p.inputs,
    layout: p.layout,
    sketched: p.sketched || undefined,
    basket: state.basket.map((b) => (b.role ? [b.sku, b.qty, b.role] : [b.sku, b.qty])),
    store: state.storeId,
    quality: state.quality,
    lang,
  };
}

// ───────────── base64url ─────────────

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit = Infinity): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  void writer.write(bytes as Uint8Array<ArrayBuffer>).catch(() => {});
  void writer.close().catch(() => {});
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    // Decompression bomb guard.
    if (size > limit) {
      await reader.cancel().catch(() => {});
      throw new Error("snapshot too large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

const canCompress = () => typeof CompressionStream !== "undefined";

/** Snapshot → URL-safe token ("z…" deflated, "j…" plain JSON). */
export async function encodeSnapshot(s: ShareSnapshot, opts: { compress?: boolean } = {}): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(s));
  if (opts.compress !== false && canCompress()) {
    try {
      return `z${toBase64Url(await pipe(json, new CompressionStream("deflate-raw")))}`;
    } catch {
      /* fall through to plain JSON */
    }
  }
  return `j${toBase64Url(json)}`;
}

/** Token → snapshot, or null if it isn't one (shape only — the server sanitises the content). */
export async function decodeSnapshot(token: string): Promise<ShareSnapshot | null> {
  if (typeof token !== "string" || token.length < 2 || token.length > MAX_TOKEN_CHARS || !/^[zj][A-Za-z0-9_-]+$/.test(token)) return null;
  try {
    let bytes = fromBase64Url(token.slice(1));
    if (token[0] === "z") {
      if (typeof DecompressionStream === "undefined") return null;
      bytes = await pipe(bytes, new DecompressionStream("deflate-raw"), MAX_JSON_BYTES);
    } else if (bytes.length > MAX_JSON_BYTES) return null;
    const s = JSON.parse(new TextDecoder().decode(bytes)) as ShareSnapshot;
    if (!s || s.v !== 1 || typeof s.type !== "string" || !Array.isArray(s.basket) || typeof s.inputs !== "object" || s.inputs === null) return null;
    return { ...s, lang: s.lang === "en" ? "en" : "ro" };
  } catch {
    return null;
  }
}

/** The link to this project: same page and retailer, the snapshot in the fragment. */
export function shareUrl(current: { origin: string; pathname: string; search: string }, tenantId: string, token: string, lang: Lang): string {
  const q = new URLSearchParams(current.search);
  const out = new URLSearchParams({ retailer: tenantId, lang });
  // Keep the demo switches (offline agent, sketch policy) so the other device behaves the same; drop the member.
  for (const k of ["demo", "sketch"]) if (q.has(k)) out.set(k, q.get(k) ?? "");
  return `${current.origin}${current.pathname}?${out.toString().replace(/=(&|$)/g, "$1")}#${SHARE_PARAM}=${token}`;
}

/** The token in a location hash ("#p=z…"), if any. */
export function tokenFromHash(hash: string): string | null {
  const m = hash.match(new RegExp(`[#&]${SHARE_PARAM}=([zj][A-Za-z0-9_-]+)`));
  return m ? m[1] : null;
}

// ───────────── incoming link (browser only) ─────────────

const PENDING_KEY = "blueprint:shared:v1";
const PENDING_MAX_AGE_MS = 24 * 3600 * 1000;

/**
 * Take a shared project out of the address bar (so reloads and screenshots don't carry it) and keep it
 * until it is opened — also across the pass-link sign-in, which reloads the page without the fragment.
 */
export function stashIncomingShare(): void {
  if (typeof window === "undefined") return;
  const token = tokenFromHash(window.location.hash);
  if (!token) return;
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify({ token, at: Date.now() }));
  } catch {
    /* private mode: it can still be read from the hash below */
    pendingInMemory = token;
  }
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}

let pendingInMemory: string | null = null;

export function readPendingShare(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return pendingInMemory;
    const { token, at } = JSON.parse(raw) as { token: string; at: number };
    if (Date.now() - at > PENDING_MAX_AGE_MS) {
      window.localStorage.removeItem(PENDING_KEY);
      return null;
    }
    return token;
  } catch {
    return pendingInMemory;
  }
}

export function clearPendingShare(): void {
  pendingInMemory = null;
  try {
    window.localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}
