"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { OwnedToolView, SuggestionView } from "@/agent/types";
import type { BasketItem, Quote, QuoteLine } from "@/domain/quote";
import type { CategoryId, Lang } from "@/domain/types";
import { int, lei, monthYear } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { IconCheck, IconMinus, IconPlus, IconSpark, IconTag, IconWallet } from "../ui/icons";
import { Counter, PanelHeader } from "../ui/primitives";

export const CATEGORY_LABEL: Record<CategoryId, { ro: string; en: string }> = {
  paint: { ro: "Vopsele", en: "Paint" },
  flooring: { ro: "Pardoseli", en: "Flooring" },
  tiles: { ro: "Gresie & faianță", en: "Tiles" },
  building: { ro: "Materiale construcții", en: "Building" },
  drywall: { ro: "Gips-carton", en: "Drywall" },
  insulation: { ro: "Izolații", en: "Insulation" },
  wood: { ro: "Lemn", en: "Timber" },
  garden: { ro: "Grădină", en: "Garden" },
  fencing: { ro: "Garduri", en: "Fencing" },
  tools: { ro: "Scule de mână", en: "Hand tools" },
  power_tools: { ro: "Scule electrice", en: "Power tools" },
  fasteners: { ro: "Feronerie", en: "Fixings" },
  adhesives: { ro: "Adezivi", en: "Adhesives" },
  safety: { ro: "Protecție", en: "Safety" },
  electrical: { ro: "Electrice", en: "Electrical" },
  plumbing: { ro: "Instalații", en: "Plumbing" },
  bathroom: { ro: "Baie", en: "Bathroom" },
};
const SEG_COLORS = ["var(--accent)", "#141311", "#45423b", "#8a857a", "#b9b3a6", "#d6d0c3", "#e6e1d6"];

