"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Lang } from "@/domain/types";
import { IconArrow, IconClose } from "../ui/icons";
import { Portal } from "../ui/Portal";
import type { PanelTarget } from "./MobileTabs";

/**
 * A guided tour for people evaluating Blueprint on their own (e.g. the retailer's team): it runs a
 * real project with the offline assistant (instant, identical every time, no AI quota) and stops at
 * each part of the screen with what it does for the customer — and for the retailer.
 */

type Board = "project" | "quote" | "plan" | "change" | "budget";

interface Step {
  /** Element to light up (the last visible match); none → a centred card. */
  anchor?: string;
  /** Phones: the tab that holds it. Desktop: scrolled into view. */
  panel?: PanelTarget;
  title: [string, string];
  body: [string, string];
  /** When the step opens. */
  enter?: (t: TourActions) => void;
  /** Wait for this before lighting the anchor (the demo's answer arriving). */
  ready?: (has: (k: Board) => boolean) => boolean;
  /** Once it's ready (e.g. draw the sketch for retailers that only draw it on request). */
  onReady?: (t: TourActions) => void;
}

export interface TourActions {
  send: (text: string) => void;
  openCart: (open: boolean) => void;
  reveal: (panel: PanelTarget) => void;
  /** Draw the 3D sketch (retailers set to draw it only on request). */
  openSketch: () => void;
  /** Phones: back to the conversation (where the budget card is). */
  showChat: () => void;
}

const DECK = { ro: "Vreau o terasă din lemn de 4 x 3 m în curte, pe pământ.", en: "I want to build a 4 x 3 m wooden deck in my garden, on soil." };
const STEPS_EDIT = { ro: "adaugă 2 trepte în față", en: "add 2 steps at the front" };
const BUDGET = { ro: "Am un buget de 3.000 lei", en: "My budget is 3,000 lei" };

