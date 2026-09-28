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
 * _TOKEN) are set, so the limits hold across every serverless instance; otherwise in memory, per
 * instance (fine locally, approximate on Vercel — pair it with a spend limit on the OpenAI project).
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

function store(env: Env): CounterStore {
  if (override) return override;
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  return url && token ? upstashStore(url, token) : memoryStore;
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
 * May this chat turn use the model? `memberId` only in product mode (a verified session).
 * If the counter store fails, the answer is no: an outage must not turn into an open tap.
 */
export async function allowAiTurn(who: { ip: string; tenant: string; memberId?: string }, env: Env = process.env): Promise<Allowance> {
  const s = store(env);
  try {
    if (await over(s, `ai:ip:${who.ip}`, num(env.LLM_TURNS_PER_10_MIN, 12), 10 * MIN)) return { ok: false, reason: "per-visitor AI limit reached" };
    if (who.memberId && (await over(s, `ai:member:${who.tenant}:${who.memberId}:${today()}`, num(env.LLM_MEMBER_TURNS_PER_DAY, 40), DAY)))
      return { ok: false, reason: "daily AI limit for this member reached" };
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

/** May this upload be read by the vision model? */
export async function allowPlanRead(who: { ip: string; tenant: string }, env: Env = process.env): Promise<Allowance> {
  const s = store(env);
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
  try {
    await s.hit(`tok:all:${who.tenant}:${today()}`, DAY, tokens);
    if (who.memberId) await s.hit(`tok:member:${who.tenant}:${who.memberId}:${today()}`, DAY, tokens);
  } catch (e) {
    console.warn("[budget] could not record tokens:", (e as Error).message);
  }
}
