"use client";

import { useCallback, useRef, useState } from "react";
import type { AgentEvent, Card, QualityOption, SessionState } from "@/agent/types";
import type { BasketItem, Quote } from "@/domain/quote";
import type { Lang } from "@/domain/types";

export interface LogEntry {
  tool: string;
  label: string;
  at: number;
  done: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  log: LogEntry[];
  cards: Card[];
  pending?: boolean;
  error?: string;
  ms?: number;
  verified?: { ok: boolean; checked: number; replaced?: boolean };
}

type CardOf<K extends Card["kind"]> = Extract<Card, { kind: K }>;
export interface Board {
  project?: CardOf<"project">;
  quote?: CardOf<"quote">;
  stock?: CardOf<"stock">;
  offers?: CardOf<"offers">;
  plan?: CardOf<"plan">;
  products?: CardOf<"products">;
  /** Most recently updated panel, for scroll-into-view + highlight. */
  last?: Card["kind"];
  version: number;
}

const uid = () => Math.random().toString(36).slice(2, 10);

function mergeItems(items: BasketItem[]): BasketItem[] {
  const out = new Map<string, BasketItem>();
  for (const it of items) {
    const prev = out.get(it.sku);
    out.set(it.sku, prev ? { ...prev, qty: prev.qty + it.qty } : { ...it });
  }
  return [...out.values()].filter((i) => i.qty > 0);
}

