import { rateStore } from "@/lib/budget";
import type { CounterStore } from "@/lib/budget";

/**
 * Which OpenAI model does what, and staying inside each model's rate limits.
 *
 * - "chat" (OPENAI_MODEL, default gpt-5.4-mini): the conversation, tools, edits — fast and cheap.
 * - "plan" (OPENAI_PLAN_MODEL, optional, e.g. gpt-5.5): writes the step-by-step plan for a new
 *   project in one compact call (src/agent/planWriter.ts). Unset → the chat model writes it.
 *
 * OpenAI limits requests and tokens per model, per minute and per day. The governor counts what we
 * send (OPENAI_RPM / _TPM / _RPD, and OPENAI_PLAN_* for the plan model) and, near a limit, waits for
 * the next minute when that's only a few seconds away — else the call is refused here (and the turn
 * falls back) instead of failing at OpenAI with a 429 half-way through.
 */

type Env = Record<string, string | undefined>;
type Effort = "none" | "minimal" | "low" | "medium" | "high";

export interface ModelSpec {
  role: "chat" | "plan";
  model: string;
  effort: Effort;
  /** Requests per minute, tokens per minute, requests per day (0 = not limited here). */
  rpm: number;
  tpm: number;
  rpd: number;
}

const EFFORTS = new Set(["none", "minimal", "low", "medium", "high"]);
const n = (v: string | undefined) => (v && Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0);
const effort = (v: string | undefined, d: Effort): Effort => (v && EFFORTS.has(v) ? (v as Effort) : d);

export function modelSpec(role: "chat" | "plan", env: Env = process.env): ModelSpec | null {
  if (role === "chat") {
    return { role, model: env.OPENAI_MODEL || "gpt-5.4-mini", effort: effort(env.OPENAI_REASONING_EFFORT, "low"), rpm: n(env.OPENAI_RPM), tpm: n(env.OPENAI_TPM), rpd: n(env.OPENAI_RPD) };
  }
  if (!env.OPENAI_PLAN_MODEL) return null;
  return {
    role,
    model: env.OPENAI_PLAN_MODEL,
    effort: effort(env.OPENAI_PLAN_REASONING_EFFORT, "low"),
    rpm: n(env.OPENAI_PLAN_RPM),
    tpm: n(env.OPENAI_PLAN_TPM),
    rpd: n(env.OPENAI_PLAN_RPD),
  };
}

const MIN = 60_000;
const DAY = 86_400_000;

export type Reservation = { ok: true; tokens: number } | { ok: false; waitMs: number } | { ok: false; reason: string };

/**
 * Try to take room for one call of about `tokens` tokens. Returns ok (room taken), a wait until
 * the next minute, or a refusal (the day's requests are used up).
 */
export async function reserve(spec: ModelSpec, tokens: number, now = Date.now(), s: CounterStore = rateStore()): Promise<Reservation> {
  const minute = Math.floor(now / MIN);
  const day = new Date(now).toISOString().slice(0, 10);
  const k = (what: string) => `oa:${spec.model}:${what}`;
  if (spec.rpd && (await s.hit(k(`d:${day}`), DAY, 0)) >= spec.rpd) return { ok: false, reason: `${spec.model}: daily request limit reached` };
  const reqs = spec.rpm ? await s.hit(k(`r:${minute}`), MIN * 2, 0) : 0;
  const used = spec.tpm ? await s.hit(k(`t:${minute}`), MIN * 2, 0) : 0;
  const full = (spec.rpm && reqs + 1 > spec.rpm) || (spec.tpm && used > 0 && used + tokens > spec.tpm);
  if (full) return { ok: false, waitMs: (minute + 1) * MIN - now + 250 };
  if (spec.rpd) await s.hit(k(`d:${day}`), DAY, 1);
  if (spec.rpm) await s.hit(k(`r:${minute}`), MIN * 2, 1);
  if (spec.tpm) await s.hit(k(`t:${minute}`), MIN * 2, tokens);
  return { ok: true, tokens };
}

/** After the call: correct the minute's token count from the estimate to what was really used. */
export async function settle(spec: ModelSpec, estimated: number, actual: number, now = Date.now(), s: CounterStore = rateStore()): Promise<void> {
  if (!spec.tpm || !(actual >= 0)) return;
  const diff = Math.round(actual - estimated);
  if (diff) await s.hit(`oa:${spec.model}:t:${Math.floor(now / MIN)}`, MIN * 2, diff).catch(() => 0);
}

/** A rough token count for a request: ~4 characters per token, plus the room the answer may take. */
export function estimateTokens(parts: unknown[], maxOutput: number): number {
  const chars = parts.reduce<number>((sum, p) => sum + (typeof p === "string" ? p.length : JSON.stringify(p ?? "").length), 0);
  return Math.ceil(chars / 4) + maxOutput;
}

export class ModelBusyError extends Error {
  constructor(reason: string) {
    super(`model busy: ${reason}`);
    this.name = "ModelBusyError";
  }
}
