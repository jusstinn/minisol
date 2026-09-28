"use client";

import { motion } from "motion/react";
import type { ChoiceGroup, ProductOptionView } from "@/agent/types";
import type { Lang } from "@/domain/types";
import { compareOptions } from "@/lib/compareOptions";
import { IconCheck, IconClose } from "../ui/icons";
import { ProductArt } from "../ui/ProductArt";

/**
 * "Compară variantele": the option in the list vs another one, side by side — price for this
 * project (with the member's offers), what you'd buy, quality, rating, stock and highlights.
 */
export default function OptionsCompare({
  group,
  current,
  other,
  lang,
  onChoose,
  onClose,
}: {
  group: ChoiceGroup;
  current: ProductOptionView;
  other: ProductOptionView;
  lang: Lang;
  onChoose: (g: ChoiceGroup, o: ProductOptionView) => void;
  onClose: () => void;
}) {
  const en = lang === "en";
  const c = compareOptions(current, other, lang);
  const head = (o: ProductOptionView, mine: boolean) => (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-paper-2">
          <ProductArt art={o.art} size={40} />
        </span>
        <span className={`rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${mine ? "bg-ink text-paper" : "bg-accent/15 text-ink"}`}>
          {mine ? (en ? "In your list" : "În listă") : en ? "Alternative" : "Alternativa"}
        </span>
      </div>
      <div className="mt-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-3">{o.brand}</div>
      <div className="line-clamp-2 text-[12.5px] leading-snug text-ink">{o.name}</div>
    </div>
  );

  return (
    <motion.section
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      aria-label={en ? `Compare: ${current.name} and ${other.name}` : `Comparație: ${current.name} și ${other.name}`}
      className="mt-3 rounded-xl border border-ink/20 bg-card p-3"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="label">{en ? "Compare options" : "Compară variantele"}</div>
          <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2" aria-live="polite">
            {c.summary}
          </p>
        </div>
        <button onClick={onClose} aria-label={en ? "Close the comparison" : "Închide comparația"} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-paper-2 hover:text-ink">
          <IconClose size={13} />
        </button>
      </div>

      <table className="mt-3 w-full table-fixed border-collapse text-left text-[12px]">
        <caption className="sr-only">{en ? `${group.label}: your option and the alternative` : `${group.label}: varianta ta și alternativa`}</caption>
        <thead>
          <tr className="align-top">
            <th scope="col" className="w-[28%] pb-2 font-normal">
              <span className="sr-only">{en ? "Criterion" : "Criteriu"}</span>
            </th>
            <th scope="col" className="pb-2 pr-2 font-normal">
              {head(current, true)}
            </th>
            <th scope="col" className="pb-2 font-normal">
              {head(other, false)}
            </th>
          </tr>
        </thead>
        <tbody>
          {c.rows.map((r) => (
            <tr key={r.key} className="border-t border-dashed border-rule">
              <th scope="row" className="py-1.5 pr-2 align-top font-mono text-[9.5px] font-normal uppercase tracking-[0.1em] text-ink-3">
                {r.label}
              </th>
              {(["a", "b"] as const).map((side) => (
                <td key={side} className={`py-1.5 pr-2 align-top ${r.key === "price" ? "num text-[13px] font-semibold" : ""} ${r.better === side ? "text-ok" : "text-ink"}`}>
                  <span className="inline-flex items-center gap-1">
                    {side === "a" ? r.a : r.b}
                    {r.better === side && (
                      <>
                        <IconCheck size={11} aria-hidden />
                        <span className="sr-only">{en ? "(better)" : "(mai bun)"}</span>
                      </>
                    )}
                  </span>
                </td>
              ))}
            </tr>
          ))}
          <tr className="border-t border-dashed border-rule">
            <th scope="row" className="py-1.5 pr-2 align-top font-mono text-[9.5px] font-normal uppercase tracking-[0.1em] text-ink-3">
              {en ? "Highlights" : "De știut"}
            </th>
            {[current, other].map((o) => (
              <td key={o.key} className="py-1.5 pr-2 align-top">
                <ul className="space-y-0.5 font-mono text-[10px] leading-snug text-ink-2">
                  {o.highlights.slice(0, 3).map((h) => (
                    <li key={h}>· {h}</li>
                  ))}
                </ul>
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => onChoose(group, other)}
          className="flex-1 rounded-lg bg-ink py-2 text-[12.5px] font-semibold text-paper transition hover:bg-accent hover:text-on-accent"
        >
          {en ? "Switch to the alternative" : "Alege alternativa"}
        </button>
        <button onClick={onClose} className="rounded-lg border border-ink/20 px-3 py-2 text-[12.5px] font-semibold text-ink hover:border-ink">
          {en ? "Keep mine" : "Rămân la a mea"}
        </button>
      </div>
    </motion.section>
  );
}
