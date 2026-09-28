import type { UsageRecord } from "./usage";

/**
 * Where cleaned usage events go. The default writes one JSON line per event to the server
 * log (`[usage] {...}`), which a log drain or an export can feed into `scripts/usage-report.ts`.
 * Set USAGE_WEBHOOK_URL to also forward each batch (e.g. to WalletLoop's analytics), or
 * USAGE_SINK=off to drop everything.
 */
export interface UsageSink {
  record(events: UsageRecord[]): Promise<void>;
}

export const logSink: UsageSink = {
  async record(events) {
    for (const e of events) console.info(`[usage] ${JSON.stringify(e)}`);
  },
};

export function webhookSink(url: string): UsageSink {
  return {
    async record(events) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2000);
      try {
        await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events }), signal: ctrl.signal });
      } catch {
        // Measurement is best effort; never fail the request over it.
      } finally {
        clearTimeout(t);
      }
    },
  };
}

/** Kept in memory — for tests. */
export function memorySink(): UsageSink & { events: UsageRecord[] } {
  const events: UsageRecord[] = [];
  return { events, record: async (batch) => void events.push(...batch) };
}

let override: UsageSink | null = null;

/** Tests swap the sink. */
export function setUsageSink(s: UsageSink | null) {
  override = s;
}

export function usageSink(): UsageSink | null {
  if (override) return override;
  if (process.env.USAGE_SINK === "off") return null;
  const hook = process.env.USAGE_WEBHOOK_URL;
  if (!hook) return logSink;
  const fwd = webhookSink(hook);
  return { record: async (ev) => void (await Promise.all([logSink.record(ev), fwd.record(ev)])) };
}
