"use client";

import { motion } from "motion/react";
import type { OfferView } from "@/agent/types";
import type { Quote } from "@/domain/quote";
import type { Lang } from "@/domain/types";
import { dayMonth, lei } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { PanelHeader } from "../ui/primitives";

/**
 * WalletLoop offers as perforated coupons. Uses the full offer list when the
 * agent fetched it, otherwise shows the discounts applied to the current quote.
 */
export default function OffersPanel({ offers, quote, lang }: { offers?: OfferView[]; quote?: Quote; lang: Lang }) {
  const appliedIds = new Set([...(quote?.discounts.map((d) => d.offerId) ?? [])]);
  const items: (OfferView & { amount?: number })[] = offers
    ? offers.map((o) => ({ ...o, appliesNow: o.appliesNow || appliedIds.has(o.id), amount: quote?.discounts.find((d) => d.offerId === o.id)?.amount }))
    : (quote?.discounts ?? []).map((d) => ({ id: d.offerId, title: d.title, reason: "", validUntil: "", kind: d.kind, appliesNow: true, amount: d.amount }));
  if (items.length === 0) return null;

  return (
    <div className="rounded-[22px] border border-rule bg-card p-4 sm:p-6">
      <PanelHeader index="04" title={tr("offers", lang)} right={<span className="font-mono text-[10px] text-ink-3">WalletLoop</span>} />
      <div className="mt-4 space-y-2.5">
        {items.map((o, i) => (
          <motion.div
            key={o.id}
            initial={{ opacity: 0, x: 20, rotate: 1.5 }}
            animate={{ opacity: 1, x: 0, rotate: 0 }}
            transition={{ delay: i * 0.08, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="relative"
          >
            <div className={`perforated grid grid-cols-[88px_1fr] overflow-hidden rounded-xl ${o.appliesNow ? "bg-ink text-paper" : "bg-paper-2 text-ink"}`}>
              <div className={`flex flex-col items-center justify-center border-r-2 border-dashed px-2 py-3 ${o.appliesNow ? "border-paper/25" : "border-ink/15"}`}>
                <span className={`display-cond text-[26px] leading-none ${o.appliesNow ? "text-accent" : "text-ink"}`}>{badge(o)}</span>
                <span className="mt-1 font-mono text-[9px] uppercase tracking-widest opacity-60">{kindLabel(o.kind, lang)}</span>
              </div>
              <div className={`min-w-0 py-3 pl-4 ${o.appliesNow ? "pr-24" : "pr-4"}`}>
                <div className="text-[13.5px] font-semibold leading-snug">{o.title}</div>
                {o.reason && <div className={`mt-0.5 text-[12px] leading-snug ${o.appliesNow ? "text-paper/70" : "text-ink-2"}`}>{o.reason}</div>}
                <div className={`mt-1 font-mono text-[10px] ${o.appliesNow ? "text-paper/50" : "text-ink-3"}`}>
                  {o.validUntil && `${tr("validUntil", lang)} ${dayMonth(o.validUntil, lang)}`}
                  {o.amount ? ` · −${lei(o.amount, lang)}` : ""}
                </div>
              </div>
            </div>
            {o.appliesNow && (
              <span className="stamp pointer-events-none absolute right-4 top-1/2 -mt-3 rounded border-2 border-accent px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
                {tr("applied", lang)}
              </span>
            )}
          </motion.div>
        ))}
      </div>
      {items.some((o) => o.kind === "percent_category" || o.kind === "percent_role") && (
        // Price-display rules (Omnibus): a percentage is a member discount on today's price; the
        // list shows any reduction against the lowest price of the last 30 days, never more.
        <p className="mt-3 text-[11px] leading-snug text-ink-3">
          {lang === "en"
            ? "Percentages are member discounts on today's price. On your list, reductions are shown against each product's lowest price in the last 30 days."
            : "Procentele sunt reduceri de membru la prețul de azi. În listă, reducerile sunt arătate față de cel mai mic preț al produsului din ultimele 30 de zile."}
        </p>
      )}
    </div>
  );
}

function badge(o: OfferView & { amount?: number }): string {
  const m = o.title.match(/[−-]\s?(\d+)\s?%/) ?? o.title.match(/(\d+)\s?%/);
  if (m) return `−${m[1]}%`;
  const x = o.title.match(/[×x]\s?(\d+)/);
  if (x) return `×${x[1]}`;
  const lei = o.title.match(/(\d[\d.]*)\s?lei/i) ?? o.title.match(/(\d[\d.,]*)\s?RON/i);
  if (lei && o.kind === "fixed_threshold") return `${lei[1]}`;
  if (o.kind === "bundle_free_role") return "1+1";
  return "%";
}

function kindLabel(k: OfferView["kind"], lang: Lang) {
  const ro = { percent_category: "de membru", percent_role: "de membru", fixed_threshold: "lei", bundle_free_role: "cadou", points_multiplier: "puncte" };
  const en = { percent_category: "member", percent_role: "member", fixed_threshold: "RON off", bundle_free_role: "free", points_multiplier: "points" };
  return (lang === "en" ? en : ro)[k];
}
