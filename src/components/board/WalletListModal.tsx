"use client";

import { AnimatePresence, motion } from "motion/react";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import type { Tenant } from "@/config/tenant";
import type { Quote } from "@/domain/quote";
import type { Lang } from "@/domain/types";
import { lei } from "@/lib/format";
import { IconCheck, IconClose, IconPin } from "../ui/icons";

/**
 * "Send to Wallet": the pass flips to its back, showing the shopping list sorted
 * by aisle (a walking route through the store) and a QR code for the till.
 */
export default function WalletListModal({
  open,
  onClose,
  quote,
  title,
  tenant,
  lang,
}: {
  open: boolean;
  onClose: () => void;
  quote: Quote;
  title: string;
  tenant: Tenant;
  lang: Lang;
}) {
  const [flipped, setFlipped] = useState(false);
  const [qr, setQr] = useState<string>("");
  const [ticked, setTicked] = useState<Set<string>>(new Set());

  const route = useMemo(() => {
    const byAisle = new Map<number, typeof quote.lines>();
    for (const l of quote.lines) byAisle.set(l.aisle, [...(byAisle.get(l.aisle) ?? []), l]);
    return [...byAisle.entries()].sort((a, b) => a[0] - b[0]);
  }, [quote]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setFlipped(true), 650);
    const payload = `BLUEPRINT|${quote.storeId}|${quote.lines.map((l) => `${l.sku}x${l.qty}`).join(",")}`;
    QRCode.toString(payload, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#141311", light: "#ffffff00" } })
      .then(setQr)
      .catch(() => setQr(""));
    return () => {
      clearTimeout(t);
      setFlipped(false);
    };
  }, [open, quote]);

  const toggle = (sku: string) =>
    setTicked((s) => {
      const n = new Set(s);
      if (n.has(sku)) n.delete(sku);
      else n.add(sku);
      return n;
    });

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 60, scale: 0.92, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 24 }}
            className="relative w-full max-w-[420px]"
            style={{ perspective: 1400 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={onClose} className="absolute -top-12 right-0 grid h-9 w-9 place-items-center rounded-full bg-paper text-ink" aria-label="close">
              <IconClose size={18} />
            </button>
            <motion.div
              animate={{ rotateY: flipped ? 180 : 0 }}
              transition={{ duration: 0.9, ease: [0.65, 0, 0.35, 1] }}
              style={{ transformStyle: "preserve-3d" }}
              className="relative h-[min(78vh,640px)]"
            >
              {/* front */}
              <div className="absolute inset-0 flex flex-col rounded-[22px] p-6 text-on-accent shadow-2xl" style={{ background: "var(--accent)", backfaceVisibility: "hidden" }}>
                <div className="display text-[24px]">{tenant.name}</div>
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] opacity-70">{tenant.programName}</div>
                <div className="mt-auto font-mono text-[10px] uppercase tracking-[0.2em] opacity-70">{lang === "en" ? "Project" : "Proiect"}</div>
                <div className="display text-[34px] leading-tight">{title}</div>
                <div className="mt-4 font-mono text-[12px]">{lei(quote.total, lang)}</div>
              </div>
              {/* back */}
              <div
                className="absolute inset-0 flex flex-col overflow-hidden rounded-[22px] bg-card text-ink shadow-2xl"
                style={{ transform: "rotateY(180deg)", backfaceVisibility: "hidden" }}
              >
                <div className="flex items-start justify-between border-b border-rule p-5">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">{lang === "en" ? "Pinned to your pass" : "Atașat pe card"}</div>
                    <div className="display mt-1 text-[20px] leading-tight">{title}</div>
                    <div className="mt-1 flex items-center gap-1 font-mono text-[10.5px] text-ink-2">
                      <IconPin size={12} /> {quote.storeName}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="display-cond text-[22px] leading-none">{lei(quote.total, lang)}</div>
                    <div className="mt-1 font-mono text-[10px] text-accent">+{quote.points.earned.toLocaleString(lang === "en" ? "en-GB" : "ro-RO")} pts</div>
                  </div>
                </div>
                <div className="thin-scroll flex-1 overflow-y-auto px-5 py-3">
                  <div className="label mb-2">{lang === "en" ? "Your route through the store" : "Traseul tău prin magazin"}</div>
                  <ol className="relative">
                    <span className="absolute bottom-2 left-[15px] top-2 w-px border-l border-dashed border-ink/25" />
                    {route.map(([aisle, lines]) => (
                      <li key={aisle} className="relative mb-3 grid grid-cols-[32px_1fr] gap-3">
                        <span className="relative z-10 grid h-8 w-8 place-items-center rounded-full bg-ink font-mono text-[11px] font-semibold text-paper">{aisle}</span>
                        <div className="space-y-1 pt-1">
                          {lines.map((l) => (
                            <button key={l.sku} onClick={() => toggle(l.sku)} className="flex w-full items-start gap-2 text-left">
                              <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border ${ticked.has(l.sku) ? "border-ok bg-ok text-white" : "border-ink/30"}`}>
                                {ticked.has(l.sku) && <IconCheck size={11} />}
                              </span>
                              <span className={`text-[12.5px] leading-snug ${ticked.has(l.sku) ? "text-ink-3 line-through" : "text-ink"}`}>
                                <b className="num">{l.qty}×</b> {l.name}
                              </span>
                            </button>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="flex items-center gap-4 border-t border-rule bg-paper p-4">
                  <div className="h-[84px] w-[84px] shrink-0 rounded-lg bg-white p-1.5" dangerouslySetInnerHTML={{ __html: qr }} />
                  <div className="text-[12px] leading-snug text-ink-2">
                    {lang === "en"
                      ? "Scan at the till or at self-checkout — your offers and points are applied automatically. You'll get a lock-screen reminder when you're near the store."
                      : "Scanează la casă sau la self-checkout — ofertele și punctele se aplică automat. Primești o notificare pe ecranul blocat când ajungi lângă magazin."}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
