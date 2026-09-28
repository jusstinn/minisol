"use client";

import { motion } from "motion/react";
import type { Card } from "@/agent/types";
import type { Lang } from "@/domain/types";
import { dec, int, lei, unitText } from "@/lib/format";
import { tr } from "@/lib/i18n";
import type { Board } from "@/lib/useAgent";
import { signed } from "../board/ChangeCard";
import { IconBag, IconCube, IconPencil, IconPin, IconSpark, IconTag } from "../ui/icons";
import { IconPlanSteps, IconSearch, TAB_LABEL, TAB_OF } from "./MobileTabs";
import type { PanelTarget } from "./MobileTabs";

/**
 * Phones: the cards an assistant message produced, as one-line summaries that open
 * the tab holding the full panel — instead of every card (and a 3D canvas) inline.
 */
export default function CardChips({ cards, board, lang, onOpen }: { cards: Card[]; board: Board; lang: Lang; onOpen: (target: PanelTarget) => void }) {
  // A sketch edit brings a project, a quote and a change card: the change (first) says what the project card would.
  const hasChange = cards.some((c) => c.kind === "change");
  // The sizes card is a question, rendered in the conversation itself — no chip.
  const shown = cards
    .filter((c): c is ChipCard => c.kind !== "sizes" && !(hasChange && c.kind === "project"))
    .sort((a, b) => Number(b.kind === "change") - Number(a.kind === "change"));
  if (!shown.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {shown.map((c, i) => (
        <motion.div key={c.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
          <Chip card={c} board={board} lang={lang} onOpen={onOpen} />
        </motion.div>
      ))}
    </div>
  );
}

interface ChipView {
  target: PanelTarget;
  icon: React.ReactNode;
  /** Tile behind the icon. */
  tile: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
}

type ChipCard = Exclude<Card, { kind: "sizes" }>;

function view(card: ChipCard, board: Board, lang: Lang): ChipView {
  const en = lang === "en";
  switch (card.kind) {
    case "project": {
      // Hand edits update the current card in place (same id): show it live.
      const p = board.project?.id === card.id ? board.project.project : card.project;
      const main = p.measurements[0];
      return {
        target: "sketch",
        icon: <IconCube size={17} />,
        tile: "bp-sheet text-[#dce9ff]",
        title: p.title,
        meta: [
          main && `${dec(main.value, lang, main.unit === "buc" || main.unit === "rânduri" ? 0 : 2)} ${unitText(main.unit, lang)}`,
          `${p.estimate.hoursMin}–${p.estimate.hoursMax} ${tr("hours", lang)}`,
          (p.revision ?? 0) > 0 && `rev. ${p.revision}`,
        ]
          .filter(Boolean)
          .join(" · "),
      };
    }
    case "change": {
      const ch = card.change;
      return {
        target: "sketch",
        icon: ch.source === "agent" ? <IconSpark size={16} /> : <IconPencil size={16} />,
        tile: "bg-accent text-on-accent",
        title: ch.edits.at(-1) ?? (en ? "Sketch changed" : "Schiță modificată"),
        meta: (
          <>
            <span className={ch.delta > 0.004 ? "text-ink" : ch.delta < -0.004 ? "text-[#2f9e5b]" : undefined}>{signed(ch.delta, lang)}</span>
            {` → ${lei(ch.totalAfter, lang)}`}
            {ch.edits.length > 1 && ` · +${ch.edits.length - 1} ${en ? "more" : "alte"}`}
          </>
        ),
      };
    }
    case "quote": {
      const q = (board.quote?.id === card.id ? board.quote : card).quote;
      return {
        target: "list",
        icon: <IconBag size={16} />,
        tile: "bg-ink text-paper",
        title: (
          <>
            {q.lines.length} {tr("products", lang)} · <span className="num">{lei(q.total, lang)}</span>
          </>
        ),
        meta: [q.saving > 0 && `${tr("youSave", lang)} ${lei(q.saving, lang)}`, `+${int(q.points.earned, lang)} pts`].filter(Boolean).join(" · "),
      };
    }
    case "stock": {
      const s = card.stores.find((x) => x.isSelected) ?? card.stores[0];
      const full = card.stores.filter((x) => x.allInStock).length;
      return {
        target: "stock",
        icon: <IconPin size={16} />,
        tile: "bp-sheet text-[#dce9ff]",
        title: s ? `${s.allInStock ? tr("allInStockAt", lang) : tr("missingAt", lang)} ${s.name}` : tr("stock", lang),
        meta: en ? `${full} of ${card.stores.length} stores have everything` : `${full} din ${card.stores.length} magazine au tot`,
      };
    }
    case "offers": {
      const applied = card.offers.filter((o) => o.appliesNow).length;
      return {
        target: "offers",
        icon: <IconTag size={16} />,
        tile: "bg-paper-2 text-ink",
        title: en ? `${card.offers.length} active offers` : `${card.offers.length} oferte active`,
        meta: en ? `${applied} applied to this list · WalletLoop` : `${applied} aplicate pe listă · WalletLoop`,
      };
    }
    case "plan":
      return {
        target: "plan",
        icon: <IconPlanSteps size={16} />,
        tile: "bg-paper-2 text-ink",
        title: card.plan.title,
        meta: en ? `${card.plan.steps.length} steps · ${card.plan.tips.length} tips` : `${card.plan.steps.length} pași · ${card.plan.tips.length} sfaturi`,
      };
    case "products":
      return {
        target: "products",
        icon: <IconSearch size={16} />,
        tile: "bg-paper-2 text-ink",
        title: `„${card.query}”`,
        meta: en ? `${card.products.length} results` : `${card.products.length} rezultate`,
      };
  }
}

function Chip({ card, board, lang, onOpen }: { card: ChipCard; board: Board; lang: Lang; onOpen: (target: PanelTarget) => void }) {
  const v = view(card, board, lang);
  const tab = TAB_LABEL[TAB_OF[v.target]];
  return (
    <button
      onClick={() => onOpen(v.target)}
      className="group flex w-full items-center gap-3 rounded-2xl border border-rule bg-card py-2 pl-2 pr-3 text-left transition hover:border-ink/40 active:scale-[0.99]"
    >
      <span className={`grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl ${v.tile}`}>{v.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium leading-tight text-ink">{v.title}</span>
        {v.meta && <span className="mt-0.5 block truncate font-mono text-[10.5px] text-ink-3">{v.meta}</span>}
      </span>
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 transition group-hover:text-ink">
        {tab[lang]} <span className="inline-block transition group-hover:translate-x-0.5">→</span>
      </span>
    </button>
  );
}