function steps(lang: Lang, retailer: string): Step[] {
  const en = lang === "en";
  return [
    {
      title: ["Tur ghidat · 3 minute", "Guided tour · 3 minutes"],
      body: [
        "Îți arăt ce vede un client care deschide Blueprint din cardul lui de fidelitate: un proiect real, de la idee la coș. Turul folosește asistentul demo, ca să fie instant; după tur poți încerca propriul proiect cu AI-ul live.",
        "This is what a customer sees when they open Blueprint from their loyalty card: a real project, from idea to basket. The tour uses the demo assistant so it's instant; afterwards, try your own project with the live AI.",
      ],
    },
    {
      anchor: '[data-coach="composer"]',
      title: ["1 · Clientul spune ce vrea", "1 · The customer says what they want"],
      body: [
        "Cu cuvintele lui, în română sau engleză, scris sau vocal. Nu trebuie să știe ce produse îi trebuie — doar ce vrea să construiască. Apasă «Mai departe» și trimit: «Terasă din lemn 4 × 3 m».",
        "In their own words, Romanian or English, typed or spoken. They don't need to know which products — only what they want to build. Press “Next” and I'll send: “a 4 × 3 m wooden deck”.",
      ],
    },
    {
      anchor: '[data-panel="sketch"]',
      panel: "sketch",
      enter: (t) => t.send(en ? DECK.en : DECK.ro),
      ready: (has) => has("project") && has("quote"),
      onReady: (t) => t.openSketch(),
      title: ["2 · Schița 3D, din dimensiunile lui", "2 · A 3D sketch from their dimensions"],
      body: [
        "Se construiește strat cu strat. E orientativă, nu proiect tehnic — dar clientul vede ce cumpără și o poate modifica: trăgând de margini sau cerând în chat. Încearcă vederile PLAN / REAL / EXPLODAT și camerele.",
        "It builds layer by layer. Indicative, not a technical drawing — but the customer sees what they're buying and can change it: by dragging the edges or by asking in the chat. Try PLAN / REAL / EXPLODED and the cameras.",
      ],
    },
    {
      anchor: '[data-tour="total"]',
      panel: "list",
      title: ["3 · Lista completă, cu prețul lui", "3 · The full list, at their price"],
      body: [
        "Cantitățile vin din motorul de calcul (pierderi, pachete, accesorii), nu din AI — AI-ul doar explică. Fiecare sumă din răspuns e verificată cu lista (bifa verde). Fiecare produs are variante deja calculate pentru proiect.",
        "Quantities come from the calculation engine (waste, pack sizes, accessories), not from the AI — the AI only explains. Every amount in the reply is checked against the list (green tick). Each line has options already sized for the project.",
      ],
    },
    {
      anchor: '[data-panel="offers"]',
      panel: "offers",
      title: ["4 · Ofertele personale WalletLoop", "4 · Personal WalletLoop offers"],
      body: [
        "Se aplică singure, pentru acest membru: reduceri pe categorie, pachete, praguri — plus punctele câștigate și plata cu puncte. Reducerile sunt arătate față de cel mai mic preț din 30 de zile (Omnibus).",
        "Applied automatically for this member: category discounts, bundles, thresholds — plus points earned and paying with points. Reductions are shown against the lowest price in 30 days (Omnibus).",
      ],
    },
    {
      anchor: '[data-panel="stock"]',
      panel: "stock",
      title: ["5 · Stocul, în fiecare magazin", "5 · Stock, in every store"],
      body: [
        "Clientul vede dacă totul e în magazinul lui; dacă lipsește ceva, asistentul propune cel mai apropiat magazin care are tot sau livrarea — înainte să plece de acasă.",
        "The customer sees whether everything is in their store; if something's short, the assistant suggests the nearest store that has it all, or delivery — before they leave home.",
      ],
    },
    {
      anchor: '[data-panel="sketch"]',
      panel: "sketch",
      enter: (t) => t.send(en ? STEPS_EDIT.en : STEPS_EDIT.ro),
      ready: (has) => has("change"),
      title: ["6 · Orice schimbare, recalculată", "6 · Every change, recalculated"],
      body: [
        "Am cerut «adaugă 2 trepte în față»: schița se redesenează, lista se recalculează păstrând produsele alese, iar clientul vede exact diferența de preț, linie cu linie.",
        "I asked “add 2 steps at the front”: the sketch redraws, the list recalculates keeping the chosen products, and the customer sees exactly what it changes, line by line.",
      ],
    },
    {
      anchor: '[data-tour="budget"]',
      enter: (t) => {
        t.showChat();
        t.send(en ? BUDGET.en : BUDGET.ro);
      },
      ready: (has) => has("budget"),
      title: ["7 · Are un buget? Varianta care încape", "7 · A budget? The version that fits"],
      body: [
        "Am scris «am un buget de 3.000 lei». Motorul de prețuri caută varianta cea mai bună care încape: altă gamă, fără extra, apoi o terasă mai mică — cu prețuri reale. Clientul apasă «Aplică» și schița se adaptează. Un client cu buget mic tot cumpără.",
        "I wrote “my budget is 3,000 lei”. The pricing engine finds the best version that fits: another range, no extras, then a smaller deck — with real prices. One tap on “Apply” and the sketch follows. A customer on a tight budget still buys.",
      ],
    },
    {
      anchor: '[data-panel="plan"]',
      panel: "plan",
      ready: (has) => has("plan"),
      title: ["8 · Planul pas cu pas", "8 · The step-by-step plan"],
      body: [
        `Pași, durate, sfaturi și avertismente de siguranță pentru proiectul lui. Pentru ${retailer} pot fi șabloanele voastre aprobate, cu sfaturile AI marcate separat.`,
        `Steps, durations, tips and safety warnings for their project. For ${retailer} these can be your approved templates, with the AI tips labelled separately.`,
      ],
    },
    {
      anchor: '[data-tour="cart"]',
      enter: (t) => t.openCart(true),
      title: ["9 · Click & Collect, în cardul din Wallet", "9 · Click & Collect, on the Wallet card"],
      body: [
        "Rezervă pentru ridicare (magazin, interval) sau livrare. Lista ajunge pe spatele cardului de fidelitate, sortată pe culoare — clientul o are în magazin, fără aplicație.",
        "Reserve for pickup (store, time slot) or delivery. The list lands on the back of the loyalty card, sorted by aisle — the customer has it in store, no app needed.",
      ],
    },
    {
      enter: (t) => t.openCart(false),
      title: [`Ce câștigă ${retailer}`, `What ${retailer} gets`],
      body: [
        "Coșuri complete (cu tot ce trebuie, nu doar produsul principal), mai puține retururi și drumuri înapoi, clienți care pleacă de acasă cu planul — și date anonime despre ce proiecte vor clienții. Încearcă acum propriul proiect, cu AI-ul live.",
        "Complete baskets (everything the job needs, not just the main product), fewer returns and second trips, customers who arrive with a plan — and anonymous data on the projects customers want. Now try your own project, with the live AI.",
      ],
    },
  ];
}

