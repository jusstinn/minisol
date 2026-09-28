"use client";

import { AnimatePresence, motion, useDragControls } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import type { ProductDetailView } from "@/domain/detail";
import type { Lang, QualityTier } from "@/domain/types";
import { lei } from "@/lib/format";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { IconClose, IconRuler, IconWarn } from "../ui/icons";
import { ProductArt } from "../ui/ProductArt";
import { ProductSketch } from "../ui/ProductSketch";

/** Where the sheet was opened from, so it can say what the product is for. */
export interface ProductSheetContext {
  /** Sales units in the list / cart. */
  qty?: number;
  /** Pre-formatted pack mix from an option card, e.g. "3 × 10 l". */
  packLabel?: string;
  /** Why this quantity — the calculator's basis ("20 rânduri × 4 m + 10%"). */
  basis?: string;
}

interface SheetApi {
  open: (sku: string, context?: ProductSheetContext) => void;
  lang: Lang;
}

const SheetCtx = createContext<SheetApi | null>(null);

/** Opens the product sheet; null outside a ProductSheetProvider (thumbnails then stay plain). */
export function useProductSheet(): SheetApi | null {
  return useContext(SheetCtx);
}

export function ProductSheetProvider({ tenantId, lang, storeId, children }: { tenantId: string; lang: Lang; storeId?: string; children: React.ReactNode }) {
  const [target, setTarget] = useState<{ sku: string; context?: ProductSheetContext; n: number } | null>(null);
  const open = useCallback((sku: string, context?: ProductSheetContext) => setTarget((t) => ({ sku, context, n: (t?.n ?? 0) + 1 })), []);
  const close = useCallback(() => setTarget(null), []);
  const api = useMemo(() => ({ open, lang }), [open, lang]);
  return (
    <SheetCtx.Provider value={api}>
      {children}
      <ProductSheet target={target} onClose={close} tenantId={tenantId} lang={lang} storeId={storeId} />
    </SheetCtx.Provider>
  );
}

/** Product thumbnail that opens the sheet (with a small drafting-rule badge). */
export function ProductThumb({ sku, context, className, children }: { sku: string; context?: ProductSheetContext; className?: string; children: React.ReactNode }) {
  const sheet = useProductSheet();
  if (!sheet) return <div className={className}>{children}</div>;
  const label = sheet.lang === "en" ? "Open technical sheet" : "Deschide fișa tehnică";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        sheet.open(sku, context);
      }}
      className={`group/thumb relative transition hover:ring-2 hover:ring-ink/15 ${className ?? ""}`}
      aria-label={label}
      title={label}
    >
      {children}
      <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full border border-rule bg-card text-ink-2 shadow-[0_1px_2px_rgba(20,19,17,0.12)] transition group-hover/thumb:border-ink group-hover/thumb:bg-ink group-hover/thumb:text-paper">
        <IconRuler size={11} />
      </span>
    </button>
  );
}

