"use client";

import { motion } from "motion/react";
import type { ProductView } from "@/agent/types";
import type { BasketItem } from "@/domain/quote";
import type { Lang } from "@/domain/types";
import { lei } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { IconPlus } from "../ui/icons";
import { PanelHeader } from "../ui/primitives";
import { ProductArt } from "../ui/ProductArt";
import { ProductName, ProductThumb } from "./ProductSheet";

const QUALITY = {
  budget: { ro: "Economic", en: "Budget", cls: "bg-paper-2 text-ink-2" },
  standard: { ro: "Standard", en: "Standard", cls: "bg-ink text-paper" },
  premium: { ro: "Premium", en: "Premium", cls: "bg-accent text-on-accent" },
} as const;

export default function ProductsPanel({ query, products, lang, onAdd }: { query: string; products: ProductView[]; lang: Lang; onAdd: (i: BasketItem) => void }) {
  return (
    <div className="rounded-[22px] border border-rule bg-card p-4 sm:p-6">
      <PanelHeader index="06" title={`${tr("searchResults", lang)} · „${query}”`} />
      <div className="thin-scroll -mx-1 mt-4 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
        {products.map((p, i) => (
          <motion.div
            key={p.sku}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="flex w-[230px] shrink-0 snap-start flex-col rounded-2xl border border-rule bg-paper p-4"
          >
            <div className="flex items-start justify-between">
              <ProductThumb sku={p.sku} className="grid h-20 w-20 place-items-center rounded-xl bg-paper-2">
                <ProductArt art={p.art} size={72} />
              </ProductThumb>
              <span className={`rounded-full px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-wider ${QUALITY[p.quality].cls}`}>{QUALITY[p.quality][lang]}</span>
            </div>
            <span className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">{p.brand}</span>
            <ProductName sku={p.sku} className="mt-2 line-clamp-3 min-h-[3.9em] text-[13.5px] leading-snug text-ink">
              {p.name}
            </ProductName>
            <div className="mt-2 space-y-0.5 font-mono text-[10px] text-ink-3">
              {p.highlights.slice(0, 3).map((h) => (
                <div key={h} className="truncate">
                  {h}
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <span key={s} className={`h-1 flex-1 rounded-full ${s <= Math.round(p.rating) ? "bg-ink" : "bg-paper-3"}`} />
              ))}
              <span className="ml-1 font-mono text-[10px] text-ink-3">{p.rating.toFixed(1)}</span>
            </div>
            <div className="mt-auto flex items-end justify-between pt-4">
              <div>
                <div className="display-cond text-[24px] leading-none text-ink">{lei(p.price, lang)}</div>
                <div className={`mt-1 font-mono text-[10px] ${p.stockAtStore > 0 ? "text-ok" : "text-bad"}`}>
                  {p.stockAtStore > 0 ? `${p.stockAtStore} ${tr("inStock", lang).toLowerCase()}` : tr("out", lang)}
                </div>
              </div>
              <button
                onClick={() => onAdd({ sku: p.sku, qty: 1 })}
                className="grid h-9 w-9 place-items-center rounded-full bg-ink text-paper transition hover:bg-accent hover:text-on-accent"
                aria-label={tr("add", lang)}
              >
                <IconPlus size={16} />
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
