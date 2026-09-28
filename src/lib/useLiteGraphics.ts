"use client";

import { useSyncExternalStore } from "react";

/**
 * How much 3D this device gets:
 * - `false` — full quality (desktop): pixel ratio up to 2, antialiasing, shadows, every edge.
 * - `true`  — lite (phones, tablets, data saver): pixel ratio ≤ 1.5, no antialiasing or shadows, fewer edge overlays.
 * - `"low"` — low-end hardware: as lite, rendered at 1×.
 */
export type LiteGraphics = boolean | "low";

/** Media queries the heuristic reads, so it re-evaluates when one flips (rotation, resize, settings). */
const QUERIES = ["(pointer: coarse)", "(max-width: 1023px)", "(prefers-reduced-data: reduce)"];

function detect(): string {
  // Override for demos and testing: ?lite=1 | ?lite=low | ?lite=0.
  const q = new URLSearchParams(window.location.search).get("lite");
  if (q === "0" || q === "false" || q === "off") return "full";
  if (q === "low") return "low";
  if (q !== null) return "lite";

  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const mq = (s: string) => window.matchMedia?.(s).matches ?? false;
  // WebKit reports a clamped core count on iPhones/iPads, so it says nothing about the GPU there.
  const appleTouch = /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  const fewCores = !appleTouch && nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 4;
  const littleMemory = nav.deviceMemory !== undefined && nav.deviceMemory <= 4;
  if (fewCores || littleMemory) return "low";
  if (mq("(pointer: coarse)") && mq("(max-width: 1023px)")) return "lite";
  if (mq("(prefers-reduced-data: reduce)") || nav.connection?.saveData) return "lite";
  return "full";
}

function subscribe(cb: () => void) {
  const lists = QUERIES.map((q) => window.matchMedia?.(q)).filter((m): m is MediaQueryList => Boolean(m));
  lists.forEach((m) => m.addEventListener("change", cb));
  return () => lists.forEach((m) => m.removeEventListener("change", cb));
}

/** Device heuristic for the 3D sketch (see {@link LiteGraphics}). Server snapshot: full quality. */
export function useLiteGraphics(): LiteGraphics {
  const level = useSyncExternalStore(subscribe, detect, () => "full");
  return level === "full" ? false : level === "low" ? "low" : true;
}