function anchorRect(sel: string): DOMRect | null {
  const els = [...document.querySelectorAll<HTMLElement>(sel)].filter((el) => el.getClientRects().length > 0);
  const el = els.at(-1);
  return el ? el.getBoundingClientRect() : null;
}

export default function Tour({
  lang,
  retailer,
  has,
  actions,
  isDesktop,
  onExit,
}: {
  lang: Lang;
  /** The retailer's name, as the customer sees it. */
  retailer: string;
  has: (k: Board) => boolean;
  actions: TourActions;
  isDesktop: boolean;
  /** The tour ended: `tryLive` when they chose to try their own project. */
  onExit: (tryLive: boolean) => void;
}) {
  const all = steps(lang, retailer);
  const [i, setI] = useState(0);
  const step = all[i];
  const en = lang === "en";
  const ready = !step.ready || step.ready(has);
  // The lit element's box, for the step it was measured in.
  const [pos, setPos] = useState<{ i: number; r: DOMRect } | null>(null);
  const rect = step.anchor && ready && pos?.i === i ? pos.r : null;
  const entered = useRef(-1);

  // Run the step's action once; bring its panel into view once what it shows has arrived
  // (on phones the tab only exists after the first answer).
  const revealed = useRef(-1);
  useEffect(() => {
    if (entered.current === i) return;
    entered.current = i;
    step.enter?.(actions);
  }, [i, step, actions]);
  useEffect(() => {
    if (!ready || !step.panel || revealed.current === i) return;
    const panel = step.panel;
    // Next tick: the workspace (a parent) updates its tabs after this child's effects run.
    const t = setTimeout(() => {
      revealed.current = i;
      step.onReady?.(actions);
      actions.reveal(panel);
    }, 0);
    return () => clearTimeout(t);
  }, [ready, i, step, actions]);

  // Follow the anchor while things move (streaming cards, scrolling, the sketch building).
  useEffect(() => {
    if (!step.anchor || !ready) return;
    let raf = 0;
    let scrolled = false;
    const tick = () => {
      const r = anchorRect(step.anchor!);
      if (r && !scrolled && (r.top < 0 || r.bottom > window.innerHeight) && isDesktop) {
        scrolled = true;
        document.querySelectorAll<HTMLElement>(step.anchor!).forEach((el, k, list) => k === list.length - 1 && el.scrollIntoView({ behavior: "smooth", block: "center" }));
      }
      setPos((prev) => {
        if (!r) return prev;
        const p = prev?.i === i ? prev.r : null;
        const moved = !p || Math.abs(p.top - r.top) > 0.5 || Math.abs(p.left - r.left) > 0.5 || Math.abs(p.height - r.height) > 0.5 || Math.abs(p.width - r.width) > 0.5;
        return moved ? { i, r } : prev;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step.anchor, ready, isDesktop, i]);

  const next = () => (i < all.length - 1 ? setI(i + 1) : onExit(true));
  const back = () => setI((k) => Math.max(0, k - 1));

  const count = all.length;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if (typing && e.key !== "Escape") return;
      if (e.key === "Escape") onExit(false);
      else if (e.key === "ArrowRight" && ready) {
        if (i < count - 1) setI(i + 1);
        else onExit(true);
      } else if (e.key === "ArrowLeft") setI((k) => Math.max(0, k - 1));
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [i, count, onExit, ready]);

  // Where the card sits: next to the lit element on desktop, a bottom sheet on phones.
  const cardW = 380;
  const pad = 10;
  let cardStyle: React.CSSProperties;
  if (!isDesktop || !rect) {
    cardStyle = isDesktop ? { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: cardW } : { left: 12, right: 12, bottom: "max(12px, env(safe-area-inset-bottom))" };
  } else {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.min(Math.max(16, rect.left), vw - cardW - 16);
    const below = rect.bottom + pad + 220 < vh;
    const above = rect.top - pad - 220 > 0;
    cardStyle = below
      ? { left, top: rect.bottom + pad + 6, width: cardW }
      : above
        ? { left, bottom: vh - rect.top + pad + 6, width: cardW }
        : { left: Math.max(16, Math.min(rect.left - cardW - 24, vw - cardW - 16)), top: Math.max(16, Math.min(rect.top, vh - 260)), width: cardW };
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label={en ? "Guided tour" : "Tur ghidat"}>
        {/* the dimmed page, with a hole over the lit element */}
        {rect ? (
          <div
            className="pointer-events-none absolute rounded-[18px] ring-2 ring-accent transition-[top,left,width,height] duration-300"
            style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: "0 0 0 9999px rgba(15,14,12,0.55)" }}
          />
        ) : (
          <div className="absolute inset-0 bg-[rgba(15,14,12,0.55)]" />
        )}
        {/* Positioning lives on this wrapper; the animation (which owns `transform`) on the card inside. */}
        <div className="absolute" style={cardStyle}>
        <AnimatePresence mode="wait">
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="rounded-[20px] border border-rule bg-card p-5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]"
          >
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
                  {en ? "Guided tour" : "Tur ghidat"} · {i + 1}/{all.length}
                </div>
                <h3 className="display mt-1 text-[21px] leading-tight text-ink">{step.title[en ? 1 : 0]}</h3>
              </div>
              <button onClick={() => onExit(false)} aria-label={en ? "Close the tour" : "Închide turul"} className="grid h-8 w-8 place-items-center rounded-full text-ink-3 hover:bg-ink/5 hover:text-ink">
                <IconClose size={15} />
              </button>
            </div>
            <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">{step.body[en ? 1 : 0]}</p>
            <div className="mt-4 flex items-center gap-2">
              <div className="flex flex-1 gap-1" aria-hidden>
                {all.map((_, k) => (
                  <span key={k} className={`h-1 flex-1 rounded-full ${k <= i ? "bg-accent" : "bg-paper-3"}`} />
                ))}
              </div>
              {i > 0 && (
                <button onClick={back} className="rounded-full px-3 py-2 text-[13px] font-semibold text-ink-2 hover:text-ink">
                  {en ? "Back" : "Înapoi"}
                </button>
              )}
              <button
                onClick={next}
                disabled={!ready}
                className="flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-paper transition hover:bg-accent hover:text-on-accent disabled:opacity-40"
              >
                {!ready ? (en ? "Preparing…" : "Se pregătește…") : i === 0 ? (en ? "Start" : "Începe") : i === all.length - 1 ? (en ? "Try it live" : "Încearcă live") : en ? "Next" : "Mai departe"}
                {ready && <IconArrow size={14} />}
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
        </div>
      </div>
    </Portal>
  );
}
