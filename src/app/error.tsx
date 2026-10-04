"use client";

import { useEffect } from "react";
import { Logo } from "@/components/ui/icons";

/** Anything that breaks a page lands here, in Blueprint's look, with a way back. */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const en = typeof navigator !== "undefined" && !navigator.language.toLowerCase().startsWith("ro");
  return (
    <div className="paper-grid grid min-h-dvh place-items-center px-6">
      <div className="max-w-[460px] text-center">
        <Logo className="mx-auto text-ink" size={28} />
        <h1 className="display mt-5 text-[34px] leading-tight text-ink">{en ? "Something went wrong" : "Ceva n-a mers"}</h1>
        <p className="mt-3 text-[15.5px] leading-relaxed text-ink-2">
          {en ? "Your project is saved on this device. Try again, or start over." : "Proiectul tău e salvat pe acest dispozitiv. Încearcă din nou sau începe de la capăt."}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button onClick={() => retry()} className="rounded-full bg-ink px-5 py-2.5 text-[14px] font-semibold text-paper">
            {en ? "Try again" : "Reîncearcă"}
          </button>
          {/* A full reload, so nothing of the broken state survives. */}
          <button onClick={() => window.location.assign(window.location.origin)} className="rounded-full border border-ink/20 px-5 py-2.5 text-[14px] font-semibold text-ink">
            {en ? "Start over" : "De la capăt"}
          </button>
        </div>
      </div>
    </div>
  );
}
