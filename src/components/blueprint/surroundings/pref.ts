import { useSyncExternalStore } from "react";

/**
 * The "Împrejurimi / Surroundings" switch: a tiny external store (remembered in localStorage) so
 * the toggle in the camera menu and the scene can stay unconnected — the menu writes, `Scene`
 * reads — without threading a prop through the board panel. On by default; phones/low-end
 * devices never draw surroundings regardless.
 */
const KEY = "bp.surroundings";
const listeners = new Set<() => void>();
let cache: boolean | null = null;

function read(): boolean {
  if (cache !== null) return cache;
  let v = true;
  try {
    v = typeof window === "undefined" ? true : window.localStorage.getItem(KEY) !== "off";
  } catch {
    v = true;
  }
  cache = v;
  return v;
}

export function setSurroundings(on: boolean): void {
  cache = on;
  try {
    window.localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // Private mode / storage blocked: the choice still holds for this session.
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** [on, set]: the switch's current value (true on the server and before hydration) and its setter. */
export function useSurroundings(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, read, () => true);
  return [on, setSurroundings];
}

/** Test hook: forget the cached value. */
export function resetSurroundingsCache(): void {
  cache = null;
}
