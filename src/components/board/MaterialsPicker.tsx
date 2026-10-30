"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ChoiceGroup, ProductOptionView } from "@/agent/types";
import type { QuoteLine } from "@/domain/quote";
import type { Lang, MaterialRole } from "@/domain/types";
import { lei } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { IconCheck, IconClose } from "../ui/icons";
import { isCurrentOption } from "./OptionsStrip";

/**
 * "Materiale": a visual picker in the sketch toolbar — one row of swatches per finish the
 * customer sees in the sketch (deck boards, tiles, pavers, fence panels, paint, laminate), built
 * from the quote card's `choices`. Each swatch shows the engine's own total for that option as a
 * difference against what the list holds now, and whether the store has enough; choosing goes
 * through the same `chooseOption` path as the list's options drawer (no pricing here).
 *
 * A popover under the toolbar on desktop; a bottom sheet on phones (`sheet`). Both are portalled
 * to <body> so the sketch panel's clipping and transforms can't cut them off.
 */

/** The jobs whose product changes how the sketch looks, in the order they're listed. */
const JOBS: MaterialRole[] = ["deck_board", "laminate", "floor_tiles", "wall_tiles", "pavers", "fence_panel", "interior_paint"];

type Texture = "wood" | "tile" | "paver" | "slats" | "paint";
const TEXTURE: Partial<Record<MaterialRole, Texture>> = {
  deck_board: "wood",
  laminate: "wood",
  floor_tiles: "tile",
  wall_tiles: "tile",
  pavers: "paver",
  fence_panel: "slats",
  interior_paint: "paint",
};

/** The groups worth a swatch: a job above with something to choose between. */
export function materialGroups(choices: ChoiceGroup[] | undefined): ChoiceGroup[] {
  return (choices ?? []).filter((g) => JOBS.includes(g.role) && g.options.length > 1).sort((a, b) => JOBS.indexOf(a.role) - JOBS.indexOf(b.role));
}

/** Price difference of an option against what the list holds now (engine totals only), to the ban. */
export function optionDelta(group: ChoiceGroup, option: ProductOptionView, lines: QuoteLine[]): number {
  const current = group.options.find((o) => isCurrentOption(o, lines, group.role));
  const currentTotal = current?.total ?? lines.filter((l) => l.role === group.role).reduce((s, l) => s + l.netTotal, 0);
  return Math.round((option.total - currentTotal) * 100) / 100;
}

/** A small CSS swatch: the product's colour with the texture of its kind (boards, tiles, pavers…). */
function swatchStyle(role: MaterialRole, color: string): React.CSSProperties {
  const t = TEXTURE[role] ?? "paint";
  const line = "rgba(20,19,17,0.22)";
  const light = "rgba(255,255,255,0.5)";
  const backgroundImage: Record<Texture, string> = {
    // Boards with a gap, and a soft lengthwise sheen — not a grid.
    wood: `repeating-linear-gradient(0deg, ${line} 0 1.5px, transparent 1.5px 11px), linear-gradient(90deg, rgba(255,255,255,0.12), rgba(0,0,0,0.06) 45%, rgba(255,255,255,0.08))`,
    tile: `linear-gradient(${light} 1px, transparent 1px), linear-gradient(90deg, ${light} 1px, transparent 1px)`,
    paver: `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`,
    slats: `repeating-linear-gradient(90deg, rgba(20,19,17,0.3) 0 2px, transparent 2px 8px)`,
    paint: `radial-gradient(circle at 30% 25%, rgba(255,255,255,0.35), transparent 55%)`,
  };
  const backgroundSize: Partial<Record<Texture, string>> = { tile: "15px 15px", paver: "16px 8px" };
  return { backgroundColor: color, backgroundImage: backgroundImage[t], backgroundSize: backgroundSize[t] };
}

/** What the sketch needs from the list to offer the swatches. */
export interface MaterialsControls {
  choices: ChoiceGroup[] | undefined;
  lines: QuoteLine[];
  onChoose: (g: ChoiceGroup, o: ProductOptionView) => void;
}

