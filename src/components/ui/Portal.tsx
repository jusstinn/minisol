"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const noop = () => () => {};

/**
 * Render overlays at the app root, outside headers with `backdrop-filter` (which would otherwise
 * become the containing block of `position: fixed` and clip the overlay), but still inside the
 * element that carries the retailer's accent colour variables.
 */
export function Portal({ children }: { children: React.ReactNode }) {
  const target = useSyncExternalStore(
    noop,
    () => document.querySelector<HTMLElement>("[data-app-root]") ?? document.body,
    () => null,
  );
  return target ? createPortal(children, target) : null;
}
