"use client";

import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import type { Card, QualityOption } from "@/agent/types";
import type { Tenant } from "@/config/tenant";
import type { BasketItem } from "@/domain/quote";
import type { Lang } from "@/domain/types";
import { tr } from "@/lib/i18n";
import type { Board as BoardState } from "@/lib/useAgent";
import BlueprintPanel from "./BlueprintPanel";
import OffersPanel from "./OffersPanel";
import PlanPanel from "./PlanPanel";
import ProductsPanel from "./ProductsPanel";
import QuotePanel from "./QuotePanel";
import StockPanel from "./StockPanel";
import WeatherPanel from "./WeatherPanel";

interface Props {
  board: BoardState;
  tenant: Tenant;
  lang: Lang;
  highlight: string | null;
  onHighlight: (l: string | null) => void;
  onQty: (sku: string, delta: number) => void;
  onAdd: (item: BasketItem) => void;
  onMoveStore: (storeId: string) => void;
  onTier?: (o: QualityOption) => void;
  /** Mobile: render only these cards, inline in the conversation. */
  onlyCards?: Card[];
  inline?: boolean;
}

export default function Board(props: Props) {
  const { board, tenant, lang, highlight, onHighlight, onQty, onAdd, onMoveStore, onTier, onlyCards, inline } = props;

  if (onlyCards) {
    return (
      <div className="space-y-4">
        {onlyCards.map((c) => (
          <div key={c.id}>{renderCard(c.kind === "quote" && board.quote?.id === c.id ? board.quote : c)}</div>
        ))}
        {onlyCards.some((c) => c.kind === "plan") && board.project && board.quote && ["deck", "fence", "lawn"].includes(board.project.project.type) && (
          <WeatherPanel
            lat={board.quote.quote.availability.origin.lat}
            lng={board.quote.quote.availability.origin.lng}
            city={board.quote.quote.availability.origin.city}
            type={board.project.project.type}
            lang={lang}
          />
        )}
      </div>
    );
  }

  function renderCard(c: Card) {
    switch (c.kind) {
      case "project":
        return <BlueprintPanel project={c.project} tenant={tenant} lang={lang} highlight={highlight} onHighlight={onHighlight} inline={inline} />;
      case "quote":
        return (
          <QuotePanel
            quote={c.quote}
            suggestions={c.suggestions}
            owned={c.owned}
            lang={lang}
            highlight={highlight}
            onHighlight={onHighlight}
            onQty={onQty}
            onAdd={onAdd}
            onMoveStore={onMoveStore}
            tenant={tenant}
            projectTitle={board.project?.project.title ?? (lang === "en" ? "Your project" : "Proiectul tău")}
            tiers={c.tiers}
            quality={c.quality}
            onTier={onTier}
          />
        );
      case "stock":
        return board.quote ? <StockPanel quote={board.quote.quote} lang={lang} onMoveStore={onMoveStore} /> : null;
      case "offers":
        return <OffersPanel offers={c.offers} quote={board.quote?.quote} lang={lang} />;
      case "plan":
        return <PlanPanel plan={c.plan} lang={lang} />;
      case "products":
        return <ProductsPanel query={c.query} products={c.products} lang={lang} onAdd={onAdd} />;
    }
  }

  const empty = !board.project && !board.quote && !board.products && !board.plan;
  const quote = board.quote?.quote;

  return (
    <div className="mx-auto max-w-[1280px] space-y-5 p-4 sm:p-6 xl:p-8">
      {empty && <EmptyBoard lang={lang} />}
      {board.project && (
        <Flash on={board.last === "project"} v={board.version}>
          {renderCard(board.project)}
        </Flash>
      )}
      {(quote || board.offers) && (
        <div className="grid items-start gap-5 2xl:grid-cols-[1.4fr_1fr]">
          {board.quote && (
            <Flash on={board.last === "quote"} v={board.version}>
              {renderCard(board.quote)}
            </Flash>
          )}
          <div className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-1">
            {quote && (
              <Flash on={board.last === "stock"} v={board.version}>
                <StockPanel quote={quote} lang={lang} onMoveStore={onMoveStore} />
              </Flash>
            )}
            <Flash on={board.last === "offers"} v={board.version}>
              <OffersPanel offers={board.offers?.offers} quote={quote} lang={lang} />
            </Flash>
          </div>
        </div>
      )}
      {board.plan && (
        <Flash on={board.last === "plan"} v={board.version}>
          {renderCard(board.plan)}
        </Flash>
      )}
      {board.project && quote && ["deck", "fence", "lawn"].includes(board.project.project.type) && (
        <WeatherPanel
          lat={quote.availability.origin.lat}
          lng={quote.availability.origin.lng}
          city={quote.availability.origin.city}
          type={board.project.project.type}
          lang={lang}
        />
      )}
      {board.products && (
        <Flash on={board.last === "products"} v={board.version}>
          {renderCard(board.products)}
        </Flash>
      )}
      <div className="pb-6 pt-2 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
        {tr("demoNote", lang)}
        {tenant.id !== "demo" && (lang === "en" ? ` · Concept by WalletLoop, not an official ${tenant.name} service` : ` · Concept WalletLoop, nu un serviciu oficial ${tenant.name}`)}
      </div>
    </div>
  );
}

/** Scrolls the most recently updated panel into view and flashes an accent outline. */
function Flash({ on, v, children }: { on: boolean; v: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (on && ref.current && window.matchMedia("(min-width: 1024px)").matches) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [on, v]);
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }} className="relative">
      {children}
      {on && (
        <motion.span
          key={v}
          initial={{ opacity: 0.9 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.6 }}
          className="pointer-events-none absolute -inset-1 rounded-[26px] ring-2 ring-accent"
        />
      )}
    </motion.div>
  );
}

function EmptyBoard({ lang }: { lang: Lang }) {
  return (
    <div className="bp-sheet relative flex h-[clamp(420px,70vh,720px)] items-center justify-center overflow-hidden rounded-[22px]">
      <svg viewBox="0 0 600 400" className="absolute inset-0 h-full w-full opacity-70" fill="none" stroke="#dce9ff" strokeWidth={1.2}>
        {/* isometric house sketch drawing itself */}
        {[
          "M150 260 L300 330 L450 260 L300 190 Z",
          "M150 260 L150 170 L300 100 L450 170 L450 260",
          "M300 190 L300 100",
          "M150 170 L300 240 L450 170",
          "M300 240 L300 330",
          "M190 250 L190 200 L230 218 L230 268",
          "M340 262 L400 234 L400 200 L340 228 Z",
          "M110 280 L150 300 M470 280 L450 290 M300 350 L300 370",
          "M120 300 L300 385 L480 300",
        ].map((d, i) => (
          <path key={i} d={d} className="draw" style={{ ["--len" as string]: 900, animationDelay: `${i * 0.25}s` }} />
        ))}
      </svg>
      <div className="relative text-center">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#9fbcf0]">
          FIG. 00
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.8 }}
          className="display mt-2 text-[clamp(30px,4vw,54px)] text-white"
        >
          {tr("boardEmpty", lang)}
        </motion.div>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }} className="mx-auto mt-3 max-w-[420px] text-[14px] leading-relaxed text-[#c7d9fa]">
          {tr("boardEmptySub", lang)}
        </motion.p>
      </div>
    </div>
  );
}
