"use client";

import type { Lang } from "@/domain/types";
import { useDictation } from "@/lib/useDictation";
import { IconMic } from "./icons";

/** Dictation toggle; renders nothing where the browser has no speech recognition. */
export function MicButton({ lang, value, onChange, className }: { lang: Lang; value: string; onChange: (t: string) => void; className?: string }) {
  const d = useDictation(lang, onChange);
  if (!d.supported) return null;
  return (
    <button
      type="button"
      onClick={() => (d.listening ? d.stop() : d.start(value))}
      aria-label={lang === "en" ? "Dictate" : "Dictează"}
      title={d.denied ? (lang === "en" ? "The microphone is blocked — allow it in the browser's site settings" : "Microfonul e blocat — permite-l din setările site-ului în browser") : undefined}
      className={`relative grid shrink-0 place-items-center rounded-xl transition ${
        d.listening ? "bg-accent text-on-accent" : d.denied ? "text-bad hover:bg-bad/5" : "text-ink-3 hover:bg-paper-2 hover:text-ink"
      } ${className ?? "h-[42px] w-[42px]"}`}
    >
      {d.listening && <span className="absolute inset-0 animate-ping rounded-xl bg-accent/40" />}
      <IconMic size={19} className="relative" />
    </button>
  );
}
