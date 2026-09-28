"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Tenant } from "@/config/tenant";
import type { Lang } from "@/domain/types";
import { tr } from "@/lib/i18n";
import { useAgent } from "@/lib/useAgent";
import { useMediaQuery } from "@/lib/useMediaQuery";
import type { ChatMessage } from "@/lib/useAgent";
import Board from "../board/Board";
import type { MemberSummary } from "../entry/WalletPass";
import { WalletPass } from "../entry/WalletPass";
import CartDrawer from "../cart/CartDrawer";
import { CartActionsContext } from "../cart/cartActions";
import SizesCard from "./SizesCard";
import { ProductSheetProvider, useProductSheet } from "../board/ProductSheet";
import type { UiCommand } from "@/agent/types";
import type { UiSignal } from "@/lib/useAgent";
import { IconArrowUp, IconBag, IconCheck, Logo } from "../ui/icons";
import { MicButton } from "../ui/MicButton";
import { Counter, RevealText, Spinner } from "../ui/primitives";
import CardChips from "./CardChips";
import { NextStepChips, useNextSteps } from "./NextStepChips";
import { ShareButton } from "./ShareSheet";
import type { NextStep } from "@/lib/nextSteps";
import { MobilePanels, MobileTabBar, TAB_OF, useMobileTabs } from "./MobileTabs";
import type { PanelTarget } from "./MobileTabs";
import { UploadsProvider } from "../blueprint/uploads/UploadsContext";

