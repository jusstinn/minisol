"use client";

import { motion } from "motion/react";
import { useMemo, useRef, useState } from "react";
import type { Tenant } from "@/config/tenant";
import type { Lang } from "@/domain/types";
import { nextSteps } from "@/lib/nextSteps";
import type { NextStep } from "@/lib/nextSteps";
import type { Board, ChatMessage } from "@/lib/useAgent";

/** The tenant's sketch policy, with the same `?sketch=` override as the sketch panel. */
export function useSketchMode(tenant: Tenant): Tenant["sketch"] {
  const [mode] = useState<Tenant["sketch"]>(() => {
    if (typeof window === "undefined") return tenant.sketch;
    const q = new URLSearchParams(window.location.search).get("sketch");
    return q === "auto" || q === "on_demand" ? q : tenant.sketch;
  });
  return mode;
}

/** Next steps for the conversation so far (see src/lib/nextSteps.ts). */
export function useNextSteps(board: Board, messages: ChatMessage[], lang: Lang, tenant: Tenant): NextStep[] {
  const sketchMode = useSketchMode(tenant);
  return useMemo(() => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    return nextSteps({
      board,
      lang,
      lastCards: lastAssistant?.cards,
      asked: messages.filter((m) => m.role === "user").map((m) => m.text),
      sketchMode,
    });
  }, [board, messages, lang, sketchMode]);
}

/**
 * The quick replies under the conversation. A roving group: Tab reaches the first chip,
 * ←/→ (and Home/End) move between them; "fix" chips (stock, undo) stand out.
 */
export function NextStepChips({ chips, lang, onSend }: { chips: NextStep[]; lang: Lang; onSend: (text: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const to = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    buttons[(to + buttons.length) % buttons.length]?.focus();
  };
  return (
    <div
      ref={ref}
      role="group"
      data-next-steps
      aria-label={lang === "en" ? "Suggested next steps" : "Pași următori sugerați"}
      onKeyDown={onKeyDown}
      // Phones: one scrolling row (keeps the conversation tall); desktop: all of them, wrapped.
      className="thin-scroll -mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:flex-wrap lg:overflow-visible"
    >
      {chips.map((c, i) => (
        <motion.button
          key={c.id}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04, duration: 0.25 }}
          onClick={() => onSend(c.text)}
          data-kind={c.kind}
          className={`shrink-0 rounded-full border px-3 py-1.5 text-[12.5px] transition hover:border-ink hover:text-ink ${
            c.kind === "fix" ? "border-accent/60 bg-accent/10 font-medium text-ink" : "border-ink/15 bg-card text-ink-2"
          }`}
        >
          {c.text}
        </motion.button>
      ))}
    </div>
  );
}
