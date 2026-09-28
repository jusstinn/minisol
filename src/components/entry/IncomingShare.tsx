"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import type { Lang } from "@/domain/types";
import { decodeSnapshot } from "@/lib/shareLink";
import type { ShareSnapshot } from "@/lib/shareLink";
import { IconArrow, IconClose } from "../ui/icons";
import { IconPhone } from "../workspace/ShareSheet";
import { PROJECT_NAMES } from "@/lib/i18n";

/**
 * A project arrived through a "send to phone" link. It opens only once the member is known
 * (demo: the pass picked on this screen; production: the pass-link session), so the prices
 * are theirs.
 */
export default function IncomingShare({
  token,
  lang,
  memberName,
  onOpen,
  onDismiss,
}: {
  token: string;
  lang: Lang;
  /** First name of the member it will open for (undefined while members load). */
  memberName?: string;
  onOpen: (snap: ShareSnapshot | null) => void;
  onDismiss: () => void;
}) {
  const en = lang === "en";
  const [snap, setSnap] = useState<ShareSnapshot | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    decodeSnapshot(token).then((s) => alive && setSnap(s));
    return () => {
      alive = false;
    };
  }, [token]);

  const invalid = snap === null;
  return (
    <AnimatePresence>
      <motion.div
        role="region"
        aria-label={en ? "Project received from another device" : "Proiect primit de pe alt dispozitiv"}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-[640px] flex-wrap items-center gap-3 rounded-[18px] border border-ink/15 bg-card p-3 pl-4 shadow-[0_24px_60px_-24px_rgba(20,19,17,0.55)] sm:bottom-6"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-on-accent">
          <IconPhone size={19} />
        </span>
        <div className="min-w-0 flex-1 basis-[calc(100%-110px)] sm:basis-auto">
          <div className="truncate font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">{en ? "Sent from another device" : "Trimis de pe alt dispozitiv"}</div>
          <div className="truncate text-[15px] font-semibold text-ink">
            {invalid ? (en ? "This link has no project in it" : "Linkul nu conține un proiect") : snap ? PROJECT_NAMES[snap.type][en ? 1 : 0] : en ? "Your project" : "Proiectul tău"}
          </div>
          {snap && (
            <div className="truncate font-mono text-[11.5px] text-ink-2">
              {snap.basket.length} {en ? "products" : "produse"}
              {memberName ? ` · ${en ? "for" : "pentru"} ${memberName}` : ""}
            </div>
          )}
        </div>
        {!invalid && (
          <button
            onClick={() => onOpen(snap ?? null)}
            disabled={!memberName || snap === undefined}
            className="order-last flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-[12px] bg-ink px-3.5 max-sm:w-full sm:order-none text-[13.5px] font-semibold text-paper transition enabled:hover:bg-accent enabled:hover:text-on-accent disabled:opacity-40"
          >
            {en ? "Open" : "Deschide"} <IconArrow size={16} />
          </button>
        )}
        <button onClick={onDismiss} aria-label={en ? "Dismiss" : "Renunță"} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-3 transition hover:bg-ink/5 hover:text-ink">
          <IconClose size={14} />
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
