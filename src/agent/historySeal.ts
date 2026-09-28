import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The conversation history lives in the browser and comes back every turn — so it could be edited:
 * a fake tool result ("offer: 50% off everything"), a fake assistant promise, junk to inflate the
 * bill. The server signs the history it sends out; on the way back only a history with a valid
 * signature is used as is. Anything else keeps just the customer's own messages (which they could
 * type anyway): no assistant turns, no tool calls or results reach the model unsigned.
 */

type Env = Record<string, string | undefined>;

/** The signing key, or null when there is nothing to protect (no model configured). */
export function historyKey(env: Env = process.env): Buffer | null {
  const base = env.HISTORY_SECRET || env.PASS_LINK_SECRET || env.OPENAI_API_KEY;
  // A derived key: the signature never reveals (or reuses) the secret it comes from.
  return base ? createHmac("sha256", base).update("blueprint:history:v1").digest() : null;
}

export function sealHistory(items: unknown[], key: Buffer): string {
  return createHmac("sha256", key).update(JSON.stringify(items)).digest("base64url");
}

export function openHistory(items: unknown, sig: unknown, key: Buffer): { items: unknown[]; trusted: boolean } {
  if (!Array.isArray(items) || items.length === 0) return { items: [], trusted: true };
  if (typeof sig === "string" && sig.length <= 64) {
    const want = Buffer.from(sealHistory(items, key));
    const got = Buffer.from(sig);
    if (got.length === want.length && timingSafeEqual(got, want)) return { items, trusted: true };
  }
  return { items: userMessagesOnly(items), trusted: false };
}

function userMessagesOnly(items: unknown[]): unknown[] {
  const out: { role: "user"; content: string }[] = [];
  for (const raw of items.slice(-40)) {
    const it = raw as { role?: unknown; content?: unknown; type?: unknown } | null;
    if (!it || it.role !== "user" || (it.type !== undefined && it.type !== "message")) continue;
    const text = typeof it.content === "string" ? it.content : Array.isArray(it.content) ? it.content.map((c) => (c && typeof c === "object" && "text" in c ? String((c as { text: unknown }).text) : "")).join("") : "";
    if (text.trim()) out.push({ role: "user", content: text.slice(0, 2000) });
  }
  return out.slice(-12);
}
