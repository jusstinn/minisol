import { siteLogin } from "./siteLogin";

/**
 * How many AI calls are allowed, so nobody can run up the OpenAI bill.
 *
 * Three limits, checked in order, each falling back to the offline agent (never an error):
 * - per visitor (IP) per 10 minutes — `LLM_TURNS_PER_10_MIN` (default 12);
 * - per member per day, in product mode where the member comes from a signed pass link and
 *   can't be faked — `LLM_MEMBER_TURNS_PER_DAY` (default 40);
 * - for the whole deployment per day — `LLM_DAILY_TURNS` (default 400). The backstop: whatever
 *   happens, the day's spend is bounded.
 * - tokens per day, overall (`LLM_DAILY_TOKENS`, default 8M) and per member (`LLM_MEMBER_TOKENS_PER_DAY`,
 *   default 800k), since one turn can be long; counted after each model call (`recordAiTokens`).
 * Uploaded-plan reading has its own: `PLAN_READS_PER_10_MIN` per visitor and `PLAN_READS_PER_DAY` overall.
 *
 * Counters live in Upstash Redis when UPSTASH_REDIS_REST_URL / _TOKEN (or Vercel KV's KV_REST_API_URL /
 * _TOKEN) are set, so the limits hold across every serverless instance. Otherwise in memory, per
 * instance — fine locally; in Vercel production that isn't a real limit, so live AI stays off there
 * until a store is configured (or ALLOW_MEMORY_BUDGET=1 says otherwise).
 */

type Env = Record<string, string | undefined>;

export interface CounterStore {
  /** Add `by` (default 1) to `key`, which expires `windowMs` after its first hit; return the new count. */
  hit(key: string, windowMs: number, by?: number): Promise<number>;
}

const mem = new Map<string, { count: number; resetAt: number }>();

export const memoryStore: CounterStore = {
  async hit(key, windowMs, by = 1) {
    const now = Date.now();
    const b = mem.get(key);
    if (!b || b.resetAt <= now) {
      mem.set(key, { count: by, resetAt: now + windowMs });
      if (mem.size > 5000) for (const [k, v] of mem) if (v.resetAt <= now) mem.delete(k);
      return by;
    }
    return (b.count += by);
  },
};

