"use client";

import { useState } from "react";
import type { Tenant } from "@/config/tenant";
import type { Lang } from "@/domain/types";
import { IconArrow, Logo } from "../ui/icons";

/** The site sign-in (src/lib/siteLogin.ts): only invited people reach the demo and its live AI. */
export default function LoginForm({ tenant, next, initialLang = "ro" }: { tenant: Tenant; next: string; initialLang?: Lang }) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"invalid" | "too_many" | "network" | null>(null);
  const en = lang === "en";
  const style = { "--accent": tenant.accent, "--on-accent": tenant.onAccent } as React.CSSProperties;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !user.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user, password, next }) });
      const data = (await res.json().catch(() => ({}))) as { next?: string; error?: string };
      if (!res.ok) {
        setError(res.status === 429 ? "too_many" : "invalid");
        setBusy(false);
        return;
      }
      // Keep a "send to phone" project (#p=…) that was opened before signing in.
      window.location.replace((data.next ?? "/") + window.location.hash);
    } catch {
      setError("network");
      setBusy(false);
    }
  };

  const message =
    error === "invalid"
      ? en
        ? "Wrong user name or password."
        : "Utilizator sau parolă greșită."
      : error === "too_many"
        ? en
          ? "Too many attempts — try again in a few minutes."
          : "Prea multe încercări — mai încearcă în câteva minute."
        : error === "network"
          ? en
            ? "No connection — try again."
            : "Fără conexiune — mai încearcă."
          : null;

  return (
    <div style={style} className="paper-grid relative flex min-h-dvh flex-col">
      <header className="flex items-center gap-3 px-4 pt-4 sm:px-8 sm:pt-6">
        <Logo className="text-ink" />
        <div className="flex items-baseline gap-2">
          <span className="display text-[19px] leading-none">Blueprint</span>
          <span className="label hidden sm:inline">by WalletLoop</span>
        </div>
        <div className="ml-auto flex items-center gap-1 rounded-full border border-rule bg-card/70 p-0.5 font-mono text-[11px] backdrop-blur">
          {(["ro", "en"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              aria-pressed={lang === l}
              className={`rounded-full px-2.5 py-1 uppercase tracking-wider transition ${lang === l ? "bg-ink text-paper" : "text-ink-2 hover:text-ink"}`}
            >
              {l}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1100px] flex-1 grid-cols-1 items-center gap-10 px-4 py-10 sm:px-8 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
        <section>
          <div className="label mb-5 flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
            {en ? "Private demo" : "Demo privat"}
          </div>
          <h1 className="display text-[clamp(38px,6vw,80px)] text-ink">
            {en ? (
              <>
                From an idea to a <span className="text-accent">priced plan</span>, in one conversation
              </>
            ) : (
              <>
                De la idee la un <span className="text-accent">plan cu preț</span>, într-o conversație
              </>
            )}
          </h1>
          <p className="mt-6 max-w-[520px] text-[16.5px] leading-relaxed text-ink-2 sm:text-[18px]">
            {en
              ? "A 3D sketch, the full shopping list with personal offers, stock in every store and a step-by-step plan."
              : "Schiță 3D, lista completă de cumpărături cu ofertele personale, stocul din fiecare magazin și planul pas cu pas."}
          </p>
        </section>

        <form onSubmit={submit} className="w-full rounded-[22px] border border-rule bg-card p-5 shadow-[0_30px_80px_-40px_rgba(20,19,17,0.45)] sm:p-7" noValidate>
          <h2 className="display text-[26px] leading-tight">{en ? "Sign in" : "Autentificare"}</h2>
          <p className="mt-1 text-[13.5px] text-ink-3">{en ? "Access for invited guests." : "Acces pentru invitați."}</p>

          <label className="mt-6 block">
            <span className="label">{en ? "User name" : "Utilizator"}</span>
            <input
              value={user}
              onChange={(e) => setUser(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              className="mt-1.5 h-12 w-full rounded-xl border border-ink/15 bg-paper px-3.5 text-[16px] text-ink outline-none transition focus:border-ink focus:ring-2 focus:ring-accent/40"
            />
          </label>
          <label className="mt-4 block">
            <span className="label">{en ? "Password" : "Parolă"}</span>
            <span className="relative mt-1.5 block">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={show ? "text" : "password"}
                autoComplete="current-password"
                required
                className="h-12 w-full rounded-xl border border-ink/15 bg-paper px-3.5 pr-20 text-[16px] text-ink outline-none transition focus:border-ink focus:ring-2 focus:ring-accent/40"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-ink-2 hover:text-ink"
                aria-pressed={show}
              >
                {show ? (en ? "Hide" : "Ascunde") : en ? "Show" : "Arată"}
              </button>
            </span>
          </label>

          <div aria-live="polite" className="min-h-[24px] pt-3 text-[13px] text-[#b3261e]">
            {message}
          </div>

          <button
            type="submit"
            disabled={busy || !user.trim() || !password}
            className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-[15px] font-semibold text-on-accent transition disabled:bg-paper-3 disabled:text-ink-3"
          >
            {busy ? (en ? "Signing in…" : "Se verifică…") : en ? "Sign in" : "Intră"}
            {!busy && <IconArrow size={16} />}
          </button>
        </form>
      </main>
    </div>
  );
}
