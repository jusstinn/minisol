"use client";

import { useEffect, useState } from "react";
import { stashIncomingShare } from "@/lib/shareLink";
import type { Tenant } from "@/config/tenant";
import type { Lang } from "@/domain/types";
import { Logo } from "../ui/icons";

/**
 * Product mode without a valid pass-link session: Blueprint is opened from the member's
 * wallet pass, never by picking a person on the page.
 */
export default function PassRequired({
  tenant,
  initialLang = "ro",
  reason,
}: {
  tenant: Tenant;
  initialLang?: Lang;
  /** Why the last link was refused (from the proxy redirect). */
  reason?: "expired" | "invalid";
}) {
  const [lang, setLang] = useState<Lang>(initialLang);
  // A "send to phone" link opened before signing in: keep the project for after the pass link.
  useEffect(() => stashIncomingShare(), []);
  const en = lang === "en";
  const style = { "--accent": tenant.accent, "--on-accent": tenant.onAccent } as React.CSSProperties;

  const steps = en
    ? ["Open Apple Wallet or Google Wallet", `Tap your ${tenant.programName} card`, "Tap ⋯ and open the Blueprint link"]
    : ["Deschide Apple Wallet sau Google Wallet", `Atinge cardul ${tenant.programName}`, "Apasă ⋯ și deschide linkul Blueprint"];

  return (
    <div style={style} className="paper-grid relative flex min-h-dvh flex-col">
      <header className="flex items-center gap-3 px-4 pt-4 sm:px-8 sm:pt-6">
        <Logo className="text-ink" />
        <div className="flex items-baseline gap-2">
          <span className="display text-[19px] leading-none">Blueprint</span>
          <span className="label hidden sm:inline">by WalletLoop</span>
        </div>
        <span className="ml-2 hidden rounded-full border border-rule px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-2 sm:inline-flex">
          {en ? "for" : "pentru"}&nbsp;<b className="font-semibold text-ink">{tenant.name}</b>
        </span>
        <div className="ml-auto flex items-center gap-1 rounded-full border border-rule bg-card/70 p-0.5 font-mono text-[11px] backdrop-blur">
          {(["ro", "en"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`rounded-full px-2.5 py-1 uppercase tracking-wider transition ${lang === l ? "bg-ink text-paper" : "text-ink-2 hover:text-ink"}`}
            >
              {l}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1180px] flex-1 grid-cols-1 items-center gap-12 px-4 py-12 sm:px-8 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
        <section>
          <div className="label mb-5 flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
            {tenant.programName}
          </div>
          <h1 className="display text-[clamp(36px,5.6vw,76px)] text-ink">
            {en ? (
              <>
                Open Blueprint from your <span className="text-accent">loyalty card</span> in Wallet
              </>
            ) : (
              <>
                Deschide Blueprint din <span className="text-accent">cardul tău de fidelitate</span> din Wallet
              </>
            )}
          </h1>
          {reason && (
            <p role="status" className="mt-6 inline-flex rounded-full bg-ink px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-paper">
              {reason === "expired"
                ? en
                  ? "That link has expired — open it again from your card"
                  : "Linkul a expirat — deschide-l din nou din card"
                : en
                  ? "That link isn't valid — open it again from your card"
                  : "Linkul nu este valid — deschide-l din nou din card"}
            </p>
          )}
          <p className="mt-6 max-w-[540px] text-[16.5px] leading-relaxed text-ink-2 sm:text-[18px]">
            {en
              ? `Blueprint is for ${tenant.programName} members. Your card is how we know it's you: no account, no password.`
              : `Blueprint este pentru membrii ${tenant.programName}. Cardul tău ne spune că ești tu: fără cont, fără parolă.`}
          </p>
          <ol className="mt-8 grid max-w-[540px] gap-2">
            {steps.map((s, i) => (
              <li key={s} className="flex items-center gap-3 rounded-xl border border-rule bg-card/85 px-3.5 py-2.5 backdrop-blur">
                <span className="font-mono text-[11px] tracking-[0.14em] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-[14.5px] text-ink">{s}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* the pass, drawn as a sketch: where the link lives */}
        <section aria-hidden className="mx-auto w-[min(92%,360px)]">
          <div className="relative aspect-[1.58/1] w-full rounded-[18px] border-2 border-dashed border-ink/25 bg-card/60 p-[6%] backdrop-blur">
            <div className="display text-[20px] leading-none text-ink">{tenant.name}</div>
            <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-3">{tenant.programName}</div>
            <div className="absolute inset-x-[6%] bottom-[8%] flex items-center justify-between rounded-md bg-accent px-3 py-2 text-on-accent">
              <span className="font-mono text-[11px] uppercase tracking-[0.16em]">Blueprint</span>
              <span className="font-mono text-[13px]">↗</span>
            </div>
          </div>
          <div className="label mt-3 text-center">{en ? "Back of your card" : "Spatele cardului"}</div>
        </section>
      </main>
    </div>
  );
}
