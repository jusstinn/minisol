"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { SessionState } from "@/agent/types";
import type { Board, ChatMessage } from "./useAgent";
import { clearUploads } from "./uploads/idb";

/**
 * The customer's project, saved in their own browser (per retailer + member), so
 * closing the tab or coming back from the store tomorrow picks up where they left
 * off. Nothing is stored server-side; "forget" clears it.
 */
export interface SavedSession {
  v: 1;
  savedAt: number;
  messages: ChatMessage[];
  board: Board;
  state: SessionState;
  history: unknown[];
  historySig?: string;
}

const MAX_AGE_MS = 30 * 24 * 3600 * 1000;
export const savedKey = (tenant: string, memberId: string) => `blueprint:v1:${tenant}:${memberId}`;

function parse(raw: string | null): SavedSession | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as SavedSession;
    if (s?.v !== 1 || !Array.isArray(s.messages) || !s.board || typeof s.board !== "object" || !s.state || Date.now() - s.savedAt > MAX_AGE_MS) return null;
    // Saved by another build: check what the app reads before trusting it (a bad entry is ignored, not fatal).
    if (!Array.isArray(s.state.basket)) return null;
    const okMessage = (m: unknown) => {
      const x = m as { id?: unknown; role?: unknown; text?: unknown; log?: unknown; cards?: unknown };
      return !!x && typeof x.id === "string" && (x.role === "user" || x.role === "assistant") && typeof x.text === "string" && Array.isArray(x.log) && Array.isArray(x.cards);
    };
    if (!s.messages.every(okMessage)) return null;
    // An empty answer (saved mid-reply by an older build) becomes a retryable error bubble.
    s.messages = s.messages.map((m) => (m.role === "assistant" && !m.text && !m.cards.length && !m.error ? { ...m, error: "interrupted" } : m));
    return s;
  } catch {
    return null;
  }
}

export function readSaved(tenant: string, memberId: string): SavedSession | null {
  if (typeof window === "undefined") return null;
  try {
    return parse(window.localStorage.getItem(savedKey(tenant, memberId)));
  } catch {
    return null;
  }
}

export function writeSaved(tenant: string, memberId: string, s: Omit<SavedSession, "v" | "savedAt">): void {
  const key = savedKey(tenant, memberId);
  // An answer cut off by a reload comes back as an error bubble, so "Reîncearcă" can ask again.
  const messages = s.messages.map((m) => ({
    ...m,
    pending: false,
    ...(m.pending && !m.text && !m.error ? { error: "interrupted" } : {}),
    log: m.log.map((l) => ({ ...l, done: true })),
  }));
  const full: SavedSession = { v: 1, savedAt: Date.now(), ...s, messages };
  try {
    window.localStorage.setItem(key, JSON.stringify(full));
  } catch {
    // Quota: keep the board and state, drop the cards from older messages.
    try {
      const slim = { ...full, messages: messages.map((m, i) => (i < messages.length - 4 ? { ...m, cards: [] } : m)) };
      window.localStorage.setItem(key, JSON.stringify(slim));
    } catch {
      /* storage unavailable (private mode) — the session just isn't saved */
    }
  }
  window.dispatchEvent(new Event("blueprint:saved"));
}

export function clearSaved(tenant: string, memberId: string): void {
  try {
    window.localStorage.removeItem(savedKey(tenant, memberId));
  } catch {
    /* ignore */
  }
  void clearUploads(tenant, memberId); // the customer's own model / plan (IndexedDB) go with it
  window.dispatchEvent(new Event("blueprint:saved"));
}

export interface SavedSummary {
  title: string;
  total?: number;
  lines: number;
  savedAt: number;
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener("blueprint:saved", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("blueprint:saved", cb);
  };
}

/** What the start screen shows about a saved project (null when there is none). */
export function useSavedSummary(tenant: string, memberId: string | undefined): SavedSummary | null {
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      if (!memberId) return null;
      try {
        return window.localStorage.getItem(savedKey(tenant, memberId));
      } catch {
        return null;
      }
    },
    () => null,
  );
  return useMemo(() => {
    try {
      const s = parse(raw);
      if (!s || !s.messages.length) return null;
      const title = s.board.project?.project?.title ?? s.messages.find((m) => m.role === "user")?.text ?? "";
      const total = s.board.quote?.quote?.total;
      return { title: String(title).slice(0, 120), total: typeof total === "number" ? total : undefined, lines: s.state.basket.length, savedAt: s.savedAt };
    } catch {
      return null;
    }
  }, [raw]);
}

export function ago(ts: number, lang: "ro" | "en"): string {
  const min = Math.max(1, Math.round((Date.now() - ts) / 60000));
  const en = lang === "en";
  if (min < 60) return en ? `${min} min ago` : `acum ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return en ? `${h} h ago` : `acum ${h} ${h === 1 ? "oră" : "ore"}`;
  const d = Math.round(h / 24);
  return en ? `${d} day${d === 1 ? "" : "s"} ago` : `acum ${d} ${d === 1 ? "zi" : "zile"}`;
}
