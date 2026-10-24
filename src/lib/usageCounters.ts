import { sharedStore } from "./budget";
import type { UsageRecord } from "./usage";

/**
 * Daily counts per invited account (site sign-in), kept in the shared store so they survive
 * deploys and log retention: did the retailer's team sign in, and what did they do?
 * Counts only — no messages, no projects' contents. Read on /admin by the owner.
 */

type Env = Record<string, string | undefined>;

export const COUNTED = ["login", "visit", "project_started", "sketch_edited", "reserved"] as const;
export type Counted = (typeof COUNTED)[number];

const KEEP_MS = 60 * 86_400_000;
const key = (account: string, event: Counted, day: string) => `use:${account}:${event}:${day}`;

export async function countEvents(records: UsageRecord[], env: Env = process.env): Promise<void> {
  const s = sharedStore(env);
  if (!s) return;
  const hits = records.filter((r) => r.account && (COUNTED as readonly string[]).includes(r.name));
  await Promise.all(hits.map((r) => s.hit(key(r.account!, r.name as Counted, r.at.slice(0, 10)), KEEP_MS).catch(() => 0)));
}

export async function countLogin(account: string, env: Env = process.env, now = new Date()): Promise<void> {
  const s = sharedStore(env);
  if (!s) return;
  await s.hit(key(account, "login", now.toISOString().slice(0, 10)), KEEP_MS).catch(() => 0);
}

export interface AccountUsage {
  account: string;
  totals: Record<Counted, number>;
  /** Days with any activity, newest first. */
  days: { day: string; counts: Record<Counted, number> }[];
  lastActive?: string;
}

/** The last `days` days for these accounts; null when there's no shared store to read from. */
export async function usageByAccount(accounts: string[], days = 14, env: Env = process.env, now = new Date()): Promise<AccountUsage[] | null> {
  const s = sharedStore(env);
  if (!s?.getMany) return null;
  const dayList = Array.from({ length: days }, (_, i) => new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10));
  const keys = accounts.flatMap((a) => dayList.flatMap((d) => COUNTED.map((e) => key(a, e, d))));
  const values = await s.getMany(keys);
  let i = 0;
  return accounts.map((account) => {
    const zero = () => Object.fromEntries(COUNTED.map((e) => [e, 0])) as Record<Counted, number>;
    const totals = zero();
    const active: AccountUsage["days"] = [];
    for (const day of dayList) {
      const counts = zero();
      for (const e of COUNTED) counts[e] = values[i++] ?? 0;
      if (COUNTED.some((e) => counts[e] > 0)) {
        active.push({ day, counts });
        for (const e of COUNTED) totals[e] += counts[e];
      }
    }
    return { account, totals, days: active, lastActive: active[0]?.day };
  });
}