/** Product name that opens the sheet. */
export function ProductName({ sku, context, className, children }: { sku: string; context?: ProductSheetContext; className?: string; children: React.ReactNode }) {
  const sheet = useProductSheet();
  if (!sheet) return <div className={className}>{children}</div>;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        sheet.open(sku, context);
      }}
      className={`block w-full text-left decoration-ink/30 underline-offset-2 hover:underline ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

// ───────────────────────────── the sheet ─────────────────────────────

const CACHE = new Map<string, ProductDetailView>();

const QUALITY: Record<QualityTier, { ro: string; en: string; cls: string }> = {
  budget: { ro: "Economic", en: "Budget", cls: "bg-paper-2 text-ink-2" },
  standard: { ro: "Standard", en: "Standard", cls: "bg-ink text-paper" },
  premium: { ro: "Premium", en: "Premium", cls: "bg-[#c9a24a] text-ink" },
};

export default function ProductSheet({
  target,
  onClose,
  tenantId,
  lang,
  storeId,
}: {
  target: { sku: string; context?: ProductSheetContext; n: number } | null;
  onClose: () => void;
  tenantId: string;
  lang: Lang;
  storeId?: string;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)", true);
  const drag = useDragControls();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const url = target
    ? `/api/product?${new URLSearchParams({ sku: target.sku, tenant: tenantId, lang, ...(storeId ? { storeId } : {}) }).toString()}`
    : null;
  const [result, setResult] = useState<{ url: string; data?: ProductDetailView; error?: string } | null>(null);

  useEffect(() => {
    if (!url || CACHE.has(url)) return;
    const ctrl = new AbortController();
    fetch(url, { signal: ctrl.signal })
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as { product?: ProductDetailView; error?: string };
        if (!r.ok || !body.product) throw new Error(body.error ?? r.statusText);
        CACHE.set(url, body.product);
        setResult({ url, data: body.product });
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setResult({ url, error: e instanceof Error ? e.message : String(e) });
      });
    return () => ctrl.abort();
  }, [url]);

  useEffect(() => {
    if (!target) return;
    // Move focus into the dialog (not onto a button, which would light up its focus ring).
    dialogRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, onClose]);

  const data = url ? (CACHE.get(url) ?? (result?.url === url ? result.data : undefined)) : undefined;
  const error = url && result?.url === url ? result.error : undefined;
  const en = lang === "en";

  return (
    <AnimatePresence>
      {target && (
        <motion.div
          key="product-sheet"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/55 backdrop-blur-[2px] md:items-center md:p-6"
          onClick={onClose}
        >
          <motion.div
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(e) => e.stopPropagation()}
            initial={isDesktop ? { opacity: 0, y: 18, scale: 0.98 } : { y: "100%" }}
            animate={isDesktop ? { opacity: 1, y: 0, scale: 1 } : { y: 0 }}
            exit={isDesktop ? { opacity: 0, y: 12, scale: 0.98 } : { y: "100%" }}
            transition={isDesktop ? { duration: 0.35, ease: [0.16, 1, 0.3, 1] } : { type: "spring", stiffness: 280, damping: 32 }}
            drag={isDesktop ? false : "y"}
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.7 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 600) onClose();
            }}
            className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[26px] outline-none bg-card shadow-[0_-20px_60px_-20px_rgba(20,19,17,0.45)] md:max-h-[88vh] md:max-w-[960px] md:rounded-[26px] md:shadow-2xl"
          >
            {/* mobile grab handle */}
            <div className="flex touch-none justify-center pb-1 pt-2.5 md:hidden" onPointerDown={(e) => drag.start(e)}>
              <span className="h-1.5 w-11 rounded-full bg-ink/15" />
            </div>
            <Header data={data} target={target} lang={lang} titleId={titleId} onClose={onClose} />
            <div className="thin-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-4 md:px-6 md:pb-6">
              {error ? (
                <div className="flex items-center gap-2 rounded-xl border border-bad/30 bg-bad/5 px-3 py-3 text-[13px] text-bad">
                  <IconWarn size={15} />
                  {en ? "Couldn't load this product." : "Nu am putut încărca produsul."} <span className="font-mono text-[11px] opacity-70">({error})</span>
                </div>
              ) : data ? (
                <Body key={data.sku} data={data} context={target.context} lang={lang} />
              ) : (
                <Skeleton />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Header({
  data,
  target,
  lang,
  titleId,
  onClose,
}: {
  data?: ProductDetailView;
  target: { sku: string };
  lang: Lang;
  titleId: string;
  onClose: () => void;
}) {
  const en = lang === "en";
  return (
    <div className="flex items-start gap-3 border-b border-rule px-4 pb-3.5 pt-1.5 md:px-6 md:pt-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">{data?.brand ?? "…"}</span>
          {data && (
            <span className={`rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${QUALITY[data.quality].cls}`}>{QUALITY[data.quality][lang]}</span>
          )}
          {data && (
            <span className="flex items-center gap-1" aria-label={`Rating ${data.rating.toFixed(1)} / 5`}>
              {[1, 2, 3, 4, 5].map((s) => (
                <span key={s} className={`h-1 w-3 rounded-full ${s <= Math.round(data.rating) ? "bg-ink/70" : "bg-paper-3"}`} />
              ))}
              <span className="ml-0.5 font-mono text-[10px] text-ink-3">{data.rating.toFixed(1)}</span>
            </span>
          )}
        </div>
        <h2 id={titleId} className="mt-1 text-[18px] font-semibold leading-snug tracking-[-0.01em] text-ink md:text-[21px]">
          {data?.name ?? <span className="shimmer inline-block h-5 w-64 rounded bg-paper-2 align-middle" />}
        </h2>
        <div className="mt-0.5 font-mono text-[10px] text-ink-3">
          {en ? "Item no." : "Cod articol"} {target.sku}
        </div>
      </div>
      <button onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-rule transition hover:border-ink" aria-label={en ? "Close" : "Închide"}>
        <IconClose size={17} />
      </button>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="grid gap-5 md:grid-cols-[1.3fr_1fr]">
      <div className="bp-sheet aspect-[480/360] overflow-hidden rounded-2xl">
        <div className="shimmer h-full w-full opacity-30" />
      </div>
      <div className="space-y-3">
        <div className="shimmer h-24 rounded-2xl bg-paper-2" />
        <div className="shimmer h-10 rounded-xl bg-paper-2" />
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="shimmer h-5 rounded bg-paper-2" />
        ))}
      </div>
    </div>
  );
}

const baseUnit = (u: string, en: boolean) => (u === "buc" ? (en ? "pcs" : "buc") : u);
const SALES_UNIT_EN: Record<string, string> = { buc: "piece", găleată: "bucket", bidon: "can", sac: "bag", cutie: "box", pachet: "pack", rolă: "roll", tub: "tube", set: "set" };
const salesUnitOf = (u: string, en: boolean) => (en ? (SALES_UNIT_EN[u] ?? u) : u);

function Body({ data, context, lang }: { data: ProductDetailView; context?: ProductSheetContext; lang: Lang }) {
  const en = lang === "en";
  const hasSketch = data.sketch.template !== "tool";
  const [view, setView] = useState<"sketch" | "pack">(hasSketch ? "sketch" : "pack");
  const nf = (v: number) => v.toLocaleString(en ? "en-GB" : "ro-RO", { maximumFractionDigits: 3 });
  const perPiece = data.content.unit === "buc" && data.content.amount === 1;
  const contentLabel = `${nf(data.content.amount)} ${baseUnit(data.content.unit, en)}`;

  const forProject = (() => {
    if (!context) return null;
    if (context.packLabel) return context.packLabel;
    if (!context.qty) return null;
    if (perPiece) return `${nf(context.qty)} ${baseUnit("buc", en)}`;
    return `${nf(context.qty)} × ${contentLabel} = ${nf(Math.round(context.qty * data.content.amount * 1000) / 1000)} ${baseUnit(data.content.unit, en)}`;
  })();
  const why = context?.basis && context.basis !== "unealtă" && context.basis !== "tool" ? context.basis : null;
  const stock = data.stock;
  const short = stock && context?.qty ? stock.available < context.qty : false;

  return (
    <div className="grid gap-5 md:grid-cols-[1.3fr_1fr] md:gap-6">
      {/* left: drawing / packshot */}
      <div className="min-w-0">
        {hasSketch && (
          <div className="mb-2.5 flex items-center justify-between">
            <span className="label">{view === "sketch" ? (en ? "Dimensioned sketch" : "Schiță cotată") : en ? "Product" : "Produs"}</span>
            <div className="flex rounded-full border border-rule bg-paper p-0.5 font-mono text-[10.5px]" role="tablist">
              {(
                [
                  ["sketch", en ? "Sketch" : "Schiță"],
                  ["pack", en ? "Product" : "Produs"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={view === id}
                  onClick={() => setView(id)}
                  className={`rounded-full px-3 py-1 uppercase tracking-wider transition ${view === id ? "bg-ink text-paper" : "text-ink-2 hover:text-ink"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        <AnimatePresence mode="wait" initial={false}>
          {view === "sketch" && hasSketch ? (
            <motion.div key="sketch" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <ProductSketch sketch={data.sketch} lang={lang} sku={data.sku} />
            </motion.div>
          ) : (
            <motion.div
              key="pack"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="paper-grid relative grid aspect-[480/340] place-items-center overflow-hidden rounded-2xl border border-rule"
            >
              <ProductArt art={data.art} size={220} />
              {!hasSketch && (
                <span className="absolute left-3 top-3 font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-3">
                  {en ? "Tool — no dimensioned sketch" : "Sculă — fără schiță cotată"}
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        {!hasSketch && data.highlights.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {data.highlights.map((h) => (
              <span key={h} className="rounded-full border border-rule bg-paper px-2.5 py-1 font-mono text-[10.5px] text-ink-2">
                {h}
              </span>
            ))}
          </div>
        )}
        <p className="mt-4 text-[13.5px] leading-relaxed text-ink-2">{data.description}</p>
      </div>

      {/* right: price, stock, project, specs */}
      <div className="min-w-0 space-y-3">
        <div className="rounded-2xl bg-paper-2 p-4">
          <div className="label">{en ? "Price" : "Preț"}</div>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
            <span className="display-cond text-[34px] leading-none text-ink">{lei(data.price, lang)}</span>
            <span className="font-mono text-[11px] text-ink-3">
              / {salesUnitOf(data.salesUnit, en)}
              {!perPiece && ` · ${contentLabel}`}
            </span>
          </div>
          {data.unitPrice && (
            <div className="mt-1.5 font-mono text-[11px] text-ink-2">
              = {lei(data.unitPrice.value, lang)} / {baseUnit(data.unitPrice.unit, en)}
            </div>
          )}
          {stock && (
            <div className="mt-3 border-t border-dashed border-rule pt-3 text-[12.5px] leading-snug">
              <div className={`flex items-center gap-2 ${stock.available > 0 && !short ? "text-ok" : short && stock.available > 0 ? "text-warn" : "text-bad"}`}>
                <span className={`h-2 w-2 rounded-full ${stock.available > 0 && !short ? "bg-ok" : short && stock.available > 0 ? "bg-warn" : "bg-bad"}`} />
                {stock.available > 0 ? (en ? `${stock.available} in stock` : `${stock.available} pe stoc`) : en ? "Out of stock" : "Stoc epuizat"}
                {short && stock.available > 0 && <span className="text-ink-2">· {en ? `you need ${context!.qty}` : `ai nevoie de ${context!.qty}`}</span>}
              </div>
              <div className="mt-0.5 font-mono text-[10.5px] text-ink-3">
                {stock.storeName} · {en ? "Aisle" : "Culoar"} {stock.aisle}
              </div>
            </div>
          )}
        </div>

        {forProject && (
          <div className="rounded-2xl border border-accent/40 bg-accent/5 px-4 py-3">
            <div className="label !text-ink-2">{en ? "For your project" : "Pentru proiectul tău"}</div>
            <div className="num mt-1 text-[15px] font-semibold text-ink">{forProject}</div>
            {why && <div className="mt-0.5 font-mono text-[10.5px] leading-relaxed text-ink-2">{why}</div>}
          </div>
        )}

        <div>
          <div className="label mb-1.5">{en ? "Specifications" : "Specificații"}</div>
          <dl className="divide-y divide-rule rounded-2xl border border-rule bg-paper/60 px-3.5">
            {data.specs.map((r) => (
              <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 py-2 text-[12.5px]">
                <dt className={`min-w-0 text-ink-3 ${r.known ? "" : "font-mono text-[11px]"}`}>{r.label}</dt>
                <dd className="max-w-[210px] text-right font-medium text-ink">{r.value}</dd>
              </div>
            ))}
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 py-2 text-[12.5px]">
              <dt className="text-ink-3">{en ? "Sold per" : "Se vinde la"}</dt>
              <dd className="text-right font-medium text-ink">
                {salesUnitOf(data.salesUnit, en)}
                {!perPiece && ` (${contentLabel})`}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
