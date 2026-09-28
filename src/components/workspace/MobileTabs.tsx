"use client";

import { AnimatePresence, motion } from "motion/react";
import type { SVGProps } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChoiceGroup, ProductOptionView, ProjectSnapshot, QualityOption } from "@/agent/types";
import type { Tenant } from "@/config/tenant";
import type { BasketItem } from "@/domain/quote";
import type { Lang } from "@/domain/types";
import { dec, int, unitText } from "@/lib/format";
import { tr } from "@/lib/i18n";
import type { Board, ChatMessage, UiSignal } from "@/lib/useAgent";
import { useLiteGraphics } from "@/lib/useLiteGraphics";
import BlueprintPanel from "../board/BlueprintPanel";
import type { SketchControls } from "../board/BlueprintPanel";
import ChangeCard from "../board/ChangeCard";
import OffersPanel from "../board/OffersPanel";
import PlanPanel from "../board/PlanPanel";
import ProductsPanel from "../board/ProductsPanel";
import QuotePanel from "../board/QuotePanel";
import StockPanel from "../board/StockPanel";
import WeatherPanel from "../board/WeatherPanel";
import { IconBag, IconClock, IconCube, IconPin, IconUsers, IconWarn } from "../ui/icons";
import { PanelHeader } from "../ui/primitives";

/*
 * Phones (< lg): the board is split into full-height tabs under the conversation —
 * Chat · Schiță · Listă · Magazine · Plan — so there is a single 3D canvas (only while
 * the Schiță tab is open) and no long scroll of inline cards.
 */

export type TabId = "chat" | "sketch" | "list" | "stores" | "plan";
/** A panel inside a tab (chips and the assistant's screen commands can point at one). */
export type PanelTarget = "sketch" | "list" | "products" | "stock" | "offers" | "plan";

export const TAB_OF: Record<PanelTarget, Exclude<TabId, "chat">> = {
  sketch: "sketch",
  list: "list",
  products: "list",
  stock: "stores",
  offers: "stores",
  plan: "plan",
};

export const TAB_LABEL: Record<TabId, { ro: string; en: string }> = {
  chat: { ro: "Chat", en: "Chat" },
  sketch: { ro: "Schiță", en: "Sketch" },
  list: { ro: "Listă", en: "List" },
  stores: { ro: "Magazine", en: "Stores" },
  plan: { ro: "Plan", en: "Plan" },
};

const TABS: TabId[] = ["chat", "sketch", "list", "stores", "plan"];

/** Outdoor projects get the build-day forecast (same rule as the desktop board). */
const weatherFor = (board: Board) => (board.project && board.quote && ["deck", "fence", "lawn"].includes(board.project.project.type) ? board.quote.quote.availability.origin : null);

export function tabAvailability(board: Board): Record<TabId, boolean> {
  return {
    chat: true,
    sketch: Boolean(board.project),
    list: Boolean(board.quote || board.products),
    stores: Boolean(board.quote || board.offers),
    plan: Boolean(board.plan || weatherFor(board)),
  };
}

export interface MobileTabs {
  tab: TabId;
  available: Record<TabId, boolean>;
  /** Tabs with something new the customer hasn't looked at (value bumps on every update, to re-pulse). */
  unread: Partial<Record<TabId, number>>;
  select: (t: TabId, panel?: PanelTarget) => void;
  /** Flag a tab as updated without switching to it. */
  notify: (t: TabId) => void;
  scrollTo: { panel: PanelTarget; seq: number } | null;
}

export function useMobileTabs(board: Board, messages: ChatMessage[]): MobileTabs {
  const [tab, setTab] = useState<TabId>("chat");
  const [unread, setUnread] = useState<Partial<Record<TabId, number>>>({});
  const [seen, setSeen] = useState({ board, messages });
  const [scrollTo, setScrollTo] = useState<MobileTabs["scrollTo"]>(null);
  const available = tabAvailability(board);
  const current: TabId = available[tab] ? tab : "chat";
  if (current !== tab) setTab(current);

  // Something new on the board (or in the chat) outside the open tab → a dot on that tab.
  if (seen.board !== board || seen.messages !== messages) {
    const prev = seen.board;
    const next = { ...unread };
    const bump = (t: TabId) => {
      if (t !== current) next[t] = (next[t] ?? 0) + 1;
    };
    if (board.project !== prev.project || board.change !== prev.change) bump("sketch");
    if (board.quote !== prev.quote || board.products !== prev.products) bump("list");
    if (board.stock !== prev.stock || board.offers !== prev.offers) bump("stores");
    if (board.plan !== prev.plan) bump("plan");
    // The reply keeps streaming: one dot, no re-pulse on every word.
    if (messages !== seen.messages && current !== "chat" && !next.chat) next.chat = 1;
    setSeen({ board, messages });
    setUnread(next);
  }

  const select = useCallback((t: TabId, panel?: PanelTarget) => {
    setTab(t);
    setUnread((u) => {
      if (!u[t]) return u;
      const n = { ...u };
      delete n[t];
      return n;
    });
    if (panel) setScrollTo((s) => ({ panel, seq: (s?.seq ?? 0) + 1 }));
  }, []);

  const notify = (t: TabId) => {
    if (t !== current) setUnread((u) => ({ ...u, [t]: (u[t] ?? 0) + 1 }));
  };

  return { tab: current, available, unread, select, notify, scrollTo };
}