/** Upstash's REST API: one round trip per hit (SET NX PX starts the window, INCR counts). */
export function upstashStore(url: string, token: string, fetcher: typeof fetch = fetch): CounterStore {
  return {
    async hit(key, windowMs, by = 1) {
      const res = await fetcher(`${url.replace(/\/$/, "")}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify([
          ["SET", key, "0", "PX", String(windowMs), "NX"],
          ["INCRBY", key, String(Math.round(by))],
        ]),
        signal: AbortSignal.timeout(1500),
      });
      if (!res.ok) throw new Error(`counter store HTTP ${res.status}`);
      const out = (await res.json()) as { result?: unknown; error?: string }[];
      const n = Number(out[1]?.result);
      if (!Number.isFinite(n)) throw new Error(out[1]?.error ?? "counter store: bad reply");
      return n;
    },
  };
}

let override: CounterStore | null = null;
/** Tests swap the store. */
export function setCounterStore(s: CounterStore | null) {
  override = s;
}

function store(env: Env): CounterStore | null {
  if (override) return override;
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  if (url && token) return upstashStore(url, token);
  // In production, per-instance counters don't add up to a real limit: no shared store, no live
  // AI (the offline agent still answers) — unless the site is behind the sign-in (only invited
  // people), or someone decides otherwise explicitly.
  if (env.VERCEL_ENV === "production" && env.ALLOW_MEMORY_BUDGET !== "1" && !siteLogin(env)) return null;
  return memoryStore;
}

const NO_STORE: Allowance = { ok: false, reason: "AI budget store not configured" };

/** Counters for OpenAI's own rate limits (src/agent/models.ts): shared when possible, else this instance's. */
export function rateStore(env: Env = process.env): CounterStore {
  return store(env) ?? memoryStore;
}

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const num = (v: string | undefined, d: number) => (v !== undefined && v.trim() !== "" && Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : d);
const today = () => new Date().toISOString().slice(0, 10);

export type Allowance = { ok: true } | { ok: false; reason: string };

async function over(s: CounterStore, key: string, limit: number, windowMs: number): Promise<boolean> {
  return (await s.hit(key, windowMs)) > limit;
}

/**
 * May this chat turn use the model? Limits apply to the most specific identity available:
 * the member (signed pass link) → the sign-in session (one per device, even when everyone at a demo
 * shares the user name) → the IP. A looser per-IP limit sits on top (no farming sessions from one
 * place), and deployment-wide daily caps on turns and tokens under everything.
 * If the counter store fails, the answer is no: an outage must not turn into an open tap.
 */
export async function allowAiTurn(
  who: { ip: string; tenant: string; memberId?: string; sessionId?: string },
  env: Env = process.env,
): Promise<Allowance> {
  const s = store(env);
  if (!s) return NO_STORE;
  const signedIn = !!siteLogin(env);
  const id = who.memberId ? `m:${who.tenant}:${who.memberId}` : who.sessionId ? `s:${who.sessionId}` : `ip:${who.ip}`;
  const perVisitor = num(env.LLM_TURNS_PER_10_MIN, signedIn ? 40 : 12);
  try {
    // A breather between turns: people never notice (an answer takes longer); scripts do.
    const cooldownMs = num(env.LLM_COOLDOWN_S, 3) * 1000;
    if (cooldownMs && (await s.hit(`ai:cool:${id}`, cooldownMs)) > 1) return { ok: false, reason: "cooldown" };
    if (await over(s, `ai:v:${id}`, perVisitor, 10 * MIN)) return { ok: false, reason: "per-visitor AI limit reached" };
    if (!id.startsWith("ip:") && (await over(s, `ai:ip:${who.ip}`, perVisitor * 3, 10 * MIN))) return { ok: false, reason: "per-visitor AI limit reached" };
    const perDay = who.memberId ? num(env.LLM_MEMBER_TURNS_PER_DAY, 40) : num(env.LLM_TURNS_PER_DAY, 60);
    if (await over(s, `ai:day:${id}:${today()}`, perDay, DAY)) return { ok: false, reason: who.memberId ? "daily AI limit for this member reached" : "daily AI limit for this visitor reached" };
    if (await over(s, `ai:all:${who.tenant}:${today()}`, num(env.LLM_DAILY_TURNS, 400), DAY)) return { ok: false, reason: "daily AI budget reached" };
    // Tokens, not just turns: one turn can be long. Read-only checks (add 0) against what was used.
    if (who.memberId && (await s.hit(`tok:member:${who.tenant}:${who.memberId}:${today()}`, DAY, 0)) > num(env.LLM_MEMBER_TOKENS_PER_DAY, 800_000))
      return { ok: false, reason: "daily AI limit for this member reached" };
    if ((await s.hit(`tok:all:${who.tenant}:${today()}`, DAY, 0)) > num(env.LLM_DAILY_TOKENS, 8_000_000)) return { ok: false, reason: "daily AI budget reached" };
    return { ok: true };
  } catch (e) {
    console.warn("[budget] counter store unavailable:", (e as Error).message);
    return { ok: false, reason: "AI budget check unavailable" };
  }
}

/**
 * True the first time `key` is claimed within `windowMs` (single-use pass links). Without a
 * shared store, or if it fails, false: a link that can't be proven unused isn't accepted.
 */
export async function claimOnce(key: string, windowMs: number, env: Env = process.env): Promise<boolean> {
  const s = store(env);
  if (!s) return false;
  try {
    return (await s.hit(`once:${key}`, windowMs)) === 1;
  } catch (e) {
    console.warn("[budget] counter store unavailable:", (e as Error).message);
    return false;
  }
}

/** May this upload be read by the vision model? */
export async function allowPlanRead(who: { ip: string; tenant: string }, env: Env = process.env): Promise<Allowance> {
  const s = store(env);
  if (!s) return NO_STORE;
  try {
    if (await over(s, `plan:ip:${who.ip}`, num(env.PLAN_READS_PER_10_MIN, 6), 10 * MIN)) return { ok: false, reason: "per-visitor plan-reading limit reached" };
    if (await over(s, `plan:all:${who.tenant}:${today()}`, num(env.PLAN_READS_PER_DAY, 60), DAY)) return { ok: false, reason: "daily plan-reading budget reached" };
    return { ok: true };
  } catch (e) {
    console.warn("[budget] counter store unavailable:", (e as Error).message);
    return { ok: false, reason: "AI budget check unavailable" };
  }
}

/** Count the tokens a model call used, for the daily token budgets. Best effort: never throws. */
export async function recordAiTokens(who: { tenant: string; memberId?: string }, tokens: number, env: Env = process.env): Promise<void> {
  if (!(tokens > 0)) return;
  const s = store(env);
  if (!s) return;
  try {
    await s.hit(`tok:all:${who.tenant}:${today()}`, DAY, tokens);
    if (who.memberId) await s.hit(`tok:member:${who.tenant}:${who.memberId}:${today()}`, DAY, tokens);
  } catch (e) {
    console.warn("[budget] could not record tokens:", (e as Error).message);
  }
}
