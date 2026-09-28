"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectType } from "@/domain/calculators";
import type { Lang } from "@/domain/types";
import { markSeen, pickHint, readSeen } from "@/lib/hints";
import type { HintId } from "@/lib/hints";
import { IconClose } from "../ui/icons";
import { Portal } from "../ui/Portal";

/** What to say to the sketch, per project ("spune-mi «adaugă trepte»"). */
const SAY: Record<ProjectType, { ro: string; en: string }> = {
  deck: { ro: "adaugă trepte", en: "add steps" },
  fence: { ro: "pune o poartă", en: "add a gate" },
  tiling: { ro: "faianță până la 1,2 m", en: "wall tiles up to 1.2 m" },
  laminate_floor: { ro: "extinde cu 2 × 2 m", en: "extend it by 2 × 2 m" },
  lawn: { ro: "extinde cu 2 × 2 m", en: "extend it by 2 × 2 m" },
  paint_room: { ro: "adaugă o fereastră", en: "add a window" },
  drywall_partition: { ro: "adaugă o ușă", en: "add a door" },
  paving: { ro: "extinde cu 2 × 2 m", en: "extend it by 2 × 2 m" },
};

function text(id: HintId, lang: Lang, type: ProjectType | undefined, mic: boolean): string {
  const en = lang === "en";
  switch (id) {
    case "sketch": {
      const say = SAY[type ?? "deck"];
      return en
        ? `You can change the sketch — tap ✎ and drag the edges, or tell me “${say.en}”.`
        : `Poți modifica schița — apasă ✎ și trage de margini, sau spune-mi «${say.ro}».`;
    }
    case "list":
      return en ? "Tap “options” to switch a product — each option is already sized for your project." : "Apasă pe opțiuni ca să schimbi produsul — fiecare variantă e deja calculată pentru proiectul tău.";
    case "chat":
      return mic
        ? en
          ? "You can talk to me — tap the mic and say what to change."
          : "Poți vorbi — apasă pe microfon și spune ce vrei să schimbi."
        : en
          ? "Ask for any change in your own words — or tap a suggested next step."
          : "Cere orice schimbare cu cuvintele tale — sau apasă pe un pas sugerat.";
  }
}

/** The element a hint points at (the last visible match: phones keep other tabs mounted but hidden). */
function anchorOf(id: HintId): HTMLElement | null {
  const sel = id === "sketch" ? '[data-panel="sketch"]' : id === "list" ? '[data-coach="options"]' : '[data-coach="composer"]';
  const els = [...document.querySelectorAll<HTMLElement>(sel)].filter((el) => el.getClientRects().length > 0);
  // Options toggles: the first one in view; panels: the last (the live board, not a conversation snapshot).
  return (id === "list" ? els.find(inView) : els.reverse().find(inView)) ?? null;
}

function inView(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  const visible = Math.min(r.bottom, vh) - Math.max(r.top, 0);
  return r.width > 0 && visible >= Math.min(140, r.height * 0.6);
}

interface Placed {
  id: HintId;
  top: number;
  left: number;
  width: number;
  /** Arrow x inside the bubble (px), and which side it sits on; none for "inside" placements. */
  arrow?: { x: number; side: "top" | "bottom" };
}

/** The dictation button inside the composer (MicButton renders only where speech input exists). */
const MIC = '[data-coach-point], button[aria-label="Dictează"], button[aria-label="Dictate"]';
const W = 300;
const M = 12;

function place(id: HintId, el: HTMLElement): Placed {
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const width = Math.min(W, vw - 2 * M);
  const clampLeft = (x: number) => Math.max(M, Math.min(vw - width - M, x));
  if (id === "sketch") {
    // Inside the sketch, above the layer legend at its bottom edge; the controls at the top stay free.
    const bottom = Math.min(r.bottom, window.innerHeight - 64);
    return { id, top: bottom - 64 - 124, left: clampLeft(r.left + r.width / 2 - width / 2), width };
  }
  if (id === "chat") {
    // Above the composer, pointing at the microphone when there is one.
    const target = el.querySelector<HTMLElement>(MIC) ?? el;
    const t = target.getBoundingClientRect();
    const cx = t.left + t.width / 2;
    const left = clampLeft(cx - width + 40);
    return { id, top: r.top - 12 - 118, left, width, arrow: { x: Math.max(20, Math.min(width - 20, cx - left)), side: "bottom" } };
  }
  // Below the options toggle.
  const cx = r.left + r.width / 2;
  const left = clampLeft(r.left - 16);
  return { id, top: r.bottom + 12, left, width, arrow: { x: Math.max(20, Math.min(width - 20, cx - left)), side: "top" } };
}

