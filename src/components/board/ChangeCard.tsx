"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import type { SketchChange } from "@/agent/types";
import type { Lang } from "@/domain/types";
import { dec, lei } from "@/lib/format";
import { IconClose, IconPencil, IconSpark, IconUndo } from "../ui/icons";

/** Counts from one amount to another — the total "re-prices" in front of the customer. */
export function Rolling({ from, to, lang }: { from: number; to: number; lang: Lang }) {
  const [v, setV] = useState(from);
  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    const dur = reduced ? 0 : 900;
    let raf = 0;
    const tick = (now: number) => {
      const t = dur ? Math.min(1, (now - start) / dur) : 1;
      const e = 1 - Math.pow(1 - t, 3);
      setV(from + (to - from) * e);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to]);
  return <>{lei(Math.round(v * 100) / 100, lang)}</>;
}

export const signed = (v: number, lang: Lang) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${lei(Math.abs(v), lang)}`;
const qty = (v: number, lang: Lang) => dec(v, lang, v % 1 === 0 ? 0 : 2);

export default function ChangeCard({
  change,
  lang,
  dark,
  onUndo,
  onClose,
  compact,
}: {
  change: SketchChange;
  lang: Lang;
  dark?: boolean;
  onUndo?: () => void;
  onClose?: () => void;
  compact?: boolean;
}) {
  const en = lang === "en";
  const up = change.delta > 0.004;
  const down = change.delta < -0.004;
  const lines = compact ? change.lines.slice(0, 4) : change.lines;
  const tone = dark ? "text-[#dce9ff]" : "text-ink-2";
  const rule = dark ? "border-[#dce9ff]/20" : "border-ink/10";

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.98 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className={`overflow-hidden rounded-2xl text-[12.5px] shadow-[0_18px_50px_-20px_rgba(0,0,0,0.45)] ring-1 backdrop-blur-md ${
        dark ? "bg-[#071634]/85 text-[#e6efff] ring-[#dce9ff]/25" : "bg-white/92 text-ink ring-ink/10"
      }`}
      role="status"
      aria-live="polite"
    >
      <div className={`flex items-center gap-2 border-b px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.16em] ${rule} ${dark ? "text-[#9fbcf0]" : "text-ink-3"}`}>
        {change.source === "agent" ? <IconSpark size={12} /> : <IconPencil size={12} />}
        <span className="flex-1">
          {en ? "Sketch changed" : "Schiță modificată"} · {change.source === "agent" ? (en ? "by the assistant" : "de asistent") : en ? "by you" : "de tine"}
        </span>
        {onUndo && (
          <button onClick={onUndo} className={`flex items-center gap-1 rounded-full px-2 py-0.5 normal-case tracking-normal transition ${dark ? "hover:bg-[#dce9ff]/10" : "hover:bg-ink/5"}`}>
            <IconUndo size={12} />
            {en ? "Undo" : "Anulează"}
          </button>
        )}
        {onClose && (
          <button onClick={onClose} aria-label={en ? "Close" : "Închide"} className="grid h-5 w-5 place-items-center rounded-full opacity-70 hover:opacity-100">
            <IconClose size={12} />
          </button>
        )}
      </div>

      <ul className="space-y-0.5 px-3.5 pt-2.5">
        {change.edits.map((e, i) => (
          <motion.li key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 + i * 0.07 }} className="flex gap-2 leading-snug">
            <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-[2px] bg-accent" />
            <span>{e}</span>
          </motion.li>
        ))}
      </ul>

      {lines.length > 0 && (
        <div className={`mx-3.5 mt-2.5 border-t pt-2 ${rule}`}>
          {lines.map((l, i) => (
            <motion.div
              key={`${l.role}-${i}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.06 }}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 py-[3px]"
            >
              <span className="min-w-0 truncate" title={l.beforeName ? `${l.beforeName} → ${l.name}` : l.name}>
                {l.label}
              </span>
              <span className={`text-right font-mono text-[11.5px] font-medium tabular-nums ${l.deltaRon > 0 ? "" : l.deltaRon < 0 ? "text-[#2f9e5b]" : tone}`}>
                {signed(l.deltaRon, lang)}
              </span>
              <span className={`col-span-2 -mt-0.5 font-mono text-[10.5px] tabular-nums ${tone} opacity-80`}>
                {l.before === 0 ? (en ? "new" : "nou") : qty(l.before, lang)} → {l.after === 0 ? (en ? "none" : "0") : qty(l.after, lang)} {l.unit}
                {l.beforeName && ` · ${en ? "product swapped" : "produs schimbat"}`}
              </span>
            </motion.div>
          ))}
          {compact && change.lines.length > lines.length && (
            <div className={`py-1 text-[11px] ${tone}`}>
              +{change.lines.length - lines.length} {en ? "more lines in the list" : "alte linii în listă"}
            </div>
          )}
        </div>
      )}

      <div className={`mt-2 flex items-center gap-3 border-t px-3.5 py-2.5 ${rule}`}>
        <div className="min-w-0 flex-1">
          <div className={`font-mono text-[10px] uppercase tracking-[0.14em] ${dark ? "text-[#9fbcf0]" : "text-ink-3"}`}>{en ? "New total" : "Total nou"}</div>
          <div className="display text-[20px] leading-tight tabular-nums">
            <Rolling from={change.totalBefore} to={change.totalAfter} lang={lang} />
          </div>
        </div>
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.35, type: "spring", stiffness: 420, damping: 18 }}
          className={`rounded-full px-3 py-1.5 font-mono text-[13px] font-semibold tabular-nums ${
            up ? "bg-accent text-on-accent" : down ? "bg-[#2f9e5b] text-white" : dark ? "bg-[#dce9ff]/15" : "bg-ink/5"
          }`}
        >
          {signed(change.delta, lang)}
        </motion.div>
      </div>
    </motion.div>
  );
}