// ───────────────────────────── tab bar ─────────────────────────────

export function MobileTabBar({ tabs, board, lang, busy }: { tabs: MobileTabs; board: Board; lang: Lang; busy: boolean }) {
  const en = lang === "en";
  const quote = board.quote?.quote;
  const main = board.project?.project.measurements[0];
  const meta: Partial<Record<TabId, string>> = {
    chat: busy ? (en ? "typing…" : "scrie…") : undefined,
    sketch: main ? `${dec(main.value, lang, main.unit === "buc" || main.unit === "rânduri" ? 0 : Number.isInteger(main.value) ? 0 : 1)} ${unitText(main.unit, lang)}` : undefined,
    list: quote ? `${int(quote.total, lang)} lei` : undefined,
    stores: quote ? (quote.availability.allInStock ? (en ? "in stock" : "pe stoc") : `${quote.availability.missing.length} ${en ? "missing" : "lipsă"}`) : undefined,
    plan: board.plan ? `${board.plan.plan.steps.length} ${en ? "steps" : "pași"}` : undefined,
  };
  const icons: Record<TabId, React.ReactNode> = {
    chat: <IconChat size={20} />,
    sketch: <IconCube size={20} />,
    list: <IconBag size={20} />,
    stores: <IconPin size={20} />,
    plan: <IconPlanSteps size={20} />,
  };

  return (
    <nav className="relative z-30 shrink-0 border-t border-rule bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label={en ? "Project views" : "Secțiunile proiectului"}>
      <div
        role="tablist"
        className="grid grid-cols-5"
        onKeyDown={(e) => {
          // Tabs pattern: ←/→ (Home/End) move between the available tabs and open them.
          const open = TABS.filter((t) => tabs.available[t]);
          const i = open.indexOf(tabs.tab);
          const to = e.key === "ArrowRight" ? open[(i + 1) % open.length] : e.key === "ArrowLeft" ? open[(i - 1 + open.length) % open.length] : e.key === "Home" ? open[0] : e.key === "End" ? open[open.length - 1] : undefined;
          if (!to) return;
          e.preventDefault();
          tabs.select(to);
          document.getElementById(`mtab-btn-${to}`)?.focus();
        }}
      >
        {TABS.map((t) => {
          const active = tabs.tab === t;
          const pulse = tabs.unread[t];
          return (
            <button
              key={t}
              role="tab"
              id={`mtab-btn-${t}`}
              aria-selected={active}
              aria-controls={`mtab-${t}`}
              tabIndex={active ? 0 : -1}
              disabled={!tabs.available[t]}
              onClick={() => tabs.select(t)}
              className={`relative flex min-w-0 flex-col items-center gap-[3px] px-1 pb-1.5 pt-2 transition disabled:opacity-30 ${active ? "text-ink" : "text-ink-3 enabled:hover:text-ink-2"}`}
            >
              {active && <motion.span layoutId="mtab-active" transition={{ type: "spring", stiffness: 500, damping: 40 }} className="absolute inset-x-4 top-0 h-[2px] rounded-full bg-accent" />}
              <span className="relative grid h-[22px] place-items-center">
                {icons[t]}
                {t === "list" && quote ? (
                  <motion.span
                    key={`${quote.lines.length}-${pulse ?? 0}`}
                    initial={{ scale: pulse ? 1.5 : 1 }}
                    animate={{ scale: 1 }}
                    className={`absolute -right-2.5 -top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 font-mono text-[9px] font-bold ring-2 ring-paper ${
                      pulse ? "bg-accent text-on-accent" : "bg-ink text-paper"
                    }`}
                  >
                    {quote.lines.length}
                  </motion.span>
                ) : pulse ? (
                  <UpdateDot key={pulse} />
                ) : null}
                {t === "list" && quote && pulse ? <UpdateRing key={pulse} className="-right-2.5 -top-1 h-4 w-4" /> : null}
              </span>
              <span className="font-mono text-[9.5px] font-medium uppercase leading-none tracking-[0.12em]">{TAB_LABEL[t][lang]}</span>
              <span className={`h-3 max-w-full truncate font-mono text-[9px] leading-3 tabular-nums ${t === "list" && quote ? "font-semibold text-ink" : ""}`}>{meta[t]}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function UpdateDot() {
  return (
    <>
      <span className="absolute -right-1.5 -top-0.5 h-2 w-2 rounded-full bg-accent ring-2 ring-paper" />
      <UpdateRing className="-right-1.5 -top-0.5 h-2 w-2" />
    </>
  );
}

/** Two expanding rings when a tab gets new content. */
function UpdateRing({ className }: { className: string }) {
  return (
    <motion.span
      aria-hidden
      initial={{ scale: 1, opacity: 0.7 }}
      animate={{ scale: 2.8, opacity: 0 }}
      transition={{ duration: 1.1, repeat: 1, ease: "easeOut" }}
      className={`pointer-events-none absolute rounded-full bg-accent ${className}`}
    />
  );
}

// ───────────────────────────── tab panels ─────────────────────────────

export interface MobilePanelsProps {
  tabs: MobileTabs;
  board: Board;
  tenant: Tenant;
  lang: Lang;
  highlight: string | null;
  onHighlight: (l: string | null) => void;
  onQty: (sku: string, delta: number) => void;
  onAdd: (item: BasketItem) => void;
  onMoveStore: (storeId: string) => void;
  onTier?: (o: QualityOption) => void;
  onChoose?: (g: ChoiceGroup, o: ProductOptionView) => void;
  sketch?: SketchControls;
  ui?: UiSignal | null;
}

/** The board panels, one tab each (rendered from the board exactly like the desktop Board). */
export function MobilePanels(props: MobilePanelsProps) {
  const { tabs, board, tenant, lang, highlight, onHighlight, onQty, onAdd, onMoveStore, onTier, onChoose, sketch, ui } = props;
  const lite = useLiteGraphics();
  const root = useRef<HTMLDivElement>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  // Stores and Plan mount on first visit, so their drawing animations play when opened.
  const [visited, setVisited] = useState<TabId[]>([]);
  if (!visited.includes(tabs.tab)) setVisited([...visited, tabs.tab]);

  useEffect(() => {
    if (!tabs.scrollTo) return;
    root.current?.querySelector(`[data-panel="${tabs.scrollTo.panel}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [tabs.scrollTo]);

  const quote = board.quote?.quote;
  const weather = weatherFor(board);
  const ch = board.change;
  // Hand edits show their receipt under the sketch (BlueprintPanel, inline); the assistant's go here.
  const agentChange = ch && ch.change.source === "agent" && ch.id !== dismissed && ch.change.lines.length + ch.change.edits.length > 0 ? ch : undefined;

  const pane = (t: TabId, children: React.ReactNode) => (
    <div id={`mtab-${t}`} role="tabpanel" aria-labelledby={`mtab-btn-${t}`} hidden={tabs.tab !== t} className="thin-scroll absolute inset-0 overflow-y-auto overscroll-contain">
      <div className="mx-auto max-w-[720px] space-y-4 p-3 pb-6 sm:p-5">
        {children}
        <div className="pt-2 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">{tr("demoNote", lang)}</div>
      </div>
    </div>
  );

  return (
    <div ref={root} className={tabs.tab === "chat" ? "hidden" : "relative min-h-0"}>
      {/* The one 3D canvas on phones: mounted once the tab is opened, then kept (paused while
          hidden) so switching tabs doesn't replay the build or reset the view. */}
      {visited.includes("sketch") &&
        board.project &&
        pane(
          "sketch",
          <>
            <div data-panel="sketch">
              <BlueprintPanel
                project={board.project.project}
                tenant={tenant}
                lang={lang}
                highlight={highlight}
                onHighlight={onHighlight}
                inline
                sketch={sketch}
                change={board.change}
                ui={ui}
                look={board.quote?.look}
                lite={lite}
                paused={tabs.tab !== "sketch"}
              />
            </div>
            <AnimatePresence>{agentChange && <ChangeCard key={agentChange.id} change={agentChange.change} lang={lang} onClose={() => setDismissed(agentChange.id)} />}</AnimatePresence>
            <ProjectFacts project={board.project.project} lang={lang} />
          </>,
        )}

      {tabs.available.list &&
        pane(
          "list",
          <>
            {board.quote && (
              <div data-panel="list">
                <QuotePanel
                  quote={board.quote.quote}
                  suggestions={board.quote.suggestions}
                  owned={board.quote.owned}
                  lang={lang}
                  highlight={highlight}
                  onHighlight={onHighlight}
                  onQty={onQty}
                  onAdd={onAdd}
                  onMoveStore={onMoveStore}
                  tenant={tenant}
                  projectTitle={board.project?.project.title ?? (lang === "en" ? "Your project" : "Proiectul tău")}
                  tiers={board.quote.tiers}
                  tiersStale={board.quote.tiersStale}
                  quality={board.quote.quality}
                  onTier={onTier}
                  choices={board.quote.choices}
                  onChoose={onChoose}
                  redeemSignal={ui && typeof ui.command.redeemPoints === "boolean" ? { value: ui.command.redeemPoints, seq: ui.seq } : null}
                />
              </div>
            )}
            {board.products && (
              <div data-panel="products">
                <ProductsPanel query={board.products.query} products={board.products.products} lang={lang} onAdd={onAdd} />
              </div>
            )}
          </>,
        )}

      {tabs.available.stores &&
        visited.includes("stores") &&
        pane(
          "stores",
          <>
            {quote && (
              <div data-panel="stock">
                <StockPanel quote={quote} lang={lang} onMoveStore={onMoveStore} />
              </div>
            )}
            <div data-panel="offers">
              <OffersPanel offers={board.offers?.offers} quote={quote} lang={lang} />
            </div>
          </>,
        )}

      {tabs.available.plan &&
        visited.includes("plan") &&
        pane(
          "plan",
          <>
            {board.plan && (
              <div data-panel="plan">
                <PlanPanel plan={board.plan.plan} lang={lang} />
              </div>
            )}
            {weather && board.project && <WeatherPanel lat={weather.lat} lng={weather.lng} city={weather.city} type={board.project.project.type} lang={lang} />}
          </>,
        )}
    </div>
  );
}

/** Under the phone sketch: everything the desktop title block and estimate show. */
function ProjectFacts({ project, lang }: { project: ProjectSnapshot; lang: Lang }) {
  const en = lang === "en";
  const est = project.estimate;
  return (
    <div className="rounded-[22px] border border-rule bg-card p-4">
      <PanelHeader index="01" title={tr("measurements", lang)} />
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
        {project.measurements.map((m) => (
          <div key={m.label} className="min-w-0 border-b border-dashed border-rule pb-1.5">
            <dt className="truncate font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">{m.label}</dt>
            <dd className="num text-[15px] font-semibold text-ink">
              {dec(m.value, lang, m.unit === "buc" || m.unit === "rânduri" ? 0 : 2)} <span className="text-[12px] font-normal text-ink-3">{unitText(m.unit, lang)}</span>
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 grid grid-cols-3 divide-x divide-rule rounded-xl border border-rule">
        <Fact icon={<IconClock size={12} />} k={en ? "Time" : "Timp"} v={`${est.hoursMin}–${est.hoursMax} ${tr("hours", lang)}`} />
        <Fact icon={<IconUsers size={12} />} k={en ? "Crew" : "Echipă"} v={`${est.people} ${tr("people", lang)}`} />
        <Fact
          icon={<IconWarn size={12} />}
          k={tr("difficulty", lang)}
          v={
            <span className="flex gap-0.5 pt-1" aria-label={`${est.difficulty}/5`}>
              {[1, 2, 3, 4, 5].map((i) => (
                <span key={i} className={`h-2.5 w-1.5 ${i <= est.difficulty ? "bg-accent" : "bg-ink/15"}`} />
              ))}
            </span>
          }
        />
      </div>
      {project.assumptions.length > 0 && (
        <div className="mt-4">
          <div className="label mb-1.5">{tr("assumptions", lang)}</div>
          <ul className="space-y-1 text-[13px] leading-snug text-ink-2">
            {project.assumptions.map((a, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-3" />
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Fact({ icon, k, v }: { icon: React.ReactNode; k: string; v: React.ReactNode }) {
  return (
    <div className="min-w-0 px-2.5 py-2">
      <div className="flex items-center gap-1 truncate font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-3">
        {icon}
        {k}
      </div>
      <div className="mt-0.5 truncate font-mono text-[12px] text-ink">{v}</div>
    </div>
  );
}

// ───────────────────────────── icons ─────────────────────────────

type P = SVGProps<SVGSVGElement> & { size?: number };
const svg = (size = 20, p: P) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...p,
});

export const IconChat = ({ size, ...p }: P) => (
  <svg {...svg(size, p)}>
    <path d="M4 5.5h16v10.5H10l-4.5 3.5V16H4z" />
    <path d="M8 9.5h8M8 12.5h5" />
  </svg>
);
export const IconPlanSteps = ({ size, ...p }: P) => (
  <svg {...svg(size, p)}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <path d="M4 5l1 1 2-2M4 11l1 1 2-2" />
    <circle cx="5" cy="18" r="1.3" />
  </svg>
);
export const IconSearch = ({ size, ...p }: P) => (
  <svg {...svg(size, p)}>
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="M15 15l5 5" />
  </svg>
);
