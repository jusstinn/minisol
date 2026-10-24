"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Lang } from "@/domain/types";
import { tr } from "@/lib/i18n";
import { CAMERA_PRESETS } from "./cameraPresets";
import type { CameraPreset } from "./cameraPresets";
import { IconCamEye, IconCamFront, IconCamIso, IconCamSide, IconCamTop, IconCamTour } from "../ui/icons";

type IconFn = (p: { size?: number }) => React.ReactNode;
const ICONS: Record<CameraPreset, IconFn> = { iso: IconCamIso, top: IconCamTop, front: IconCamFront, side: IconCamSide, eye: IconCamEye, tour: IconCamTour };
const LABEL_KEY = { iso: "cameraIso", top: "cameraTop", front: "cameraFront", side: "cameraSide", eye: "cameraEye", tour: "cameraTour" } as const;

/**
 * Compact camera control for the sketch toolbar: a round button (showing the active preset's
 * icon) that opens a small popover listing all six framings, with a keyboard shortcut (1–6)
 * next to each — the same panel works as a desktop popover and a phone "sheet" anchored to the
 * button. Picking a preset — even the one already active — lets go of a grabbed/stopped tour.
 */
export default function CameraMenu({ preset, onChoose, dark, lang }: { preset: CameraPreset; onChoose: (p: CameraPreset) => void; dark: boolean; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const Active = ICONS[preset];
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`${tr("camera", lang)}: ${tr(LABEL_KEY[preset], lang)}`}
        title={tr("camera", lang)}
        className={`grid h-8 w-8 place-items-center rounded-full backdrop-blur transition ${
          open ? "bg-accent text-on-accent" : dark ? "bg-[#0a1f47]/70 text-[#dce9ff] ring-1 ring-[#dce9ff]/25 hover:text-white" : "bg-white/70 text-ink-2 ring-1 ring-ink/10"
        }`}
      >
        <Active size={15} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className={`absolute right-0 top-[calc(100%+6px)] z-20 w-[172px] overflow-hidden rounded-xl p-1 backdrop-blur-md ${
              dark ? "bg-[#071634]/95 ring-1 ring-[#dce9ff]/25" : "bg-white/95 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.35)] ring-1 ring-ink/10"
            }`}
          >
            {CAMERA_PRESETS.map((p, i) => {
              const Icon = ICONS[p];
              const active = p === preset;
              return (
                <button
                  key={p}
                  aria-pressed={active}
                  aria-label={tr(LABEL_KEY[p], lang)}
                  onClick={() => {
                    onChoose(p);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left font-mono text-[10.5px] uppercase tracking-wider transition ${
                    active ? "bg-accent text-on-accent" : dark ? "text-[#dce9ff] hover:bg-[#dce9ff]/10" : "text-ink-2 hover:bg-ink/5"
                  }`}
                >
                  <Icon size={14} />
                  <span className="min-w-0 flex-1 truncate">{tr(LABEL_KEY[p], lang)}</span>
                  <span className="opacity-50">{i + 1}</span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