/**
 * Lightweight first-run hints on the sketch, the list and the chat: one at a time, only when its
 * target is on screen, never over a dialog, never blocking (no backdrop, no focus steal),
 * dismissed with ×, "Am înțeles", Escape, by using the thing, or after a while — and never shown
 * again (localStorage).
 */
export default function CoachMarks({ enabled, lang, projectType, sketchDrawn }: { enabled: boolean; lang: Lang; projectType?: ProjectType; sketchDrawn: boolean }) {
  const [shown, setShown] = useState<Placed | null>(null);
  const [mic, setMic] = useState(false);
  const reduce = useReducedMotion();
  const quietUntil = useRef(0);
  const shownId = shown?.id;

  const dismiss = useCallback((id: HintId) => {
    markSeen(id);
    // A breather before the next one.
    quietUntil.current = Date.now() + 2500;
    setShown(null);
  }, []);

  // Find a hint to show (and keep its position in sync with scrolling/resizing).
  useEffect(() => {
    if (!enabled) {
      const t = setTimeout(() => setShown(null), 0);
      return () => clearTimeout(t);
    }
    let raf = 0;
    const tick = () => {
      if (document.querySelector('[role="dialog"]') || Date.now() < quietUntil.current) {
        setShown((s) => (s ? null : s));
        return;
      }
      const visible: Partial<Record<HintId, HTMLElement | null>> = {
        sketch: sketchDrawn ? anchorOf("sketch") : null,
        list: anchorOf("list"),
        chat: anchorOf("chat"),
      };
      const id = pickHint(readSeen(), { sketch: Boolean(visible.sketch), list: Boolean(visible.list), chat: Boolean(visible.chat) });
      const el = id ? visible[id] : null;
      if (!id || !el) {
        setShown((s) => (s ? null : s));
        return;
      }
      setMic(Boolean(el.querySelector(MIC)));
      const next = place(id, el);
      setShown((s) => (s && s.id === next.id && Math.abs(s.top - next.top) < 1 && Math.abs(s.left - next.left) < 1 ? s : next));
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    const id = setInterval(tick, 700);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      clearInterval(id);
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [enabled, sketchDrawn]);

  // While a hint is up: using its target, Escape or time dismisses it for good.
  useEffect(() => {
    if (!shownId) return;
    const dismissOn = (e: Event) => {
      const el = anchorOf(shownId);
      if (el && e.target instanceof Node && el.contains(e.target)) dismiss(shownId);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector('[role="dialog"]')) dismiss(shownId);
    };
    const timer = setTimeout(() => dismiss(shownId), 14_000);
    document.addEventListener("pointerdown", dismissOn, true);
    document.addEventListener("focusin", dismissOn, true);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", dismissOn, true);
      document.removeEventListener("focusin", dismissOn, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [shownId, dismiss]);

  const en = lang === "en";
  return (
    <Portal>
      <AnimatePresence>
        {shown && (
          <motion.div
            key={shown.id}
            role="note"
            aria-live="polite"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: shown.arrow?.side === "top" ? -6 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0.01 : 0.25 }}
            style={{ top: shown.top, left: shown.left, width: shown.width }}
            className="fixed z-40 rounded-2xl bg-ink p-3.5 pr-10 text-paper shadow-[0_18px_40px_-16px_rgba(20,19,17,0.6)]"
          >
            {shown.arrow && (
              <span
                aria-hidden
                style={{ left: shown.arrow.x - 7 }}
                className={`absolute h-3.5 w-3.5 rotate-45 bg-ink ${shown.arrow.side === "top" ? "-top-1.5" : "-bottom-1.5"}`}
              />
            )}
            <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-accent">{en ? "Tip" : "Sfat"}</div>
            <p className="mt-1 text-[13px] leading-snug">{text(shown.id, lang, projectType, mic)}</p>
            <button onClick={() => dismiss(shown.id)} className="mt-2 rounded-full bg-paper/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-paper hover:bg-paper/20">
              {en ? "Got it" : "Am înțeles"}
            </button>
            <button onClick={() => dismiss(shown.id)} aria-label={en ? "Close tip" : "Închide sfatul"} className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full text-paper/70 hover:bg-paper/10 hover:text-paper">
              <IconClose size={13} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
