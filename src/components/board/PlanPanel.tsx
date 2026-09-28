"use client";

import { motion } from "motion/react";
import type { PlanView } from "@/agent/types";
import type { Lang } from "@/domain/types";
import { tr } from "@/lib/i18n";
import { IconCheck, IconWarn } from "../ui/icons";
import { PanelHeader } from "../ui/primitives";

/** Parse "2 h", "1 zi", "30 min", "overnight" → hours (for the Gantt bars). */
function hoursOf(d: string | null): number {
  if (!d) return 1;
  const s = d.toLowerCase().replace(",", ".");
  const n = parseFloat(s.match(/\d+(\.\d+)?/)?.[0] ?? "1");
  if (/min/.test(s)) return n / 60;
  if (/zi|day|zile|days/.test(s)) return n * 8;
  if (/noapte|overnight|night/.test(s)) return 12;
  if (/săpt|week/.test(s)) return n * 40;
  return n;
}

export default function PlanPanel({ plan, lang }: { plan: PlanView; lang: Lang }) {
  const hours = plan.steps.map((s) => hoursOf(s.duration));
  const max = Math.max(...hours, 1);

  return (
    <div className="rounded-[22px] border border-rule bg-card p-4 sm:p-7">
      <PanelHeader index="05" title={tr("plan", lang)} />
      <PlanSource plan={plan} lang={lang} />
      <motion.h3 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="display mt-4 text-[clamp(26px,3vw,40px)] text-ink">
        {plan.title}
      </motion.h3>
      <p className="mt-2 max-w-[70ch] text-[15px] leading-relaxed text-ink-2">{plan.summary}</p>

      <div className="mt-6 grid gap-8 xl:grid-cols-[1.5fr_1fr]">
        <ol className="relative">
          <span className="absolute bottom-3 left-[22px] top-3 w-px bg-rule" />
          {plan.steps.map((s, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-30px" }}
              transition={{ delay: i * 0.06, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className="relative grid grid-cols-[46px_1fr] gap-4 pb-5 last:pb-0"
            >
              <span className="relative z-10 grid h-11 w-11 place-items-center rounded-full border border-ink/15 bg-card font-mono text-[13px] font-semibold text-ink">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="pt-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-[15.5px] font-semibold text-ink">{s.title}</span>
                  {s.duration && <span className="rounded-full bg-paper-2 px-2 py-0.5 font-mono text-[10.5px] text-ink-2">{s.duration}</span>}
                </div>
                <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{s.detail}</p>
                <div className="mt-2 h-1 w-full max-w-[280px] overflow-hidden rounded-full bg-paper-2">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: `${(hours[i] / max) * 100}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.9, delay: 0.2 + i * 0.05 }}
                    className="h-full rounded-full bg-ink"
                  />
                </div>
              </div>
            </motion.li>
          ))}
        </ol>

        <div className="space-y-5">
          {plan.tips.length > 0 && (
            <div>
              <div className="label mb-3">{tr("tips", lang)}</div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                {plan.tips.map((t, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, rotate: 0, y: 10 }}
                    whileInView={{ opacity: 1, rotate: i % 2 ? 0.8 : -0.8, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.1 + i * 0.08, type: "spring", stiffness: 200, damping: 18 }}
                    className="relative rounded-md bg-[#fff3b8] px-4 pb-3.5 pt-5 text-[13.5px] leading-snug text-[#3b3211] shadow-[0_10px_20px_-14px_rgba(60,50,10,0.6)]"
                  >
                    <span className="absolute -top-2 left-1/2 h-4 w-14 -translate-x-1/2 rotate-[-2deg] bg-white/60 shadow-sm" />
                    {t}
                  </motion.div>
                ))}
              </div>
            </div>
          )}
          {plan.aiTips && plan.aiTips.length > 0 && (
            <div className="rounded-xl border border-dashed border-ink/20 px-4 py-3">
              <div className="mb-2 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-3">
                <span className="rounded-[4px] border border-ink/20 px-1 text-[9.5px]">AI</span>
                {lang === "en" ? "Personalised tips" : "Sfaturi personalizate"}
              </div>
              <ul className="space-y-1.5 text-[13px] leading-snug text-ink-2">
                {plan.aiTips.map((t, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {plan.safetyWarnings.length > 0 && (
            <div className="hazard rounded-xl p-[5px]">
              <div className="rounded-lg bg-card px-4 py-3">
                <div className="mb-2 flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-ink">
                  <IconWarn size={15} /> {tr("safety", lang)}
                </div>
                <ul className="space-y-1.5 text-[13px] leading-snug text-ink-2">
                  {plan.safetyWarnings.map((w, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink" />
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Where the steps come from: the retailer's approved plan, a standard template, or the AI. */
function PlanSource({ plan, lang }: { plan: PlanView; lang: Lang }) {
  const en = lang === "en";
  if (plan.source === "template") {
    return (
      <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-ok/10 px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ok">
        <IconCheck size={12} />
        {plan.approvedBy ? (en ? `Plan approved by ${plan.approvedBy}` : `Plan aprobat de ${plan.approvedBy}`) : en ? "Standard plan" : "Plan standard"}
      </div>
    );
  }
  return (
    <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-paper-2 px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-3" title={en ? "Always follow the manufacturer's instructions for each product." : "Urmează întotdeauna instrucțiunile producătorului pentru fiecare produs."}>
      <span className="rounded-[4px] border border-ink/20 px-1 text-[9.5px]">AI</span>
      {en ? "Written by AI for your project · indicative" : "Scris de AI pentru proiectul tău · orientativ"}
    </div>
  );
}
