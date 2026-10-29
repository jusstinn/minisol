"use client";

import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { ProjectSnapshot, SessionState } from "@/agent/types";
import type { Tenant } from "@/config/tenant";
import type { Lang } from "@/domain/types";
import { tr } from "@/lib/i18n";
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

export default function ArMenu({ build, project, tenant, lang, dark, inline, getState }: ArMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = build.outdoor ? tr("arTitleOutdoor", lang) : tr("arTitleIndoor", lang);
  return (
    <div ref={ref} className="relative">
      <button
        ref={button}
        onClick={() => setOpen((o) => !o)}
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
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label={label}
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className={`absolute right-0 top-[calc(100%+6px)] z-20 w-[min(88vw,308px)] rounded-xl p-3 backdrop-blur-md ${
              dark ? "bg-[#071634]/95 text-[#dce9ff] ring-1 ring-[#dce9ff]/25" : "bg-white/95 text-ink shadow-[0_18px_40px_-16px_rgba(0,0,0,0.35)] ring-1 ring-ink/10"
            }`}
          >
            <ArPanel build={build} project={project} tenant={tenant} lang={lang} dark={dark} getState={getState} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
