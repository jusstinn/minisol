"use client";

import { motion } from "motion/react";
import type { Card } from "@/agent/types";
import type { Lang } from "@/domain/types";
import { int, lei } from "@/lib/format";
import { track } from "@/lib/track";
import { IconCheck, IconWallet } from "../ui/icons";

const QUALITY: Record<string, { ro: string; en: string }> = {
  budget: { ro: "economică", en: "budget" },
  standard: { ro: "standard", en: "standard" },
  premium: { ro: "premium", en: "premium" },
};

/**
 * "Am un buget de 3.000 lei": what the pricing engine found, as a meter against the budget,
 * with one button that applies it (it sends the message, so the chat records it too).
 */
export default function BudgetCard({ card, lang, onSend, disabled }: { card: Extract<Card, { kind: "budget" }>; lang: Lang; onSend: (text: string) => void; disabled?: boolean }) {
  const en = lang === "en";
  const b = card.budget;
  const q = b.quality ? QUALITY[b.quality][lang] : "";
  const over = b.fit === "over";
  const fill = Math.min(1, b.total / b.amount);

  const headline =
    b.fit === "fits"
      ? en ? "Your list already fits" : "Lista ta încape deja"
      : b.fit === "tier"
        ? en ? `The same project, ${q} range` : `Același proiect, varianta ${q}`
        : b.fit === "lean"
          ? en ? "The budget range, essentials only" : "Varianta economică, doar strictul necesar"
          : b.fit === "smaller"
            ? b.stage
              ? en ? `A first stage: ${b.size}` : `O primă etapă: ${b.size}`
              : en ? `A smaller version: ${b.size}` : `O variantă mai mică: ${b.size}`
            : en ? "Even the leanest version is over" : "Nici varianta cea mai economică nu încape";
  const detail =
    b.fit === "fits"
      ? en ? `${lei(b.amount - b.total, lang)} left over.` : `Îți mai rămân ${lei(b.amount - b.total, lang)}.`
      : b.fit === "tier"
        ? en ? "Same sketch, cheaper products for each job." : "Aceeași schiță, produse mai ieftine pentru fiecare lucrare."
        : b.fit === "lean"
          ? en ? "Same sketch; the optional extras stay as suggestions." : "Aceeași schiță; extra-urile opționale rămân sugestii."
          : b.fit === "smaller"
            ? b.stage
              ? en ? "Budget range, essentials only. The rest of the fence can follow later." : "Varianta economică, doar strictul necesar. Restul gardului poate urma mai târziu."
              : en ? "Budget range, essentials only, same proportions." : "Varianta economică, doar strictul necesar, aceleași proporții."
            : en ? `${lei(b.total - b.amount, lang)} over. It could be done in stages, or saved on single items.` : `Depășește cu ${lei(b.total - b.amount, lang)}. Se poate face în etape sau economisi la produse.`;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-3 overflow-hidden rounded-2xl border border-rule bg-paper-2/60">
      <div className="flex items-center gap-2 border-b border-rule px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
        <IconWallet size={13} />
        {en ? "Your budget" : "Bugetul tău"} · {int(b.amount, lang)} lei
      </div>
      <div className="px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-[14.5px] font-semibold leading-tight text-ink">{headline}</div>
          <div className={`shrink-0 font-mono text-[14px] font-semibold tabular-nums ${over ? "text-bad" : "text-ink"}`}>{lei(b.total, lang)}</div>
        </div>
        <div className="mt-1 text-[12.5px] leading-snug text-ink-3">{detail}</div>

        {/* The total against the budget; past the line when even the leanest version doesn't fit. */}
        <div className="relative mt-3 h-2 rounded-full bg-rule/60" role="img" aria-label={`${lei(b.total, lang)} / ${lei(b.amount, lang)}`}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(over ? 1 : fill) * 100}%` }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className={`h-full rounded-full ${over ? "bg-bad" : "bg-[#2f9e5b]"}`}
          />
          {b.fit !== "fits" && b.current > b.amount && (
            <span className="absolute -top-0.5 right-0 h-3 w-px bg-ink" />
          )}
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
          <span>{b.fit === "fits" ? (en ? "Your list" : "Lista ta") : en ? `Was ${lei(b.current, lang)}` : `Era ${lei(b.current, lang)}`}</span>
          <span>{en ? "Budget" : "Buget"}</span>
        </div>

        {(b.applyText || b.applied) && (
          <div className="mt-3 flex justify-end">
            {b.applied ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#2f9e5b]/40 px-3 py-1.5 text-[12.5px] font-semibold text-[#2f9e5b]">
                <IconCheck size={13} />
                {en ? "Applied to the sketch and the list" : "Aplicat pe schiță și în listă"}
              </span>
            ) : (
              <button
                disabled={disabled}
                onClick={() => {
                  track("budget_fit", { fit: b.fit, applied: true });
                  onSend(b.applyText!);
                }}
                className="rounded-full bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-on-accent transition hover:brightness-105 disabled:opacity-50"
              >
                {en ? "Apply" : "Aplică"}
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
