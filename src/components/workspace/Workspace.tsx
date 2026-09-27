"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Tenant } from "@/config/tenant";
import type { Lang } from "@/domain/types";
import { tr } from "@/lib/i18n";
import { useAgent } from "@/lib/useAgent";
import { useMediaQuery } from "@/lib/useMediaQuery";
import type { ChatMessage } from "@/lib/useAgent";
import Board from "../board/Board";
import type { MemberSummary } from "../entry/WalletPass";
import { WalletPass } from "../entry/WalletPass";
import { IconArrowUp, IconCheck, IconClose, IconLayers, Logo } from "../ui/icons";
import { MicButton } from "../ui/MicButton";
import { Counter, RevealText, Spinner } from "../ui/primitives";

export default function Workspace({
  tenant,
  member,
  lang,
  onLang,
  initialPrompt,
  onExit,
}: {
  tenant: Tenant;
  member: MemberSummary;
  lang: Lang;
  onLang: (l: Lang) => void;
  initialPrompt: string;
  onExit: () => void;
}) {
  const [offline, setOffline] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo"));
  const agent = useAgent({ memberId: member.memberId, tenant: tenant.id, lang, forceScripted: offline });
  const [highlight, setHighlight] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const started = useRef(false);
  const isDesktop = useMediaQuery("(min-width: 1024px)", true);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    agent.send(initialPrompt);
  }, [agent, initialPrompt]);

  const quote = agent.board.quote?.quote;
  const project = agent.board.project?.project;

  return (
    <div className="flex h-dvh flex-col bg-paper">
      {/* header */}
      <header className="flex items-center gap-3 border-b border-rule bg-paper/90 px-4 py-2.5 backdrop-blur sm:px-6">
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
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden w-[250px] sm:block">
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
          hasQuote={Boolean(quote)}
          renderInlineBoard={(m) =>
            isDesktop ? null : (
              <Board
                board={agent.board}
                onlyCards={m.cards}
                tenant={tenant}
                lang={lang}
                highlight={highlight}
                onHighlight={setHighlight}
                onQty={agent.setQty}
                onAdd={agent.addItem}
                onMoveStore={agent.moveStore}
                inline
              />
            )
          }
        />
        {isDesktop && (
        <div className="min-h-0 overflow-y-auto border-l border-rule thin-scroll">
          <Board
            board={agent.board}
            tenant={tenant}
            lang={lang}
            highlight={highlight}
            onHighlight={setHighlight}
            onQty={agent.setQty}
            onAdd={agent.addItem}
            onMoveStore={agent.moveStore}
          />
        </div>
        )}
      </div>

      {/* mobile total bar */}
      <AnimatePresence>
        {quote && !isDesktop && (
          <motion.button
            initial={{ y: 80 }}
            animate={{ y: 0 }}
            exit={{ y: 80 }}
            onClick={() => setSheetOpen(true)}
            className="fixed inset-x-3 bottom-[86px] z-30 flex items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-paper shadow-2xl lg:hidden"
          >
            <IconLayers size={18} />
            <div className="text-left">
              <div className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-paper/60">{tr("total", lang)}</div>
              <div className="display-cond text-[20px] leading-none">
                <Counter value={quote.total} lang={lang} /> lei
              </div>
            </div>
            <div className="ml-auto text-right font-mono text-[10.5px] text-accent">+{quote.points.earned.toLocaleString(lang === "en" ? "en-GB" : "ro-RO")} pts</div>
          </motion.button>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {sheetOpen && !isDesktop && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 32 }}
            className="fixed inset-0 z-40 overflow-y-auto bg-paper lg:hidden"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-rule bg-paper/95 px-4 py-3 backdrop-blur">
              <span className="font-mono text-[11px] uppercase tracking-[0.14em]">{project?.title ?? "Blueprint"}</span>
              <button onClick={() => setSheetOpen(false)} className="grid h-9 w-9 place-items-center rounded-full border border-rule">
                <IconClose size={18} />
              </button>
            </div>
            <Board
              board={agent.board}
              tenant={tenant}
              lang={lang}
              highlight={highlight}
              onHighlight={setHighlight}
              onQty={agent.setQty}
              onAdd={agent.addItem}
              onMoveStore={agent.moveStore}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Rail({
  lang,
  messages,
  busy,
  onSend,
  hasQuote,
  renderInlineBoard,
}: {
  lang: Lang;
  messages: ChatMessage[];
  busy: boolean;
  onSend: (t: string) => void;
  hasQuote: boolean;
  renderInlineBoard: (m: ChatMessage) => React.ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = (t: string) => {
    if (!t.trim() || busy) return;
    onSend(t);
    setText("");
  };
  const last = messages[messages.length - 1];

  return (
    <section className="flex min-h-0 flex-col bg-paper">
      <div ref={scrollRef} className="thin-scroll flex-1 space-y-6 overflow-y-auto px-4 pb-40 pt-6 sm:px-6 lg:pb-6">
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
              {m.cards.length > 0 && renderInlineBoard(m)}
            </div>
          ),
        )}
      </div>

      <div className="border-t border-rule bg-paper px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2.5 sm:px-5">
        {hasQuote && !busy && last?.role === "assistant" && (
          <div className="thin-scroll -mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {tr("quick", lang).map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                className="shrink-0 rounded-full border border-ink/15 bg-card px-3 py-1.5 text-[12.5px] text-ink-2 transition hover:border-ink hover:text-ink"
              >
                {q}
              </button>
            ))}
          </div>
        )}
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

