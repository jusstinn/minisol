import { PROJECT_TYPES } from "@/domain/calculators";

/**
 * Privacy-safe usage events for measuring a pilot: what people do, never who they are.
 *
 * - An allowlist: every event and every property is declared here; anything else is dropped.
 * - Values are enums, short lists of enums or counts. No free text, no member ids, no SKUs,
 *   no prices, no messages, no dimensions.
 * - `visit` is a random id made per page load and kept only in memory, so a visit's events can
 *   be read as a funnel; it is never stored on the device and never linked to a member.
 * - The server adds the tenant and the time to the minute; it doesn't record IPs or user agents.
 */

const ENTRY = ["landing", "pass", "share"] as const;
const VIA = ["chat", "starter", "sizes", "upload", "share", "editor", "chip", "list"] as const;
const EDIT_OPS = [
  "undo", "resize", "add_zone", "remove_zone", "add_steps", "remove_steps", "set_height", "add_opening", "remove_opening",
  "move_opening", "set_wall_tiles", "add_fence_segment", "set_segment_length", "remove_fence_segment", "set_option",
  "add_item", "move_item", "rotate_item", "remove_item",
] as const;
const BASKET_OPS = ["add", "remove", "set_qty", "replace", "choose", "dismiss_suggestion", "add_suggestions", "quality", "move_store"] as const;
const TOOLS = [
  "get_customer_context", "calculate_project", "edit_sketch", "modify_basket", "control_view", "suggest_sizes",
  "search_products", "check_stock", "get_offers", "present_plan",
] as const;
const CARDS = ["project", "quote", "stock", "offers", "products", "plan", "change", "sizes"] as const;

type Prop =
  | { kind: "enum"; values: readonly string[] }
  | { kind: "enums"; values: readonly string[]; max: number }
  | { kind: "count"; max: number }
  | { kind: "flag" };

const e = (values: readonly string[]): Prop => ({ kind: "enum", values });
const es = (values: readonly string[], max = 12): Prop => ({ kind: "enums", values, max });
const n = (max: number): Prop => ({ kind: "count", max });
const flag: Prop = { kind: "flag" };

export const USAGE_EVENTS = {
  /** A page load of the workspace. */
  visit: { entry: e(ENTRY), device: e(["phone", "desktop"]), lang: e(["ro", "en"]) },
  /** A new project drawn (or a different project type). */
  project_started: { type: e(PROJECT_TYPES), via: e(VIA) },
  /** The sketch changed: by chat, by hand in the plan editor, or from a next-step chip. */
  sketch_edited: { type: e(PROJECT_TYPES), via: e(VIA), ops: es(EDIT_OPS) },
  /** The list changed by hand (quantities, options, extras, store). */
  basket_changed: { via: e(VIA), op: e(BASKET_OPS) },
  /** One chat answer: how it was made and how long it took. */
  agent_reply: { mode: e(["live", "scripted"]), ms: n(120_000), tools: es(TOOLS), cards: es(CARDS), error: flag },
  cart_opened: {},
  reserved: { fulfilment: e(["pickup", "delivery"]), lines: n(200), redeemed: flag },
  wallet_saved: {},
  share_created: {},
  upload_added: { kind: e(["plan", "model", "photo"]) },
  sizes_used: { how: e(["preset", "estimate"]) },
} satisfies Record<string, Record<string, Prop>>;

export type UsageName = keyof typeof USAGE_EVENTS;
export type UsageProps = Record<string, string | number | boolean | string[]>;

/** What the client sends. */
export interface UsageEvent {
  name: UsageName;
  props: UsageProps;
  /** Random per page load (memory only). */
  visit: string;
}

/** What the sink receives. */
export interface UsageRecord extends UsageEvent {
  tenant: string;
  /** ISO time truncated to the minute. */
  at: string;
}

export const MAX_BATCH = 30;
const VISIT = /^[a-z0-9]{8,16}$/;

function cleanProp(p: Prop, v: unknown): string | number | boolean | string[] | undefined {
  switch (p.kind) {
    case "enum":
      return typeof v === "string" && p.values.includes(v) ? v : undefined;
    case "enums":
      if (!Array.isArray(v)) return undefined;
      return [...new Set(v.filter((x): x is string => typeof x === "string" && p.values.includes(x)))].slice(0, p.max);
    case "count":
      return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(Math.round(v), p.max) : undefined;
    case "flag":
      return typeof v === "boolean" ? v : undefined;
  }
}

/** The event with only declared properties and allowed values — or null when it isn't one of ours. */
export function cleanUsageEvent(raw: unknown): UsageEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { name?: unknown; props?: unknown; visit?: unknown };
  if (typeof r.name !== "string" || !Object.hasOwn(USAGE_EVENTS, r.name)) return null;
  if (typeof r.visit !== "string" || !VISIT.test(r.visit)) return null;
  const spec = USAGE_EVENTS[r.name as UsageName] as Record<string, Prop>;
  const src = r.props && typeof r.props === "object" ? (r.props as Record<string, unknown>) : {};
  const props: UsageProps = {};
  for (const [k, p] of Object.entries(spec)) {
    const v = cleanProp(p, src[k]);
    if (v !== undefined) props[k] = v;
  }
  return { name: r.name as UsageName, props, visit: r.visit };
}

export function minuteOf(d: Date): string {
  return d.toISOString().slice(0, 16) + "Z";
}
