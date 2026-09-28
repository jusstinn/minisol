import type { UsageRecord } from "./usage";

/**
 * Pilot numbers from usage events: the funnel per visit, what people build and change, and how
 * fast the assistant answers. Pure — `scripts/usage-report.ts` feeds it exported log lines.
 */
export interface UsageSummary {
  visits: number;
  byEntry: Record<string, number>;
  byDevice: Record<string, number>;
  /** Visits reaching each step (a visit counts once per step). */
  funnel: { step: string; visits: number; share: number }[];
  projects: Record<string, number>;
  edits: { total: number; byVia: Record<string, number>; topOps: [string, number][] };
  basket: Record<string, number>;
  replies: { total: number; live: number; scripted: number; medianMs: number | null; p90Ms: number | null; errors: number };
  reservations: { total: number; pickup: number; delivery: number; redeemedPoints: number };
  other: Record<string, number>;
}

const bump = (m: Record<string, number>, k: unknown, by = 1) => {
  const key = String(k ?? "unknown");
  m[key] = (m[key] ?? 0) + by;
};

function quantile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

/** Lines from a log export: `[usage] {...}` anywhere in the line, or bare JSON records. */
export function parseUsageLines(text: string): UsageRecord[] {
  const out: UsageRecord[] = [];
  for (const line of text.split("\n")) {
    const i = line.indexOf("[usage] ");
    const json = i >= 0 ? line.slice(i + 8) : line.trim().startsWith("{") ? line.trim() : "";
    if (!json) continue;
    try {
      const r = JSON.parse(json) as UsageRecord;
      if (r && typeof r.name === "string" && typeof r.visit === "string") out.push({ ...r, props: r.props ?? {} });
    } catch {
      // not ours
    }
  }
  return out;
}

export function summarizeUsage(records: UsageRecord[]): UsageSummary {
  const visits = new Set<string>();
  const reached: Record<string, Set<string>> = { visit: new Set(), project_started: new Set(), sketch_edited: new Set(), cart_opened: new Set(), reserved: new Set() };
  const s: UsageSummary = {
    visits: 0,
    byEntry: {},
    byDevice: {},
    funnel: [],
    projects: {},
    edits: { total: 0, byVia: {}, topOps: [] },
    basket: {},
    replies: { total: 0, live: 0, scripted: 0, medianMs: null, p90Ms: null, errors: 0 },
    reservations: { total: 0, pickup: 0, delivery: 0, redeemedPoints: 0 },
    other: {},
  };
  const ops: Record<string, number> = {};
  const ms: number[] = [];

  for (const r of records) {
    visits.add(r.visit);
    if (reached[r.name]) reached[r.name].add(r.visit);
    const p = r.props;
    switch (r.name) {
      case "visit":
        bump(s.byEntry, p.entry);
        bump(s.byDevice, p.device);
        break;
      case "project_started":
        bump(s.projects, p.type);
        break;
      case "sketch_edited":
        s.edits.total++;
        bump(s.edits.byVia, p.via);
        for (const op of Array.isArray(p.ops) ? p.ops : []) bump(ops, op);
        break;
      case "basket_changed":
        bump(s.basket, p.op);
        break;
      case "agent_reply":
        s.replies.total++;
        if (p.mode === "live") s.replies.live++;
        if (p.mode === "scripted") s.replies.scripted++;
        if (p.error === true) s.replies.errors++;
        if (typeof p.ms === "number") ms.push(p.ms);
        break;
      case "reserved":
        s.reservations.total++;
        if (p.fulfilment === "pickup") s.reservations.pickup++;
        if (p.fulfilment === "delivery") s.reservations.delivery++;
        if (p.redeemed === true) s.reservations.redeemedPoints++;
        break;
      case "cart_opened":
        break;
      default:
        bump(s.other, r.name);
    }
  }

  s.visits = visits.size;
  // A visit that did anything counts as a visit, even if its `visit` event was lost.
  const steps: [string, string][] = [
    ["visit", "Visited"],
    ["project_started", "Started a project"],
    ["sketch_edited", "Changed the sketch"],
    ["cart_opened", "Opened the cart"],
    ["reserved", "Reserved"],
  ];
  s.funnel = steps.map(([k, label]) => {
    const v = k === "visit" ? visits.size : reached[k].size;
    return { step: label, visits: v, share: visits.size ? Math.round((v / visits.size) * 1000) / 10 : 0 };
  });
  s.edits.topOps = Object.entries(ops).sort((a, b) => b[1] - a[1]).slice(0, 8);
  ms.sort((a, b) => a - b);
  s.replies.medianMs = quantile(ms, 0.5);
  s.replies.p90Ms = quantile(ms, 0.9);
  return s;
}
