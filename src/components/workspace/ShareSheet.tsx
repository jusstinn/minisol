"use client";

import { AnimatePresence, motion } from "motion/react";
import QRCode from "qrcode";
import type { SVGProps } from "react";
import { useState } from "react";
import type { SessionState } from "@/agent/types";
import type { Tenant } from "@/config/tenant";
import type { Lang } from "@/domain/types";
import { dec } from "@/lib/format";
import { encodeSnapshot, shareUrl, snapshotOf } from "@/lib/shareLink";
import { track } from "@/lib/track";
import { useDialog } from "@/lib/useDialog";
import { IconCheck, IconClose } from "../ui/icons";
import { Portal } from "../ui/Portal";

/**
 * "Trimite pe telefon": a QR code and a link that reopen this project (sketch, list, store,
 * quality) on another device — nothing personal and no conversation in it (see shareLink.ts).
 */
export function ShareButton({ getState, tenant, lang }: { getState: () => SessionState; tenant: Tenant; lang: Lang }) {
  const en = lang === "en";
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<{ url: string; qr: string; bytes: number } | null>(null);

  const start = async () => {
    setOpen(true);
    setLink(null);
    const snap = snapshotOf(getState(), lang);
    if (!snap) return;
    const token = await encodeSnapshot(snap);
    const url = shareUrl(window.location, tenant.id, token, lang);
    const qr = await QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "L", color: { dark: "#141311", light: "#ffffff00" } }).catch(() => "");
    setLink({ url, qr, bytes: new TextEncoder().encode(url).length });
    track("share_created");
  };

  return (
    <>
      <button
        onClick={start}
        aria-label={en ? "Send to my phone" : "Trimite pe telefon"}
        aria-haspopup="dialog"
        title={en ? "Open this project on your phone" : "Deschide proiectul pe telefon"}
        className="flex h-[34px] items-center gap-1.5 rounded-full border border-rule px-2.5 text-[12.5px] font-medium text-ink-2 transition hover:border-ink hover:text-ink"
      >
        <IconPhone size={16} />
        <span className="hidden lg:inline">{en ? "To phone" : "Pe telefon"}</span>
      </button>
      <ShareDialog open={open} onClose={() => setOpen(false)} link={link} lang={lang} />
    </>
  );
}

function ShareDialog({ open, onClose, link, lang }: { open: boolean; onClose: () => void; link: { url: string; qr: string; bytes: number } | null; lang: Lang }) {
  const en = lang === "en";
  const ref = useDialog<HTMLDivElement>(open, onClose);
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
    } catch {
      // Older browsers / no permission: select the text so the customer can copy it.
      const input = ref.current?.querySelector<HTMLInputElement>("input");
      input?.select();
      document.execCommand?.("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const share = async () => {
    if (!link) return;
    await navigator.share({ title: "Blueprint", text: en ? "My project on Blueprint" : "Proiectul meu în Blueprint", url: link.url }).catch(() => {});
  };

  return (
    <Portal>
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] grid items-end bg-ink/50 backdrop-blur-[2px] sm:place-items-center sm:p-4" onClick={onClose}>
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-title"
            aria-describedby="share-desc"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full rounded-t-[22px] bg-paper p-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-[460px] sm:rounded-[22px] sm:p-6"
          >
            <button onClick={onClose} className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full border border-rule text-ink-2 hover:border-ink hover:text-ink" aria-label={en ? "Close" : "Închide"}>
              <IconClose size={16} />
            </button>
            <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-3">{en ? "Send to phone" : "Trimite pe telefon"}</div>
            <h2 id="share-title" className="display mt-1 pr-10 text-[26px] leading-[1.02]">
              {en ? "Pick it up on your phone" : "Continuă pe telefon"}
            </h2>
            <p id="share-desc" className="mt-2 text-[13.5px] leading-snug text-ink-2">
              {en
                ? "Scan the code with your phone's camera — the project opens with the sketch, the list and your store, ready to take to the shop."
                : "Scanează codul cu camera telefonului — proiectul se deschide cu schița, lista și magazinul tău, gata de dus la magazin."}
            </p>

            <div className="mt-4 flex items-center gap-4 rounded-2xl border border-rule bg-card p-3">
              <div className="grid h-[152px] w-[152px] shrink-0 place-items-center rounded-xl bg-white p-2 sm:h-[168px] sm:w-[168px]" aria-hidden={!link?.qr}>
                {link?.qr ? (
                  <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" role="img" aria-label={en ? "QR code with the link to this project" : "Cod QR cu linkul proiectului"} dangerouslySetInnerHTML={{ __html: link.qr }} />
                ) : (
                  <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">…</span>
                )}
              </div>
              <ul className="space-y-1.5 text-[12.5px] leading-snug text-ink-2">
                {(en
                  ? ["Sketch & measurements", "Your list, picks & quantities", "Store & quality level"]
                  : ["Schița și dimensiunile", "Lista, produsele alese și cantitățile", "Magazinul și nivelul de calitate"]
                ).map((t) => (
                  <li key={t} className="flex items-start gap-1.5">
                    <IconCheck size={13} className="mt-0.5 shrink-0 text-ok" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            <label className="mt-4 block">
              <span className="label">{en ? "Link to this project" : "Linkul proiectului"}</span>
              <input
                readOnly
                value={link?.url ?? ""}
                onFocus={(e) => e.currentTarget.select()}
                className="mt-1 w-full truncate rounded-xl border border-rule bg-card px-3 py-2.5 font-mono text-[11.5px] text-ink-2 focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-accent/40"
              />
            </label>
            <div className="mt-3 flex gap-2">
              <button
                data-autofocus
                onClick={copy}
                disabled={!link}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-ink py-3 text-[13.5px] font-semibold text-paper transition hover:bg-accent hover:text-on-accent disabled:opacity-40"
              >
                {copied ? <IconCheck size={16} /> : <IconLink size={16} />}
                {copied ? (en ? "Copied" : "Copiat") : en ? "Copy link" : "Copiază link"}
              </button>
              {canShare && (
                <button onClick={share} disabled={!link} className="flex items-center justify-center gap-2 rounded-xl border border-ink/20 px-4 text-[13.5px] font-semibold text-ink transition hover:border-ink disabled:opacity-40">
                  {en ? "Send…" : "Trimite…"}
                </button>
              )}
            </div>
            <span className="sr-only" aria-live="polite">
              {copied ? (en ? "Link copied" : "Link copiat") : ""}
            </span>
            <p className="mt-3 font-mono text-[10px] leading-relaxed text-ink-3">
              {en
                ? "The link holds only the project — not the conversation, not your details. On the other device you sign in with your card; prices and stock are checked again."
                : "Linkul conține doar proiectul — nu conversația și nici datele tale. Pe celălalt dispozitiv intri cu cardul tău; prețurile și stocul se verifică din nou."}
              {link && ` · ${dec(link.bytes / 1024, lang, 1)} kB`}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </Portal>
  );
}

type P = SVGProps<SVGSVGElement> & { size?: number };
const svg = (size = 20, p: P) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, ...p });

export const IconPhone = ({ size, ...p }: P) => (
  <svg {...svg(size, p)}>
    <rect x="7" y="2.5" width="10" height="19" rx="2.2" />
    <path d="M10.5 18.5h3" />
  </svg>
);
const IconLink = ({ size, ...p }: P) => (
  <svg {...svg(size, p)}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </svg>
);