export default function QuotePanel({
  quote,
  suggestions,
  owned,
  lang,
  highlight,
  onHighlight,
  onQty,
  onAdd,
  onMoveStore,
}: {
  quote: Quote;
  suggestions: SuggestionView[];
  owned: OwnedToolView[];
  lang: Lang;
  highlight: string | null;
  onHighlight: (l: string | null) => void;
  onQty: (sku: string, qty: number) => void;
  onAdd: (item: BasketItem) => void;
  onMoveStore: (storeId: string) => void;
}) {
  const [redeem, setRedeem] = useState(false);
  const [sent, setSent] = useState<null | "wallet" | "reserve">(null);
  const materials = quote.lines.filter((l) => !l.isTool);
  const tools = quote.lines.filter((l) => l.isTool);
  const total = redeem ? quote.points.totalIfRedeemed : quote.total;
  const best = quote.availability.alternatives.find((a) => a.allInStock);

  return (
    <div className="rounded-[22px] border border-rule bg-card p-4 shadow-[0_1px_0_rgba(255,255,255,0.8)_inset,0_24px_48px_-36px_rgba(20,19,17,0.45)] sm:p-6">
      <PanelHeader
        index="02"
        title={tr("shoppingList", lang)}
        right={<span className="font-mono text-[10.5px] text-ink-3">{quote.lines.length} {tr("products", lang)}</span>}
      />

      {/* totals */}
      <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_auto]">
        <div>
          <div className="label">{tr("total", lang)}</div>
          <div className="flex items-baseline gap-2">
            <span className="display text-[clamp(44px,5.6vw,72px)] leading-none text-ink">
              <Counter value={total} lang={lang} />
            </span>
            <span className="display-cond text-[22px] text-ink-3">lei</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
            {quote.discountTotal > 0 && (
              <>
                <span className="num text-ink-3 line-through decoration-accent/70">{lei(quote.subtotal, lang)}</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 font-mono text-[11px] font-semibold text-on-accent">
                  <IconTag size={12} /> {tr("youSave", lang)} {lei(quote.discountTotal + (redeem ? quote.points.redeemableValue : 0), lang)}
                </span>
              </>
            )}
            <span className="font-mono text-[11px] text-ink-3">· {quote.storeName}</span>
          </div>
        </div>
        <div className="flex flex-col justify-between gap-3 rounded-2xl bg-ink p-4 text-paper sm:min-w-[210px]">
          <div>
            <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-paper/60">{tr("earn", lang)}</div>
            <div className="display-cond text-[34px] leading-none text-accent">
              +<Counter value={quote.points.earned} lang={lang} decimals={0} />
            </div>
            <div className="mt-1 font-mono text-[10px] text-paper/60">
              {tr("points", lang)} · ×{quote.points.tierMultiplier} tier
              {quote.points.bonusNotes.length > 0 && <span className="text-accent"> · bonus</span>}
            </div>
          </div>
          {quote.points.redeemablePoints > 0 && (
            <button onClick={() => setRedeem((r) => !r)} className="flex items-center gap-2 text-left text-[12px] leading-tight">
              <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${redeem ? "bg-accent" : "bg-paper/20"}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-paper transition-all ${redeem ? "left-[18px]" : "left-0.5"}`} />
              </span>
              <span>
                {tr("redeem", lang)}
                <span className="block font-mono text-[10px] text-paper/60">
                  {int(quote.points.redeemablePoints, lang)} → −{lei(quote.points.redeemableValue, lang)}
                </span>
              </span>
            </button>
          )}
        </div>
      </div>

      {/* category bar */}
      <div className="mt-6">
        <div className="label mb-2">{tr("byCategory", lang)}</div>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-paper-2">
          {quote.categoryBreakdown.map((c, i) => (
            <motion.div
              key={c.category}
              initial={{ width: 0 }}
              animate={{ width: `${(c.amount / Math.max(1, quote.total + quote.discountTotal)) * 100}%` }}
              transition={{ duration: 1, delay: 0.1 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              style={{ background: SEG_COLORS[i % SEG_COLORS.length] }}
              className="h-full border-r border-card last:border-r-0"
            />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {quote.categoryBreakdown.filter((c) => c.amount >= 1).map((c, i) => (
            <span key={c.category} className="flex items-center gap-1.5 font-mono text-[10.5px] text-ink-2">
              <span className="h-2 w-2 rounded-full" style={{ background: SEG_COLORS[i % SEG_COLORS.length] }} />
              {CATEGORY_LABEL[c.category]?.[lang] ?? c.category} <span className="text-ink-3">{int(c.amount, lang)}</span>
            </span>
          ))}
        </div>
      </div>

      {/* hints */}
      {quote.hints.length > 0 && (
        <div className="mt-5 space-y-1.5">
          {quote.hints.map((h) => (
            <div key={h.offerId} className="flex items-center gap-2 rounded-xl border border-dashed border-accent/60 bg-accent/5 px-3 py-2 text-[12.5px] text-ink-2">
              <IconSpark size={15} className="shrink-0 text-accent" />
              {h.kind === "threshold_close"
                ? lang === "en"
                  ? `Add ${lei(h.amountToGo ?? 0, lang)} more → ${h.title}`
                  : `Mai adaugi ${lei(h.amountToGo ?? 0, lang)} → ${h.title}`
                : h.title}
            </div>
          ))}
        </div>
      )}

      {/* lines */}
      <LineGroup title={lang === "en" ? "Materials" : "Materiale"} lines={materials} lang={lang} highlight={highlight} onHighlight={onHighlight} onQty={onQty} />
      {tools.length > 0 && <LineGroup title={lang === "en" ? "Tools & protection" : "Scule & protecție"} lines={tools} lang={lang} highlight={highlight} onHighlight={onHighlight} onQty={onQty} />}

      {/* owned */}
      {owned.length > 0 && (
        <div className="mt-6">
          <div className="label mb-2">{tr("alreadyOwn", lang)}</div>
          <div className="flex flex-wrap gap-2">
            {owned.map((o) => (
              <motion.div
                key={o.roleLabel}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2 rounded-xl border border-ok/30 bg-ok/5 px-3 py-1.5"
              >
                <span className="grid h-5 w-5 place-items-center rounded-full bg-ok text-white">
                  <IconCheck size={12} />
                </span>
                <div className="leading-tight">
                  <div className="text-[12.5px] text-ink line-through decoration-ok/60">{o.roleLabel}</div>
                  <div className="font-mono text-[10px] text-ink-3">
                    {o.productName.split(",")[0]} · {monthYear(o.date, lang)}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* suggestions */}
      {suggestions.length > 0 && (
        <div className="mt-6">
          <div className="label mb-2">{tr("suggestions", lang)}</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <AnimatePresence>
              {suggestions.map((s) => (
                <motion.button
                  layout
                  key={s.sku}
                  exit={{ opacity: 0, scale: 0.9 }}
                  onClick={() => onAdd({ sku: s.sku, qty: s.qty, basis: s.basis, isTool: s.isTool })}
                  className="group flex items-center gap-3 rounded-xl border border-dashed border-ink/20 px-3 py-2 text-left transition hover:border-ink hover:bg-paper"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-paper-2 transition group-hover:bg-accent group-hover:text-on-accent">
                    <IconPlus size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 text-[13px] text-ink">{s.qty > 1 ? `${s.qty}× ` : ""}{s.name}</span>
                    <span className="line-clamp-1 font-mono text-[10px] text-ink-3">{s.basis}</span>
                  </span>
                  <span className="num shrink-0 text-[13px] font-semibold">{lei(s.total, lang)}</span>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* stock summary + actions */}
      <div className="mt-6 flex flex-col gap-3 border-t border-rule pt-5 sm:flex-row sm:items-center">
        <div className="flex-1 text-[13px] leading-snug">
          {quote.availability.allInStock ? (
            <span className="flex items-center gap-2 text-ok">
              <span className="h-2 w-2 rounded-full bg-ok" /> {tr("allInStockAt", lang)} <b className="text-ink">{quote.storeName}</b>
            </span>
          ) : (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-2">
              <span className="h-2 w-2 rounded-full bg-warn" />
              {tr("missingAt", lang)} {quote.storeName}: {quote.availability.missing.map((m) => m.name.split(" ").slice(0, 3).join(" ")).join(", ")}
              {best && (
                <button onClick={() => onMoveStore(best.storeId)} className="rounded-full bg-ink px-2.5 py-0.5 font-mono text-[10.5px] uppercase tracking-wider text-paper hover:bg-accent hover:text-on-accent">
                  {tr("moveTo", lang)} {best.name.split(" ").slice(1).join(" ")} · {best.distanceKm} km
                </button>
              )}
            </span>
          )}
          <span className="mt-1 block font-mono text-[10.5px] text-ink-3">
            {tr("delivery", lang)} {quote.delivery.type === "truck" ? tr("truck", lang) : tr("courier", lang)}:{" "}
            {quote.delivery.fee === 0 ? tr("free", lang) : lei(quote.delivery.fee, lang)}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setSent("reserve")}
            className="rounded-xl border border-ink/20 px-3.5 py-2.5 text-[13px] font-semibold text-ink transition hover:border-ink"
          >
            {sent === "reserve" ? "✓ " : ""}
            {tr("reserve", lang)}
          </button>
          <button
            onClick={() => setSent("wallet")}
            className="flex items-center gap-2 rounded-xl bg-accent px-3.5 py-2.5 text-[13px] font-semibold text-on-accent transition hover:brightness-95"
          >
            <IconWallet size={16} />
            {sent === "wallet" ? "✓ " : ""}
            {tr("sendToWallet", lang)}
          </button>
        </div>
      </div>
      <AnimatePresence>{sent && <SentToast kind={sent} lang={lang} storeName={quote.storeName} onDone={() => setSent(null)} />}</AnimatePresence>
    </div>
  );
}

function LineGroup({
  title,
  lines,
  lang,
  highlight,
  onHighlight,
  onQty,
}: {
  title: string;
  lines: QuoteLine[];
  lang: Lang;
  highlight: string | null;
  onHighlight: (l: string | null) => void;
  onQty: (sku: string, qty: number) => void;
}) {
  return (
    <div className="mt-6">
      <div className="label mb-1">{title}</div>
      <ul className="divide-y divide-rule">
        {lines.map((l, i) => (
          <motion.li
            key={l.sku}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.045, 0.6), duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            onMouseEnter={() => l.role && onHighlight(l.role)}
            onMouseLeave={() => onHighlight(null)}
            className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg py-2.5 transition-colors ${highlight && highlight === l.role ? "bg-accent/10" : ""}`}
          >
            <div className="flex items-center rounded-lg border border-rule bg-paper">
              <button onClick={() => onQty(l.sku, l.qty - 1)} className="grid h-7 w-6 place-items-center text-ink-3 hover:text-ink" aria-label="−">
                <IconMinus size={13} />
              </button>
              <span className="num w-7 text-center text-[13px] font-semibold">{l.qty}</span>
              <button onClick={() => onQty(l.sku, l.qty + 1)} className="grid h-7 w-6 place-items-center text-ink-3 hover:text-ink" aria-label="+">
                <IconPlus size={13} />
              </button>
            </div>
            <div className="min-w-0">
              <div className="line-clamp-2 text-[13.5px] leading-snug text-ink">{l.name}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-[10px] text-ink-3">
                <StockDot status={l.stock.status} lang={lang} />
                <span>
                  {tr("aisle", lang)} {l.aisle}
                </span>
                <span>
                  {l.qty} {l.salesUnit} × {lei(l.unitPrice, lang)}
                </span>
                {l.basis && l.basis !== "unealtă" && l.basis !== "tool" && <span className="hidden text-ink-3/80 sm:inline">· {l.basis}</span>}
              </div>
            </div>
            <div className="text-right">
              {l.discount > 0 && <div className="num text-[11px] text-ink-3 line-through">{lei(l.lineTotal, lang)}</div>}
              <div className={`num text-[14px] font-semibold ${l.discount > 0 ? "text-accent" : "text-ink"}`}>{l.netTotal === 0 ? (lang === "en" ? "FREE" : "GRATUIT") : lei(l.netTotal, lang)}</div>
            </div>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

function StockDot({ status, lang }: { status: QuoteLine["stock"]["status"]; lang: Lang }) {
  const map = {
    in_stock: { c: "bg-ok", t: tr("inStock", lang) },
    low: { c: "bg-warn", t: tr("low", lang) },
    insufficient: { c: "bg-bad", t: tr("insufficient", lang) },
    out: { c: "bg-bad", t: tr("out", lang) },
  } as const;
  const s = map[status];
  return (
    <span className="flex items-center gap-1">
      <span className={`h-1.5 w-1.5 rounded-full ${s.c}`} />
      {s.t}
    </span>
  );
}

function SentToast({ kind, lang, storeName, onDone }: { kind: "wallet" | "reserve"; lang: Lang; storeName: string; onDone: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10 }}
      onAnimationComplete={() => setTimeout(onDone, 3200)}
      className="mt-4 flex items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-paper"
    >
      <span className="stamp grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-on-accent">
        <IconCheck size={18} />
      </span>
      <div className="text-[13px] leading-snug">
        {kind === "wallet"
          ? lang === "en"
            ? "Shopping list pinned to the back of your wallet pass. You'll get a lock-screen reminder when you're near the store."
            : "Lista a fost atașată pe spatele cardului din Wallet. Primești o notificare pe ecranul blocat când ești lângă magazin."
          : lang === "en"
            ? `Reserved for pickup at ${storeName} — ready in 2 hours. (demo)`
            : `Rezervat pentru ridicare la ${storeName} — gata în 2 ore. (demo)`}
      </div>
    </motion.div>
  );
}