export default function MaterialsPicker({
  choices,
  lines,
  lang,
  onChoose,
  dark,
  sheet,
}: {
  choices: ChoiceGroup[] | undefined;
  lines: QuoteLine[];
  lang: Lang;
  onChoose: (g: ChoiceGroup, o: ProductOptionView) => void;
  /** The sketch shows its dark (plan) theme: the toolbar button follows it. */
  dark: boolean;
  /** Phones: a bottom sheet instead of a popover, and an icon-only button. */
  sheet: boolean;
}) {
  const groups = materialGroups(choices);
  const [open, setOpen] = useState(false);
  // Where the desktop popover hangs (from the button, measured when it opens).
  const [anchor, setAnchor] = useState<{ top: number; right: number; maxH: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const toggle = () => {
    if (open) return close();
    const r = button.current?.getBoundingClientRect();
    if (r) setAnchor({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right), maxH: Math.max(240, window.innerHeight - r.bottom - 24) });
    setOpen(true);
  };

  // Escape closes from anywhere; the window resizing would leave the popover hanging in the air.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
      button.current?.focus();
    };
    const onResize = () => setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    // Focus moves into the picker: onto the option already in the list, else the close button.
    const el = dialog.current;
    (el?.querySelector<HTMLElement>("[aria-pressed='true']") ?? el?.querySelector<HTMLElement>("button"))?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  if (!groups.length) return null;

  // Keep Tab inside the picker while it's open.
  const trap = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !dialog.current) return;
    const items = [...dialog.current.querySelectorAll<HTMLElement>("button:not([disabled])")];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const body = (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={trap}
      data-materials-picker={sheet ? "sheet" : "popover"}
      style={sheet ? undefined : { top: anchor?.top ?? 80, right: anchor?.right ?? 16, maxHeight: Math.min(anchor?.maxH ?? 560, 620) }}
      className={`thin-scroll fixed z-[80] overflow-y-auto overscroll-contain bg-card text-ink shadow-[0_18px_60px_-12px_rgba(20,19,17,0.45)] ring-1 ring-ink/10 ${
        sheet ? "inset-x-0 bottom-0 max-h-[82dvh] rounded-t-3xl pb-[max(1rem,env(safe-area-inset-bottom))]" : "w-[min(400px,calc(100vw-2rem))] rounded-2xl pb-3"
      }`}
    >
      <div className="sticky top-0 z-10 border-b border-rule bg-card/95 px-4 pb-2.5 pt-3 backdrop-blur">
        {sheet && <div aria-hidden className="mx-auto mb-2.5 h-1 w-10 rounded-full bg-ink/15" />}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id={titleId} className="text-[15px] font-semibold leading-tight">
              {tr("materialsTitle", lang)}
            </h3>
            <p className="mt-0.5 text-[11.5px] leading-snug text-ink-3">{tr("materialsHint", lang)}</p>
          </div>
          <button
            onClick={close}
            aria-label={tr("materialsClose", lang)}
            title={tr("materialsClose", lang)}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-2 ring-1 ring-ink/10 transition hover:bg-paper-2 hover:text-ink"
          >
            <IconClose size={15} />
          </button>
        </div>
      </div>
      {groups.map((g) => (
        <section key={g.role} aria-label={g.label} className="px-3 pt-3">
          <div className="mb-1.5 flex items-baseline justify-between gap-2 px-1">
            <h4 className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-2">{g.label}</h4>
            <span className="truncate font-mono text-[10px] text-ink-3">{g.basis}</span>
          </div>
          <ul className="space-y-1.5">
            {g.options.map((o) => {
              const current = isCurrentOption(o, lines, g.role);
              const delta = optionDelta(g, o, lines);
              const price = current ? tr("materialsCurrent", lang) : Math.abs(delta) < 0.01 ? tr("materialsSame", lang) : `${delta < 0 ? "−" : "+"}${lei(Math.abs(delta), lang)}`;
              const stock = o.inStock ? tr("materialsInStock", lang) : tr("materialsLowStock", lang);
              return (
                <li key={o.key}>
                  <button
                    onClick={() => !current && onChoose(g, o)}
                    aria-pressed={current}
                    aria-label={`${current ? tr("materialsCurrent", lang) : tr("materialsChoose", lang)}: ${o.name}, ${lei(o.total, lang)}${current ? "" : ` (${price})`}, ${stock}`}
                    className={`group flex w-full items-center gap-3 rounded-xl p-2 text-left transition ${
                      current ? "bg-accent/10 ring-2 ring-accent" : "ring-1 ring-ink/10 hover:bg-paper-2 hover:ring-ink/30"
                    }`}
                  >
                    <span aria-hidden className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg ring-1 ring-ink/15" style={swatchStyle(g.role, o.art.color)}>
                      {current && (
                        <span className="absolute bottom-0.5 right-0.5 grid h-4 w-4 place-items-center rounded-full bg-accent text-on-accent">
                          <IconCheck size={10} />
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-3">{o.brand}</span>
                      <span className="line-clamp-2 block text-[12.5px] leading-snug text-ink">{o.name}</span>
                      <span className={`mt-0.5 flex items-center gap-1 font-mono text-[9.5px] ${o.inStock ? "text-ok" : "text-warn"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${o.inStock ? "bg-ok" : "bg-warn"}`} />
                        {stock}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="num block text-[13px] font-semibold text-ink">{lei(o.total, lang)}</span>
                      <span
                        className={`num block font-mono text-[10.5px] font-semibold ${
                          current ? "text-accent" : Math.abs(delta) < 0.01 ? "text-ink-3" : delta < 0 ? "text-ok" : "text-bad"
                        }`}
                      >
                        {price}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="px-4 pt-3 text-[10.5px] leading-snug text-ink-3">{tr("materialsNote", lang)}</p>
    </div>
  );

  return (
    <>
      <button
        ref={button}
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={tr("materials", lang)}
        title={tr("materials", lang)}
        className={`flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-full px-2 font-mono text-[10.5px] uppercase tracking-wider backdrop-blur transition sm:px-3 ${
          open ? "bg-accent text-on-accent" : dark ? "bg-[#0a1f47]/70 text-[#dce9ff] ring-1 ring-[#dce9ff]/25 hover:text-white" : "bg-white/70 text-ink-2 ring-1 ring-ink/10"
        }`}
      >
        <span aria-hidden className="grid h-3.5 w-3.5 grid-cols-2 gap-px overflow-hidden rounded-[3px]">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} style={{ backgroundColor: groups[0].options[i % groups[0].options.length].art.color }} />
          ))}
        </span>
        <span className={sheet ? "sr-only" : "hidden @6xl:inline"}>{tr("materials", lang)}</span>
      </button>
      {open &&
        createPortal(
          <>
            <div aria-hidden onClick={close} className={`fixed inset-0 z-[79] ${sheet ? "bg-ink/40 backdrop-blur-[2px]" : ""}`} />
            {body}
          </>,
          document.body,
        )}
    </>
  );
}
