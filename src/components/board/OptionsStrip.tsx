"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { ChoiceGroup, ProductOptionView } from "@/agent/types";
import type { QuoteLine } from "@/domain/quote";
import type { Lang } from "@/domain/types";
import { lei } from "@/lib/format";
import { IconCheck } from "../ui/icons";
import { ProductArt } from "../ui/ProductArt";
import { ProductName, ProductThumb } from "./ProductSheet";
import OptionsCompare from "./OptionsCompare";

const QUALITY = {
  budget: { ro: "Economic", en: "Budget", cls: "bg-paper-2 text-ink-2" },
  standard: { ro: "Standard", en: "Standard", cls: "bg-ink text-paper" },
  premium: { ro: "Premium", en: "Premium", cls: "bg-[#c9a24a] text-ink" },
} as const;

/** Is this option what the basket currently holds for the role? */
export function isCurrentOption(o: ProductOptionView, lines: QuoteLine[], role: string): boolean {
  const skus = new Set(lines.filter((l) => l.role === role).map((l) => l.sku));
  return o.items.every((it) => skus.has(it.sku));
}

/**
 * Horizontal strip of every product that can do this job, each already sized for
 * the customer's project, with the price difference against the current choice.
 */
export default function OptionsStrip({
  group,
  lines,
  lang,
  onChoose,
}: {
  group: ChoiceGroup;
  lines: QuoteLine[];
  lang: Lang;
  onChoose: (g: ChoiceGroup, o: ProductOptionView) => void;
}) {
  const current = group.options.find((o) => isCurrentOption(o, lines, group.role));
  const currentTotal = current?.total ?? lines.filter((l) => l.role === group.role).reduce((s, l) => s + l.netTotal, 0);
  const cheapest = Math.min(...group.options.map((o) => o.total));
  // "Compară": the option in the list side by side with another one.
  const [compareKey, setCompareKey] = useState<string | null>(null);
  const comparing = current && group.options.find((o) => o.key === compareKey && o.key !== current.key);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="overflow-hidden"
    >
      <div className="mb-3 mt-1 rounded-2xl border border-rule bg-paper p-3">
        <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
          <div className="text-[12.5px] text-ink-2">
            <b className="text-ink">{group.label}</b> · {lang === "en" ? "sized for your project" : "calculat pentru proiectul tău"} ({group.basis})
          </div>
          <div className="hidden font-mono text-[10px] text-ink-3 sm:block">{lang === "en" ? "your price, incl. offers" : "prețul tău, cu oferte"}</div>
        </div>
        {/* minmax(0,1fr): the scrolling row must not widen the list (and the whole board) to its content. */}
        <div className="grid grid-cols-[minmax(0,1fr)]">
        <div className="thin-scroll -mx-1 flex snap-x gap-2.5 overflow-x-auto px-1 pb-1">
          {group.options.map((o, i) => {
            const active = current?.key === o.key;
            const delta = Math.round((o.total - currentTotal) * 100) / 100;
            return (
              <motion.div
                key={o.key}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className={`relative flex w-[208px] shrink-0 snap-start flex-col rounded-xl border bg-card p-3 transition ${
                  active ? "border-ink shadow-[0_0_0_1px_var(--ink)]" : "border-rule hover:border-ink/40"
                }`}
              >
                <div className="flex items-start justify-between">
                  <ProductThumb sku={o.sku} context={{ packLabel: o.packLabel, basis: group.basis }} className="grid h-[76px] w-[76px] place-items-center rounded-lg bg-paper-2">
                    <ProductArt art={o.art} size={70} />
                  </ProductThumb>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${QUALITY[o.quality].cls}`}>{QUALITY[o.quality][lang]}</span>
                    {o.total === cheapest && !active && (
                      <span className="rounded-full bg-ok/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-ok">{lang === "en" ? "Cheapest" : "Cel mai ieftin"}</span>
                    )}
                  </div>
                </div>
                <div className="mt-2 font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-3">{o.brand}</div>
                <ProductName sku={o.sku} context={{ packLabel: o.packLabel, basis: group.basis }} className="line-clamp-2 min-h-[2.6em] text-[12.5px] leading-snug text-ink">
                  {o.name}
                </ProductName>
                <div className="mt-1 space-y-0.5 font-mono text-[9.5px] text-ink-3">
                  {o.highlights.slice(0, 2).map((h) => (
                    <div key={h} className="truncate">
                      {h}
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <span key={s} className={`h-1 flex-1 rounded-full ${s <= Math.round(o.rating) ? "bg-ink/70" : "bg-paper-3"}`} />
                  ))}
                  <span className="ml-1 font-mono text-[9.5px] text-ink-3">{o.rating.toFixed(1)}</span>
                </div>
                <div className="mt-auto pt-3">
                  <div className="font-mono text-[10px] text-ink-2">{o.packLabel}</div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="display-cond text-[20px] leading-tight text-ink">{lei(o.total, lang)}</span>
                    {!active && Math.abs(delta) >= 0.01 && (
                      <span className={`num font-mono text-[11px] font-semibold ${delta < 0 ? "text-ok" : "text-bad"}`}>
                        {delta < 0 ? "−" : "+"}
                        {lei(Math.abs(delta), lang)}
                      </span>
                    )}
                  </div>
                  <div className={`mt-0.5 flex items-center gap-1 font-mono text-[9.5px] ${o.inStock ? "text-ok" : "text-warn"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${o.inStock ? "bg-ok" : "bg-warn"}`} />
                    {o.inStock ? (lang === "en" ? "In stock at your store" : "Pe stoc în magazinul tău") : lang === "en" ? "Not enough at your store" : "Stoc insuficient în magazin"}
                  </div>
                  {!active && current && (
                    <button
                      onClick={() => setCompareKey(compareKey === o.key ? null : o.key)}
                      aria-pressed={compareKey === o.key}
                      aria-label={`${lang === "en" ? "Compare with yours" : "Compară cu ce ai"}: ${o.name}`}
                      className={`mt-2 w-full rounded-lg py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition ${
                        compareKey === o.key ? "bg-accent/15 text-ink" : "text-ink-2 hover:bg-paper-2 hover:text-ink"
                      }`}
                    >
                      ⇆ {lang === "en" ? "Compare" : "Compară"}
                    </button>
                  )}
                  <button
                    onClick={() => !active && onChoose(group, o)}
                    disabled={active}
                    className={`mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-[12.5px] font-semibold transition ${
                      active ? "bg-ink text-paper" : "border border-ink/20 text-ink hover:border-ink hover:bg-ink hover:text-paper"
                    }`}
                  >
                    {active ? (
                      <>
                        <IconCheck size={14} /> {lang === "en" ? "In your list" : "În listă"}
                      </>
                    ) : lang === "en" ? (
                      "Choose this"
                    ) : (
                      "Alege"
                    )}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
        </div>
        <AnimatePresence>
          {comparing && current && (
            <OptionsCompare
              key={comparing.key}
              group={group}
              current={current}
              other={comparing}
              lang={lang}
              onChoose={(g, o) => {
                setCompareKey(null);
                onChoose(g, o);
              }}
              onClose={() => setCompareKey(null)}
            />
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
