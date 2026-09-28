"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentEvent, Card, ChoiceGroup, ProductOptionView, QualityOption, SessionState, UiCommand } from "@/agent/types";
import type { SketchOp } from "@/domain/layout";
import type { Look } from "@/domain/look";
import type { BasketItem, Quote } from "@/domain/quote";
import type { Lang } from "@/domain/types";
import { readSaved, writeSaved } from "./savedSession";

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
  /** Last sketch edit (what changed + price delta). */
  change?: CardOf<"change">;
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

/** A screen command from the assistant; `seq` makes repeats distinct, `at` lets late mounts ignore stale ones. */
export interface UiSignal {
  command: UiCommand;
  seq: number;
  at: number;
}

export function useAgent(opts: { memberId: string; tenant: string; lang: Lang; forceScripted?: boolean; restore?: boolean }) {
  // Pick up a saved project (same browser, same member) instead of starting fresh.
  const [restored] = useState(() => (opts.restore ? readSaved(opts.tenant, opts.memberId) : null));
  const [messages, setMessages] = useState<ChatMessage[]>(() => restored?.messages ?? []);
  const [board, setBoard] = useState<Board>(() => (restored ? { ...restored.board, version: restored.board.version + 1 } : { version: 0 }));
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<{ mode: "live" | "scripted"; reason?: string } | null>(null);
  const stateRef = useRef<SessionState>(restored?.state ?? { basket: [] });
  const historyRef = useRef<unknown[]>(restored?.history ?? []);
  const abortRef = useRef<AbortController | null>(null);
  const [pointsDelta, setPointsDelta] = useState<number | null>(null);
  const [ui, setUi] = useState<UiSignal | null>(null);

  // Save after every settled change (debounced; never mid-answer).
  useEffect(() => {
    if (busy || !messages.length) return;
    const t = setTimeout(() => writeSaved(opts.tenant, opts.memberId, { messages, board, state: stateRef.current, history: historyRef.current }), 500);
    return () => clearTimeout(t);
  }, [messages, board, busy, opts.tenant, opts.memberId]);

  const patchAssistant = useCallback((id: string, fn: (m: ChatMessage) => ChatMessage) => {
    setMessages((ms) => ms.map((m) => (m.id === id ? fn(m) : m)));
  }, []);

  const busyRef = useRef(false);
  const repriceSeq = useRef(0);
  /** Latest basket the user asked for (optimistic) — rapid taps build on it, failures revert it. */
  const pendingRef = useRef<BasketItem[] | null>(null);

  /** Kinds of card delivered in the current turn (so a new project keeps the sketch in view). */
  const turnKinds = useRef(new Set<Card["kind"]>());
  const putCard = useCallback((card: Card) => {
    // A basket changed by modify_basket no longer matches the tier comparison (that card has none),
    // but the per-job options still belong to the same project, so they carry over.
    const heroShown = turnKinds.current.has("project") && (card.kind === "quote" || card.kind === "plan" || card.kind === "offers" || card.kind === "stock" || card.kind === "products");
    turnKinds.current.add(card.kind);
    setBoard((b) => {
      const next = card.kind === "quote" && !card.choices && b.quote?.choices ? { ...card, choices: b.quote.choices } : card;
      // A turn that brings a new sketch keeps it on screen; the plan below doesn't steal the scroll.
      return { ...b, [card.kind]: next, last: heroShown ? b.last : card.kind, version: b.version + 1 };
    });
    if (card.kind === "quote") setPointsDelta(card.quote.points.earned);
  }, []);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || busy) return;
      setBusy(true);
      busyRef.current = true;
      // Undo covers hand edits since the last message; the conversation owns anything older.
      undoRef.current = [];
      setUndoDepth(0);
      turnKinds.current = new Set();
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
              case "ui":
                setUi((u) => ({ command: ev.command, seq: (u?.seq ?? 0) + 1, at: Date.now() }));
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
        const { quote, look } = (await res.json()) as { quote: Quote; look?: Look };
        if (seq !== repriceSeq.current) return;
        pendingRef.current = null;
        stateRef.current = { ...stateRef.current, basket: merged, storeId: quote.storeId, quality: opts2.quality ?? stateRef.current.quality };
        setBoard((b) => ({
          ...b,
          quote: b.quote
            ? {
                ...b.quote,
                quote,
                // After a hand change the tier totals describe the original list: keep them, marked as such.
                tiers: b.quote.tiers,
                tiersStale: opts2.keepTiers ? b.quote.tiersStale : Boolean(b.quote.tiers),
                quality: opts2.quality ?? b.quote.quality,
                suggestions: opts2.quality ? [] : b.quote.suggestions,
                look: look ?? b.quote.look,
              }
            : { kind: "quote", id: uid(), quote, suggestions: [], owned: [], look },
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
      stateRef.current = { ...stateRef.current, suggestions: (stateRef.current.suggestions ?? []).filter((s) => s.sku !== item.sku) };
      return reprice([...(pendingRef.current ?? stateRef.current.basket), item]);
    },
    [reprice],
  );

  // Prices don't depend on the store, so the tier comparison stays valid.
  const moveStore = useCallback((storeId: string) => reprice(pendingRef.current ?? stateRef.current.basket, { storeId, keepTiers: true }), [reprice]);

  /** Swap the product(s) doing one job for another option (already sized for the project). */
  const chooseOption = useCallback(
    (group: ChoiceGroup, option: ProductOptionView) => {
      const current = pendingRef.current ?? stateRef.current.basket;
      // Keep the list order: the new product takes the place of the one it replaces.
      const at = Math.max(0, current.findIndex((b) => b.role === group.role));
      const others = current.filter((b) => b.role !== group.role);
      const chosen = option.items.map((it) => ({ sku: it.sku, qty: it.qty, role: group.role, basis: group.basis }));
      stateRef.current = { ...stateRef.current, suggestions: (stateRef.current.suggestions ?? []).filter((s) => s.role !== group.role) };
      return reprice([...others.slice(0, at), ...chosen, ...others.slice(at)]);
    },
    [reprice],
  );

  /** Switch the whole basket to another quality tier (already priced by calculate_project). */
  const applyTier = useCallback(
    (option: QualityOption) => reprice(option.basket, { keepTiers: true, quality: option.quality }),
    [reprice],
  );

  // ───────────── sketch editing (plan editor → /api/sketch, no LLM) ─────────────
  const [sketchBusy, setSketchBusy] = useState(false);
  const [sketchError, setSketchError] = useState<string | null>(null);
  const [undoDepth, setUndoDepth] = useState(0);
  const undoRef = useRef<{ state: SessionState; board: Board }[]>([]);
  const boardRef = useRef(board);
  boardRef.current = board;
  const sketchSeq = useRef(0);

  /** Apply edits to the sketch; the list and price are recalculated server-side. Returns false if rejected. */
  const editSketch = useCallback(
    async (edits: SketchOp[]): Promise<boolean> => {
      if (busyRef.current || !stateRef.current.project || !edits.length) return false;
      const seq = ++sketchSeq.current;
      setSketchBusy(true);
      setSketchError(null);
      const before = { state: stateRef.current, board: boardRef.current };
      try {
        const res = await fetch("/api/sketch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memberId: opts.memberId, tenant: opts.tenant, lang: opts.lang, state: { ...stateRef.current, basket: pendingRef.current ?? stateRef.current.basket }, edits }),
        });
        const data = (await res.json().catch(() => ({}))) as { state?: SessionState; cards?: Card[]; error?: string };
        if (seq !== sketchSeq.current) return false;
        if (!res.ok || !data.state) {
          setSketchError(data.error ?? `HTTP ${res.status}`);
          return false;
        }
        undoRef.current = [...undoRef.current.slice(-19), before];
        setUndoDepth(undoRef.current.length);
        stateRef.current = data.state;
        pendingRef.current = null;
        repriceSeq.current++;
        // Hand edits update the cards in place (same ids), so the panel being edited —
        // e.g. inline in the conversation on a phone — stays the live one.
        for (const c of data.cards ?? []) {
          const keep = c.kind === "project" ? boardRef.current.project?.id : c.kind === "quote" ? boardRef.current.quote?.id : undefined;
          putCard(keep ? ({ ...c, id: keep } as Card) : c);
        }
        return true;
      } catch (e) {
        if (seq === sketchSeq.current) setSketchError((e as Error).message);
        return false;
      } finally {
        if (seq === sketchSeq.current) setSketchBusy(false);
      }
    },
    [opts.memberId, opts.tenant, opts.lang, putCard],
  );

  /** Step back to the sketch (and list) before the last edit. */
  const undoSketch = useCallback(() => {
    if (busyRef.current) return;
    const prev = undoRef.current.pop();
    setUndoDepth(undoRef.current.length);
    if (!prev) return;
    sketchSeq.current++;
    stateRef.current = prev.state;
    pendingRef.current = null;
    repriceSeq.current++;
    setBoard((b) => ({ ...prev.board, change: undefined, last: "project", version: b.version + 1 }));
    if (prev.board.quote) setPointsDelta(prev.board.quote.quote.points.earned);
  }, []);

  /** On-demand tenants: the customer asked to see the sketch. */
  const openSketch = useCallback(() => {
    const p = stateRef.current.project;
    if (p) stateRef.current = { ...stateRef.current, project: { ...p, sketched: true } };
    setBoard((b) => (b.project ? { ...b, project: { ...b.project, project: { ...b.project.project, sketched: true } }, last: "project", version: b.version + 1 } : b));
  }, []);

  const clearSketchError = useCallback(() => setSketchError(null), []);

  /** Reopen a project sent from another device (the `#p=` link, see shareLink.ts) — no LLM call. */
  const restoreShared = useCallback(
    async (token: string) => {
      if (busyRef.current) return;
      setBusy(true);
      busyRef.current = true;
      const aId = uid();
      const label = opts.lang === "en" ? "Opening the project from your other device" : "Deschid proiectul de pe celălalt dispozitiv";
      setMessages((ms) => [...ms, { id: aId, role: "assistant", text: "", log: [{ tool: "restore", label, at: Date.now(), done: false }], cards: [], pending: true }]);
      try {
        const res = await fetch("/api/restore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memberId: opts.memberId, tenant: opts.tenant, lang: opts.lang, token }),
        });
        const data = (await res.json().catch(() => ({}))) as { state?: SessionState; cards?: Card[]; message?: string; error?: string };
        if (!res.ok || !data.state || !data.cards) throw new Error(data.error ?? `HTTP ${res.status}`);
        stateRef.current = data.state;
        pendingRef.current = null;
        repriceSeq.current++;
        for (const c of data.cards) putCard(c);
        historyRef.current = [...historyRef.current, { role: "assistant", content: data.message ?? "" }];
        patchAssistant(aId, (m) => ({ ...m, text: data.message ?? "", cards: data.cards! }));
      } catch (e) {
        patchAssistant(aId, (m) => ({ ...m, error: (e as Error).message }));
      } finally {
        patchAssistant(aId, (m) => ({ ...m, pending: false, log: m.log.map((l) => ({ ...l, done: true })) }));
        setBusy(false);
        busyRef.current = false;
      }
    },
    [opts.memberId, opts.tenant, opts.lang, patchAssistant, putCard],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    stateRef.current = { basket: [] };
    historyRef.current = [];
    undoRef.current = [];
    setUndoDepth(0);
    setMessages([]);
    setBoard({ version: 0 });
    setPointsDelta(null);
    setUi(null);
  }, []);

  return {
    messages,
    board,
    busy,
    send,
    changeQty,
    addItem,
    moveStore,
    applyTier,
    chooseOption,
    reset,
    restoreShared,
    pointsDelta,
    state: stateRef,
    mode,
    ui,
    sketch: { edit: editSketch, undo: undoSketch, open: openSketch, busy: sketchBusy, error: sketchError, clearError: clearSketchError, canUndo: undoDepth > 0 },
  };
}
