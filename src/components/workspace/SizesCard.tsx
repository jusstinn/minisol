"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { Card } from "@/agent/types";
import { estimateMessage, PACE_M } from "@/domain/sizes";
import type { Lang } from "@/domain/types";
import { dec } from "@/lib/format";
import { IconMinus, IconPlus, IconRuler } from "../ui/icons";

/**
 * "Don't know your measurements?" — typical sizes to tap, and a pace counter
 * that turns steps into metres. Either choice just sends the project to the chat.
 */
export default function SizesCard({ card, lang, onSend, disabled }: { card: Extract<Card, { kind: "sizes" }>; lang: Lang; onSend: (text: string) => void; disabled?: boolean }) {
  const en = lang === "en";
  const { help } = card;
  const [a, setA] = useState(help.estimator === "length" ? 24 : 6);
  const [b, setB] = useState(4);
  const [tips, setTips] = useState(false);
  const la = Math.round(a * PACE_M * 10) / 10;
  const lb = Math.round(b * PACE_M * 10) / 10;
  const result =
    help.estimator === "length" ? `≈ ${dec(la, lang, 1)} m` : help.estimator === "area" ? `≈ ${Math.round(la * lb)} m²` : `≈ ${dec(la, lang, 1)} × ${dec(lb, lang, 1)} m`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-3 overflow-hidden rounded-2xl border border-rule bg-paper-2/60"
    >
      <div className="flex items-center gap-2 border-b border-rule px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
        <IconRuler size={13} />
        {en ? "Don't know the size? Pick one" : "Nu știi dimensiunile? Alege una"}
      </div>

      <div className="grid gap-2 p-3 sm:grid-cols-3">
        {help.presets.map((p, i) => (
          <motion.button
            key={p.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i }}
            disabled={disabled}
            onClick={() => onSend(p.message)}
            className="group rounded-xl border border-rule bg-paper px-3 py-2.5 text-left transition hover:border-ink disabled:opacity-50"
          >
            <div className="text-[14px] font-semibold leading-tight text-ink">{p.label}</div>
            <div className="mt-0.5 text-[12px] leading-snug text-ink-3">{p.detail}</div>
          </motion.button>
        ))}
      </div>

      <div className="border-t border-dashed border-rule px-4 py-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
          {en ? "Or pace it out" : "Sau măsoară cu pașii"} · {en ? "1 pace" : "1 pas"} ≈ {PACE_M * 100} cm
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Stepper label={help.estimator === "length" ? (en ? "Length" : "Lungime") : en ? "Length" : "Lungime"} value={a} onChange={setA} lang={lang} />
          {help.estimator !== "length" && <Stepper label={en ? "Width" : "Lățime"} value={b} onChange={setB} lang={lang} />}
          <div className="ml-auto flex items-center gap-2">
            <span className="font-mono text-[13px] font-semibold tabular-nums text-ink">{result}</span>
            <button
              disabled={disabled}
              onClick={() => onSend(estimateMessage(card.projectType, lang, la, help.estimator === "length" ? undefined : lb))}
              className="rounded-full bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-on-accent transition hover:brightness-105 disabled:opacity-50"
            >
              {en ? "Use this" : "Folosește"}
            </button>
          </div>
        </div>
      </div>

      <button onClick={() => setTips((x) => !x)} className="w-full border-t border-rule px-4 py-2 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 hover:text-ink">
        {tips ? "−" : "+"} {en ? "How to measure" : "Cum măsor"}
      </button>
      <AnimatePresence initial={false}>
        {tips && (
          <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-1.5 overflow-hidden px-4 pb-3 text-[13px] leading-snug text-ink-2">
            {help.tips.map((t) => (
              <li key={t} className="flex gap-2">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent" />
                {t}
              </li>
            ))}
            <li className="flex gap-2 text-ink-3">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-3" />
              {en ? "Approximate is fine — you can reshape it in the sketch and the list follows." : "E suficientă o estimare — o poți ajusta din schiță, iar lista se recalculează."}
            </li>
          </motion.ul>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Stepper({ label, value, onChange, lang }: { label: string; value: number; onChange: (v: number) => void; lang: Lang }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12.5px] text-ink-3">{label}</span>
      <div className="flex items-center rounded-full border border-rule bg-paper">
        <button onClick={() => onChange(Math.max(1, value - 1))} className="grid h-7 w-7 place-items-center text-ink-3 hover:text-ink" aria-label={`${label}: ${lang === "en" ? "one pace less" : "un pas mai puțin"}`}>
          <IconMinus size={13} />
        </button>
        <span className="w-14 text-center font-mono text-[12.5px] tabular-nums">
          {value} {lang === "en" ? (value === 1 ? "pace" : "paces") : value === 1 ? "pas" : "pași"}
        </span>
        <button onClick={() => onChange(Math.min(200, value + 1))} className="grid h-7 w-7 place-items-center text-ink-3 hover:text-ink" aria-label={`${label}: ${lang === "en" ? "one pace more" : "un pas în plus"}`}>
          <IconPlus size={13} />
        </button>
      </div>
    </div>
  );
}
