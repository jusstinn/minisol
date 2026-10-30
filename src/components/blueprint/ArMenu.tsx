"use client";

import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { ProjectSnapshot, SessionState } from "@/agent/types";
import type { Tenant } from "@/config/tenant";
import type { Lang } from "@/domain/types";
import { tr } from "@/lib/i18n";
import { Portal } from "../ui/Portal";
import { IconAr } from "./ArIcons";
import type { Build } from "./builders";

/**
 * "AR": the sketch toolbar's button for seeing the project at real size in the customer's own
 * garden or room, and for downloading the 3D model. The button and its frame are all that is in
 * the first load; the panel (device detection, the exporter, QR, the AR launcher) is a separate
 * chunk fetched when the menu is first opened — see ArPanel.tsx.
 */

const ArPanel = dynamic(() => import("./ArPanel"), {
  ssr: false,
  loading: () => <div className="grid h-24 place-items-center font-mono text-[10px] uppercase tracking-wider opacity-60">…</div>,
});

const PANEL_WIDTH = 308;

export interface ArMenuProps {
  build: Build;
  project: ProjectSnapshot;
  tenant: Tenant;
  lang: Lang;
  dark: boolean;
  /** Phone tab layout: the label is screen-reader only, like the other toolbar buttons. */
  inline?: boolean;
  /** The session as it is now, for the QR's "open this project on the phone" link. */
  getState?: () => SessionState;
}

/** Gap kept between the dropdown and the window's edges. */
const EDGE = 8;

type Spot = { top: number; right: number; maxHeight: number };

/**
 * Where the dropdown goes: under the button, right-aligned to it, inside the window. It is
 * `position: fixed` in a portal, because the sketch card clips (overflow hidden) and on a short
 * laptop screen the QR and the download would be cut off at the card's bottom edge.
 */
function spotUnder(button: HTMLElement): Spot {
  const b = button.getBoundingClientRect();
  const width = Math.min(window.innerWidth * 0.88, PANEL_WIDTH);
  const rightEdge = Math.min(b.right, window.innerWidth - EDGE);
  const left = Math.max(EDGE, rightEdge - width);
  const top = b.bottom + 6;
  return { top, right: window.innerWidth - (left + width), maxHeight: Math.max(160, window.innerHeight - top - EDGE) };
}

export default function ArMenu({ build, project, tenant, lang, dark, inline, getState }: ArMenuProps) {
  const [open, setOpen] = useState(false);
  const [spot, setSpot] = useState<Spot | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const floating = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || floating.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    // The dropdown is fixed to the window: keep it under its button while the page scrolls or resizes.
    const follow = () => {
      if (!inline && button.current) setSpot(spotUnder(button.current));
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", follow);
    window.addEventListener("scroll", follow, true);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", follow);
      window.removeEventListener("scroll", follow, true);
    };
  }, [open, inline]);

  const toggle = () => {
    if (!open && !inline && button.current) setSpot(spotUnder(button.current));
    setOpen((o) => !o);
  };

  const label = build.outdoor ? tr("arTitleOutdoor", lang) : tr("arTitleIndoor", lang);
  const surface = dark ? "bg-[#071634]/95 text-[#dce9ff] ring-1 ring-[#dce9ff]/25" : "bg-white/95 text-ink shadow-[0_18px_40px_-16px_rgba(0,0,0,0.35)] ring-1 ring-ink/10";
  const panel = <ArPanel build={build} project={project} tenant={tenant} lang={lang} dark={dark} getState={getState} />;
  return (
    <div ref={ref} className="relative">
      <button
        ref={button}
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${tr("arButton", lang)}: ${label}`}
        title={label}
        data-testid="ar-button"
        className={`flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-full px-2 font-mono sm:px-3 text-[10.5px] uppercase tracking-wider backdrop-blur transition ${
          open ? "bg-accent text-on-accent" : dark ? "bg-[#0a1f47]/70 text-[#dce9ff] ring-1 ring-[#dce9ff]/25 hover:text-white" : "bg-white/70 text-ink-2 ring-1 ring-ink/10"
        }`}
      >
        <IconAr size={15} />
        <span className={inline ? "sr-only" : "hidden @6xl:inline"}>{tr("arButton", lang)}</span>
      </button>
      {inline ? (
        // Phone: a bottom sheet over everything (the sketch card is too small, and clips).
        <Portal>
          <AnimatePresence>
            {open && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="fixed inset-0 z-[60] grid items-end bg-ink/40">
                <motion.div
                  ref={floating}
                  role="dialog"
                  aria-label={label}
                  initial={{ y: 40, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 30, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className={`thin-scroll max-h-[88dvh] w-full overflow-y-auto rounded-t-[20px] p-4 pb-[max(16px,env(safe-area-inset-bottom))] backdrop-blur-md ${surface}`}
                >
                  {panel}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </Portal>
      ) : (
        <Portal>
          <AnimatePresence>
            {open && spot && (
              <motion.div
                ref={floating}
                role="dialog"
                aria-label={label}
                initial={{ opacity: 0, y: -4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                style={{ top: spot.top, right: spot.right, maxHeight: spot.maxHeight }}
                className={`thin-scroll fixed z-[55] w-[min(88vw,308px)] origin-top-right overflow-y-auto rounded-xl p-3 backdrop-blur-md ${surface}`}
              >
                {panel}
              </motion.div>
            )}
          </AnimatePresence>
        </Portal>
      )}
    </div>
  );
}