export default function Workspace({
  tenant,
  member,
  lang,
  onLang,
  initialPrompt,
  resume,
  shared,
  onExit,
}: {
  tenant: Tenant;
  member: MemberSummary;
  lang: Lang;
  onLang: (l: Lang) => void;
  initialPrompt: string;
  /** Continue the project saved in this browser instead of starting a new one. */
  resume?: boolean;
  /** Reopen a project sent from another device (share-link token). */
  shared?: string;
  onExit: () => void;
}) {
  const [offline, setOffline] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo"));
  const agent = useAgent({ memberId: member.memberId, tenant: tenant.id, lang, forceScripted: offline, restore: resume });
  const [highlight, setHighlight] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  // "Rezervă pentru ridicare" from the list opens the cart at the pickup step.
  const [reserveSignal, setReserveSignal] = useState(0);
  const cartActions = useMemo(
    () => ({
      reserve: () => {
        setReserveSignal((s) => s + 1);
        setCartOpen(true);
      },
    }),
    [],
  );
  const started = useRef(false);
  const isDesktop = useMediaQuery("(min-width: 1024px)", true);
  // Phones: the board lives in tabs under the conversation (see MobileTabs).
  const tabs = useMobileTabs(agent.board, agent.messages);
  const typing = useRef(false);
  const onTyping = useCallback((t: boolean) => {
    typing.current = t;
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (shared) agent.restoreShared(shared);
    else if (initialPrompt) agent.send(initialPrompt);
  }, [agent, initialPrompt, shared]);

  const quote = agent.board.quote?.quote;
  const project = agent.board.project?.project;
  const chips = useNextSteps(agent.board, agent.messages, lang, tenant);

  /** The assistant asked to show a panel: scroll to it on desktop, open its tab on phones. */
  const showPanel = (target: PanelTarget | null, c: UiCommand) => {
    if (isDesktop) {
      if (!target) return;
      const els = document.querySelectorAll(`[data-panel="${target}"]`);
      els[els.length - 1]?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const to = target ?? (c.replay ? "sketch" : null);
    if (!to) {
      // "Pay with points" changes the list's total.
      if (typeof c.redeemPoints === "boolean") tabs.notify("list");
      return;
    }
    const tab = TAB_OF[to];
    if (!tabs.available[tab]) return;
    // Never pull the customer away from a message they're writing: flag the tab instead.
    if (typing.current) tabs.notify(tab);
    else tabs.select(tab, to);
  };

  return (
    // Product sheets open from the list, options, cart and search results; stock is shown for the quote's store.
    <ProductSheetProvider tenantId={tenant.id} lang={lang} storeId={quote?.storeId ?? member.homeStoreId}>
    {/* The customer's own model / plan, kept on this device per project; AI-read sizes go to the chat (phones: back to Chat). */}
    <UploadsProvider
      tenant={tenant.id}
      memberId={member.memberId}
      project={agent.messages[0]?.id}
      busy={agent.busy}
      offline={offline}
      onSend={(t) => {
        void agent.send(t);
        if (!isDesktop) tabs.select("chat");
      }}
    >
    <CartActionsContext.Provider value={cartActions}>
    <UiBridge ui={agent.ui} onHighlight={setHighlight} onCart={() => setCartOpen(true)} onPanel={showPanel} />
    <div className="flex h-dvh flex-col bg-paper">
      {/* header */}
      <header className="flex items-center gap-2 border-b border-rule bg-paper/90 px-4 py-2.5 backdrop-blur sm:gap-3 sm:px-6">
        <button onClick={onExit} className="flex items-center gap-2" title={tr("newProject", lang)}>
          <Logo className="text-ink" />
          <span className="display text-[17px] leading-none">Blueprint</span>
        </button>
        <span className="hidden font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-3 md:inline">
          / {tenant.name} / {project ? project.title : "…"}
        </span>
        <button
          onClick={() => setOffline((o) => !o)}
          title={agent.mode?.reason ?? ""}
          className="ml-1 flex items-center gap-1.5 rounded-full border border-rule px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-2 transition hover:border-ink"
        >
          <span className={`h-1.5 w-1.5 rounded-full ${offline || agent.mode?.mode === "scripted" ? "bg-accent" : "bg-ok"} ${agent.busy ? "animate-pulse" : ""}`} />
          <span className="hidden sm:inline">{offline || agent.mode?.mode === "scripted" ? (lang === "en" ? "Offline demo" : "Demo offline") : "AI live"}</span>
        </button>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {project && <ShareButton getState={() => agent.state.current} tenant={tenant} lang={lang} />}
          <AnimatePresence>
            {quote && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => setCartOpen(true)}
                className="relative flex items-center gap-2 rounded-full bg-ink py-1.5 pl-2.5 pr-5 text-paper transition hover:bg-accent hover:text-on-accent"
                aria-label={lang === "en" ? "Open cart" : "Deschide coșul"}
              >
                <IconBag size={17} />
                <span className="hidden font-mono text-[12px] md:inline">
                  <Counter value={quote.total} lang={lang} /> lei
                </span>
                <motion.span
                  key={quote.lines.length}
                  initial={{ scale: 1.6 }}
                  animate={{ scale: 1 }}
                  className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 font-mono text-[10px] font-bold text-on-accent"
                >
                  {quote.lines.length}
                </motion.span>
              </motion.button>
            )}
          </AnimatePresence>
          <div className="hidden w-[250px] xl:block">
            <WalletPass member={member} tenant={tenant} lang={lang} compact pointsOverride={member.points} />
          </div>
          <div className="flex items-center rounded-full border border-rule p-0.5 font-mono text-[10.5px]">
            {(["ro", "en"] as const).map((l) => (
              <button key={l} onClick={() => onLang(l)} className={`rounded-full px-2 py-1 uppercase ${lang === l ? "bg-ink text-paper" : "text-ink-2"}`}>
                {l}
              </button>
            ))}
          </div>
          <button
            onClick={onExit}
            className="whitespace-nowrap rounded-full border border-rule px-3 py-1.5 text-[12.5px] font-medium text-ink-2 transition hover:border-ink hover:text-ink"
            aria-label={tr("newProject", lang)}
          >
            <span className="sm:hidden">+</span>
            <span className="hidden sm:inline">{tr("newProject", lang)}</span>
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(360px,440px)_1fr]">
        <Rail
          lang={lang}
          messages={agent.messages}
          busy={agent.busy}
          onSend={agent.send}
          chips={chips}
          hidden={!isDesktop && tabs.tab !== "chat"}
          onTyping={onTyping}
          renderInlineBoard={(m) =>
            // Phones: one-line summaries that open the tab with the full panel.
            isDesktop ? null : <CardChips cards={m.cards} board={agent.board} lang={lang} onOpen={(target) => tabs.select(TAB_OF[target], target)} />
          }
        />
        {!isDesktop && (
          <MobilePanels
            tabs={tabs}
            board={agent.board}
            tenant={tenant}
            lang={lang}
            highlight={highlight}
            onHighlight={setHighlight}
            onQty={agent.changeQty}
            onAdd={agent.addItem}
            onMoveStore={agent.moveStore}
            onTier={agent.applyTier}
            onChoose={agent.chooseOption}
            sketch={agent.sketch}
            ui={agent.ui}
          />
        )}
        {isDesktop && (
        <div className="min-h-0 overflow-y-auto border-l border-rule thin-scroll">
          <Board
            board={agent.board}
            tenant={tenant}
            lang={lang}
            highlight={highlight}
            onHighlight={setHighlight}
            onQty={agent.changeQty}
            onAdd={agent.addItem}
            onMoveStore={agent.moveStore}
            onTier={agent.applyTier}
                onChoose={agent.chooseOption}
                sketch={agent.sketch}
                ui={agent.ui}
          />
        </div>
        )}
      </div>

      {!isDesktop && <MobileTabBar tabs={tabs} board={agent.board} lang={lang} busy={agent.busy} />}
      {quote && (
        <CartDrawer
          open={cartOpen}
          onClose={() => setCartOpen(false)}
          quote={quote}
          lang={lang}
          tenant={tenant}
          projectTitle={project?.title ?? (lang === "en" ? "Your project" : "Proiectul tău")}
          onQty={agent.changeQty}
          onMoveStore={agent.moveStore}
          reserveSignal={reserveSignal}
          redeemSignal={agent.ui && typeof agent.ui.command.redeemPoints === "boolean" ? { value: agent.ui.command.redeemPoints, seq: agent.ui.seq } : null}
          onShowPlan={
            isDesktop
              ? undefined
              : () => {
                  setCartOpen(false);
                  tabs.select(tabs.available.sketch ? "sketch" : "list");
                }
          }
        />
      )}
    </div>
    </CartActionsContext.Provider>
    </UploadsProvider>
    </ProductSheetProvider>
  );
}

