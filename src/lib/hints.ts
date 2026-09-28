/**
 * First-run hints ("coach marks"): which ones the customer has already seen, kept in their
 * browser. Each hint shows once — dismissed, timed out, or made pointless because the customer
 * already did the thing — and never again.
 */

export type HintId = "sketch" | "list" | "chat";

/** Most useful first; only hints whose target is on screen right now are candidates. */
export const HINT_ORDER: HintId[] = ["sketch", "list", "chat"];

export const HINTS_KEY = "blueprint:hints:v1";

type Seen = Partial<Record<HintId, 1>>;

let memory: Seen = {};
const listeners = new Set<() => void>();

export function readSeen(): Seen {
  if (typeof window === "undefined") return {};
  try {
    return { ...memory, ...(JSON.parse(window.localStorage.getItem(HINTS_KEY) ?? "{}") as Seen) };
  } catch {
    return memory;
  }
}

export function markSeen(id: HintId): void {
  memory = { ...memory, [id]: 1 };
  try {
    window.localStorage.setItem(HINTS_KEY, JSON.stringify({ ...readSeen(), [id]: 1 }));
  } catch {
    /* private mode: remembered for this page only */
  }
  listeners.forEach((l) => l());
}

export function subscribeSeen(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The hint to show now: the first unseen one whose target is visible. */
export function pickHint(seen: Seen, visible: Partial<Record<HintId, boolean>>): HintId | null {
  return HINT_ORDER.find((id) => !seen[id] && visible[id]) ?? null;
}