export function useAgent(opts: { memberId: string; tenant: string; lang: Lang; forceScripted?: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [board, setBoard] = useState<Board>({ version: 0 });
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<{ mode: "live" | "scripted"; reason?: string } | null>(null);
  const stateRef = useRef<SessionState>({ basket: [] });
  const historyRef = useRef<unknown[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const [pointsDelta, setPointsDelta] = useState<number | null>(null);

  const patchAssistant = useCallback((id: string, fn: (m: ChatMessage) => ChatMessage) => {
    setMessages((ms) => ms.map((m) => (m.id === id ? fn(m) : m)));
  }, []);

  const busyRef = useRef(false);
  const repriceSeq = useRef(0);
  /** Latest basket the user asked for (optimistic) — rapid taps build on it, failures revert it. */
  const pendingRef = useRef<BasketItem[] | null>(null);

  const putCard = useCallback((card: Card) => {
    // A basket changed by modify_basket no longer matches the tier comparison, so that card simply has none.
    setBoard((b) => ({ ...b, [card.kind]: card, last: card.kind, version: b.version + 1 }));
    if (card.kind === "quote") setPointsDelta(card.quote.points.earned);
  }, []);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || busy) return;
      setBusy(true);
      busyRef.current = true;
      const aId = uid();
      setMessages((ms) => [
        ...ms,
        { id: uid(), role: "user", text: message, log: [], cards: [] },
        { id: aId, role: "assistant", text: "", log: [], cards: [], pending: true },
      ]);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            memberId: opts.memberId,
            tenant: opts.tenant,
            message,
            history: historyRef.current,
            state: stateRef.current,
            lang: opts.lang,
            mode: opts.forceScripted ? "scripted" : undefined,
          }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(err.error ?? "Request failed");
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            const ev = JSON.parse(line) as AgentEvent;
            switch (ev.type) {
              case "text":
                patchAssistant(aId, (m) => ({ ...m, text: m.text + ev.delta, log: m.log.map((l) => ({ ...l, done: true })) }));
                break;
              case "status":
                patchAssistant(aId, (m) => ({
                  ...m,
                  log: [...m.log.map((l) => ({ ...l, done: true })), { tool: ev.tool, label: ev.label, at: Date.now(), done: false }],
                }));
                break;
              case "card":
                putCard(ev.card);
                patchAssistant(aId, (m) => ({ ...m, cards: [...m.cards, ev.card] }));
                break;
              case "state":
                stateRef.current = ev.state;
                // The agent's basket is authoritative: drop any in-flight UI edit.
                pendingRef.current = null;
                repriceSeq.current++;
                break;
              case "mode":
                setMode({ mode: ev.mode, reason: ev.reason });
                break;
              case "replace_text":
                patchAssistant(aId, (m) => ({ ...m, text: ev.text }));
                break;
              case "verified":
                patchAssistant(aId, (m) => ({ ...m, verified: { ok: ev.ok, checked: ev.checked, replaced: ev.replaced } }));
                break;
              case "history":
                historyRef.current = ev.items;
                break;
              case "error":
                patchAssistant(aId, (m) => ({ ...m, error: ev.message }));
                break;
              case "done":
                patchAssistant(aId, (m) => ({ ...m, pending: false, ms: ev.ms, log: m.log.map((l) => ({ ...l, done: true })) }));
                break;
            }
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          patchAssistant(aId, (m) => ({ ...m, error: (e as Error).message }));
        }
      } finally {
        patchAssistant(aId, (m) => ({ ...m, pending: false, log: m.log.map((l) => ({ ...l, done: true })) }));
        setBusy(false);
        busyRef.current = false;
        abortRef.current = null;
      }
    },
    [busy, opts.memberId, opts.tenant, opts.lang, opts.forceScripted, patchAssistant, putCard],
  );

  /**
   * Re-price after a direct edit in the UI (no LLM round-trip). Edits are ignored
   * while the agent is answering (its state would overwrite them), responses that
   * arrive out of order are dropped, and local state only changes on success.
   */
  const reprice = useCallback(
    async (basket: BasketItem[], opts2: { storeId?: string; keepTiers?: boolean; quality?: QualityOption["quality"] } = {}) => {
      if (busyRef.current) return;
      const merged = mergeItems(basket);
      const sid = opts2.storeId ?? stateRef.current.storeId;
      const seq = ++repriceSeq.current;
      pendingRef.current = merged;
      try {
        const res = await fetch("/api/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memberId: opts.memberId, tenant: opts.tenant, items: merged, storeId: sid, lang: opts.lang }),
        });
        if (!res.ok) throw new Error(`quote ${res.status}`);
        const { quote } = (await res.json()) as { quote: Quote };
        if (seq !== repriceSeq.current) return;
        pendingRef.current = null;
        stateRef.current = { ...stateRef.current, basket: merged, storeId: quote.storeId, quality: opts2.quality ?? stateRef.current.quality };
        setBoard((b) => ({
          ...b,
          quote: b.quote
            ? {
                ...b.quote,
                quote,
                tiers: opts2.keepTiers ? b.quote.tiers : undefined,
                quality: opts2.quality ?? b.quote.quality,
                suggestions: opts2.quality ? [] : b.quote.suggestions,
              }
            : { kind: "quote", id: uid(), quote, suggestions: [], owned: [] },
          last: "quote",
          version: b.version + 1,
        }));
        setPointsDelta(quote.points.earned);
      } catch {
        // Keep the last confirmed basket and quote.
        if (seq === repriceSeq.current) pendingRef.current = null;
      }
    },
    [opts.memberId, opts.tenant, opts.lang],
  );

  /** Change a line's quantity by `delta`, based on the real basket (not the displayed number). */
  const changeQty = useCallback(
    (sku: string, delta: number) => {
      const current = pendingRef.current ?? stateRef.current.basket;
      const basket = current.map((b) => (b.sku === sku ? { ...b, qty: b.qty + delta } : b)).filter((b) => b.qty > 0);
      return reprice(basket);
    },
    [reprice],
  );

  const addItem = useCallback(
    (item: BasketItem) => {
      if (busyRef.current) return;
      setBoard((b) => (b.quote ? { ...b, quote: { ...b.quote, suggestions: b.quote.suggestions.filter((s) => s.sku !== item.sku) } } : b));
      return reprice([...(pendingRef.current ?? stateRef.current.basket), item]);
    },
    [reprice],
  );

  // Prices don't depend on the store, so the tier comparison stays valid.
  const moveStore = useCallback((storeId: string) => reprice(pendingRef.current ?? stateRef.current.basket, { storeId, keepTiers: true }), [reprice]);

  /** Switch the whole basket to another quality tier (already priced by calculate_project). */
  const applyTier = useCallback(
    (option: QualityOption) => reprice(option.basket, { keepTiers: true, quality: option.quality }),
    [reprice],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    stateRef.current = { basket: [] };
    historyRef.current = [];
    setMessages([]);
    setBoard({ version: 0 });
    setPointsDelta(null);
  }, []);

  return { messages, board, busy, send, changeQty, addItem, moveStore, applyTier, reset, pointsDelta, state: stateRef, mode };
}