function Rail({
  lang,
  messages,
  busy,
  onSend,
  chips,
  renderInlineBoard,
  hidden = false,
  onTyping,
}: {
  lang: Lang;
  messages: ChatMessage[];
  busy: boolean;
  onSend: (t: string) => void;
  /** Context-aware next steps (src/lib/nextSteps.ts). */
  chips: NextStep[];
  renderInlineBoard: (m: ChatMessage) => React.ReactNode;
  /** Phones: another tab is open (the conversation stays mounted, with its draft). */
  hidden?: boolean;
  /** Whether a message is being written (a non-empty draft). */
  onTyping?: (typing: boolean) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const scrolledFor = useRef<ChatMessage[] | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    // While hidden, catch up when the conversation is shown again.
    if (!el || hidden || scrolledFor.current === messages) return;
    scrolledFor.current = messages;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, hidden]);

  const drafting = text.trim().length > 0;
  useEffect(() => {
    onTyping?.(drafting);
  }, [drafting, onTyping]);

  const send = (t: string) => {
    if (!t.trim() || busy) return;
    onSend(t);
    setText("");
  };
  const last = messages[messages.length - 1];

  return (
    <section className={`${hidden ? "hidden" : "flex"} min-h-0 flex-col bg-paper`}>
      {/* AI disclosure (EU AI Act, art. 50): pinned above the conversation so it never scrolls away */}
      <div role="note" className="flex items-start gap-2 border-b border-rule px-4 py-2 sm:px-6">
        <span className="mt-px shrink-0 rounded-[5px] border border-ink/15 px-1 font-mono text-[9px] font-semibold leading-[14px] tracking-[0.12em] text-ink-2">AI</span>
        <p className="font-mono text-[10.5px] leading-[1.45] text-ink-3">{tr("aiNotice", lang)}</p>
      </div>
      <div ref={scrollRef} className="thin-scroll flex-1 space-y-6 overflow-y-auto px-4 pb-6 pt-6 sm:px-6">
        {messages.map((m) =>
          m.role === "user" ? (
            <motion.div key={m.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
              <div className="max-w-[88%] rounded-[18px] rounded-br-md bg-ink px-4 py-2.5 text-[15px] leading-snug text-paper">{m.text}</div>
            </motion.div>
          ) : (
            <div key={m.id} className="space-y-3">
              <ConstructionLog message={m} />
              {m.text && <RevealText text={m.text} className="text-[15.5px] leading-[1.6] text-ink-2" />}
              {m.verified && m.verified.checked > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-ok/30 bg-ok/5 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ok"
                  title={lang === "en" ? "Every amount in this answer was checked against the pricing engine" : "Fiecare sumă din răspuns a fost verificată cu motorul de prețuri"}
                >
                  <IconCheck size={12} />
                  {m.verified.replaced
                    ? lang === "en" ? "Corrected by the pricing engine" : "Corectat de motorul de prețuri"
                    : lang === "en" ? `${m.verified.checked} amounts verified` : `${m.verified.checked} sume verificate`}
                </motion.div>
              )}
              {m.pending && !m.text && m.log.length === 0 && (
                <div className="flex items-center gap-2 font-mono text-[12px] text-ink-3">
                  <Spinner /> {tr("thinking", lang)}…
                </div>
              )}
              {m.error && (
                <div className="rounded-xl border border-bad/30 bg-bad/5 px-3 py-2 text-[13px] text-bad">
                  {tr("error", lang)} <span className="font-mono text-[11px] opacity-70">({m.error})</span>
                </div>
              )}
              {m.cards.map((c) => c.kind === "sizes" && <SizesCard key={c.id} card={c} lang={lang} onSend={onSend} disabled={busy} />)}
              {m.cards.some((c) => c.kind !== "sizes") && renderInlineBoard(m)}
            </div>
          ),
        )}
      </div>

      <div className="border-t border-rule bg-paper px-3 pb-3 pt-2.5 sm:px-5 lg:pb-[max(12px,env(safe-area-inset-bottom))]">
        {chips.length > 0 && !busy && last?.role === "assistant" && <NextStepChips chips={chips} lang={lang} onSend={send} />}
        <div className="flex items-end gap-2 rounded-2xl border border-ink/15 bg-card p-1.5 focus-within:border-ink/40">
          <textarea
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(text);
              }
            }}
            placeholder={tr("placeholderFollow", lang)}
            className="max-h-32 min-h-[42px] flex-1 resize-none bg-transparent px-2.5 py-2.5 text-[15px] text-ink placeholder:text-ink-3"
          />
          <MicButton lang={lang} value={text} onChange={setText} />
          <button
            onClick={() => send(text)}
            disabled={busy || !text.trim()}
            className="grid h-[42px] w-[42px] place-items-center rounded-xl bg-accent text-on-accent transition disabled:bg-paper-3 disabled:text-ink-3"
            aria-label={tr("send", lang)}
          >
            {busy ? <Spinner /> : <IconArrowUp size={19} />}
          </button>
        </div>
      </div>
    </section>
  );
}

