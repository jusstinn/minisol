"use client";

import type { UsageName, UsageProps } from "./usage";

/**
 * Client side of the usage events (see ./usage.ts). Batches events and sends them to
 * /api/events; nothing is stored on the device. Off when the browser asks not to be tracked
 * (Global Privacy Control or Do Not Track), when NEXT_PUBLIC_USAGE=off, and outside a browser.
 */

let visit = "";
let tenant = "";
const queue: { name: UsageName; props: UsageProps; visit: string }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let listening = false;
const once = new Set<UsageName>();

function allowed(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  if (process.env.NEXT_PUBLIC_USAGE === "off") return false;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  if (nav.globalPrivacyControl === true) return false;
  if (nav.doNotTrack === "1" || (window as Window & { doNotTrack?: string }).doNotTrack === "1") return false;
  return true;
}

function newVisit(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("");
}

function flush(beacon = false) {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!queue.length) return;
  const body = JSON.stringify({ tenant, events: queue.splice(0, 30) });
  try {
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
    } else {
      void fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
    }
  } catch {
    // Measurement must never break the page.
  }
  if (queue.length) timer = setTimeout(() => flush(), 1000);
}

/** Which retailer the events belong to; call once the workspace knows it. */
export function setUsageTenant(id: string) {
  tenant = id;
}

/** An event that happens once per page load (a `visit`), however often the caller runs. */
export function trackOnce(name: UsageName, props: UsageProps = {}) {
  if (once.has(name)) return;
  once.add(name);
  track(name, props);
}

export function track(name: UsageName, props: UsageProps = {}) {
  if (!allowed()) return;
  if (!visit) visit = newVisit();
  if (!listening) {
    listening = true;
    // Send what's left when the page is hidden or closed.
    addEventListener("pagehide", () => flush(true));
    document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush(true));
  }
  queue.push({ name, props, visit });
  if (queue.length >= 20) flush();
  else if (!timer) timer = setTimeout(() => flush(), 4000);
}