function ConstructionLog({ message }: { message: ChatMessage }) {
  if (message.log.length === 0) return null;
  const t0 = message.log[0].at;
  return (
    <div className="rounded-xl border border-rule bg-card/70 px-3 py-2 font-mono text-[11px] leading-[1.9] text-ink-3">
      {message.log.map((l, i) => (
        <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2">
          <span className="w-12 text-ink-3/70">{fmtT(l.at - t0)}</span>
          <span className={l.done ? "text-ok" : "text-accent"}>{l.done ? <IconCheck size={12} /> : <Spinner />}</span>
          <span className={l.done ? "text-ink-2" : "text-ink"}>{l.label}</span>
        </motion.div>
      ))}
      {!message.pending && message.ms ? (
        <div className="mt-0.5 border-t border-dashed border-rule pt-1 text-[10px] uppercase tracking-[0.14em]">Σ {(message.ms / 1000).toFixed(1)} s</div>
      ) : null}
    </div>
  );
}

const fmtT = (ms: number) => {
  const s = ms / 1000;
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}`;
};


/**
 * Carries out the assistant's screen commands that live outside the sketch panel:
 * highlight a material, open the cart, open a product sheet, scroll to a panel.
 */
function UiBridge({
  ui,
  onHighlight,
  onCart,
  onPanel,
}: {
  ui: UiSignal | null;
  onHighlight: (l: string | null) => void;
  onCart: () => void;
  /** Bring a board panel into view (desktop: scroll to it; phones: open its tab). */
  onPanel: (target: PanelTarget | null, c: UiCommand) => void;
}) {
  const sheet = useProductSheet();
  const seq = ui?.seq;
  useEffect(() => {
    if (!ui) return;
    const c = ui.command;
    if (c.highlight !== undefined) onHighlight(c.highlight);
    if (c.panel === "cart" || c.panel === "wallet") onCart();
    if (c.product) sheet?.open(c.product);
    const target = c.panel && c.panel !== "cart" && c.panel !== "wallet" ? c.panel : c.view || c.editor || c.highlight ? "sketch" : null;
    onPanel(target, c);
    // Run once per command.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);
  return null;
}
