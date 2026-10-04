"use client";

import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Tenant } from "@/config/tenant";
import type { ProjectType } from "@/domain/calculators";
import type { Lang } from "@/domain/types";
import { lei } from "@/lib/format";
import { PROJECT_STARTERS, tr } from "@/lib/i18n";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { ago } from "@/lib/savedSession";
import type { SavedSummary } from "@/lib/savedSession";
import { buildScene } from "../blueprint/builders";
import { IconArrow, IconClose, Logo, PROJECT_ICONS } from "../ui/icons";
import { MicButton } from "../ui/MicButton";
import { Scramble } from "../ui/primitives";
import type { MemberSummary } from "./WalletPass";
import { WalletPass } from "./WalletPass";
import SceneBoundary from "../blueprint/SceneBoundary";

const Scene = dynamic(() => import("../blueprint/Scene"), { ssr: false });

const HERO_BUILDS: { type: ProjectType; inputs: Record<string, unknown>; ro: string; en: string; dims: string }[] = [
  { type: "deck", inputs: { lengthM: 4, widthM: 3 }, ro: "Terasă din deck", en: "Garden deck", dims: "4,00 × 3,00 m" },
  { type: "paint_room", inputs: { lengthM: 4, widthM: 3.5, heightM: 2.6 }, ro: "Dormitor, vopsit", en: "Bedroom repaint", dims: "4,00 × 3,50 × 2,60 m" },
  { type: "fence", inputs: { lengthM: 11, heightM: 1.8 }, ro: "Gard din panouri", en: "Panel fence", dims: "11,00 × 1,80 m" },
  { type: "tiling", inputs: { lengthM: 2.5, widthM: 2, roomType: "bathroom" }, ro: "Baie, placată", en: "Bathroom tiling", dims: "2,50 × 2,00 m" },
  { type: "drywall_partition", inputs: { lengthM: 3.5, heightM: 2.6, doors: 1 }, ro: "Perete gips-carton", en: "Drywall partition", dims: "3,50 × 2,60 m" },
  { type: "laminate_floor", inputs: { lengthM: 5, widthM: 4 }, ro: "Parchet în living", en: "Living-room laminate", dims: "5,00 × 4,00 m" },
  { type: "paving", inputs: { lengthM: 6, widthM: 1.2, use: "path" }, ro: "Alee din pavele", en: "Paver path", dims: "6,00 × 1,20 m" },
];

export default function Entry({
  tenant,
  members,
  member,
  fromPass = false,
  signOut = false,
  membersFailed = false,
  onRetryMembers,
  lang,
  onLang,
  onSelect,
  onStart,
  saved,
  onResume,
  onForget,
}: {
  tenant: Tenant;
  members: MemberSummary[];
  member?: MemberSummary;
  /** Product mode: the member arrived through their signed pass link — show only their pass, no demo picker. */
  fromPass?: boolean;
  /** Site sign-in is on: a "Sign out" link. */
  signOut?: boolean;
  /** The member list couldn't be loaded: show "try again" instead of a loading card. */
  membersFailed?: boolean;
  onRetryMembers?: () => void;
  lang: Lang;
  onLang: (l: Lang) => void;
  onSelect: (m: MemberSummary) => void;
  onStart: (prompt: string) => void;
  /** A project saved in this browser for this member. */
  saved?: SavedSummary | null;
  onResume?: () => void;
  onForget?: () => void;
}) {
  const [wordIdx, setWordIdx] = useState(0);
  const [heroIdx, setHeroIdx] = useState(0);
  const [prompt, setPrompt] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wide = useMediaQuery("(min-width: 640px)", true);
  const words = tr("projects", lang);

  useEffect(() => {
    const id = setInterval(() => setWordIdx((i) => (i + 1) % words.length), 2600);
    return () => clearInterval(id);
  }, [words.length]);
  useEffect(() => {
    const id = setInterval(() => setHeroIdx((i) => (i + 1) % HERO_BUILDS.length), 7800);
    return () => clearInterval(id);
  }, []);

  const hero = HERO_BUILDS[heroIdx];
  const heroBuild = useMemo(() => buildScene(hero.type, hero.inputs, lang), [hero, lang]);
  const [head1, head2] = tr("headline", lang);

  const submit = (text: string) => {
    if (!text.trim() || !member) return;
    onStart(text.trim());
  };

  return (
    <div className="paper-grid relative flex min-h-dvh flex-col overflow-hidden">
      {/* top bar */}
      <header className="relative z-20 flex items-center gap-3 px-4 pt-4 sm:px-8 sm:pt-6">
        <Logo className="text-ink" />
        <div className="flex items-baseline gap-2">
          <span className="display text-[19px] leading-none">Blueprint</span>
          <span className="label hidden sm:inline">by WalletLoop</span>
        </div>
        <span className="ml-2 hidden rounded-full border border-rule px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-2 sm:inline-flex">
          {lang === "en" ? "for" : "pentru"}&nbsp;<b className="font-semibold text-ink">{tenant.name}</b>
        </span>
        {!fromPass && (
          <a
            href={`/pitch?retailer=${tenant.id}&lang=${lang}`}
            className="ml-auto hidden rounded-full px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-2 transition hover:text-ink sm:inline"
          >
            {lang === "en" ? "For retailers →" : "Pentru retaileri →"}
          </a>
        )}
        <div
          className={`flex items-center gap-1 rounded-full border border-rule bg-card/70 p-0.5 font-mono text-[11px] backdrop-blur ${fromPass ? "ml-auto" : "sm:ml-0 max-sm:ml-auto"}`}
        >
          {(["ro", "en"] as const).map((l) => (
            <button
              key={l}
              onClick={() => onLang(l)}
              className={`rounded-full px-2.5 py-1 uppercase tracking-wider transition ${lang === l ? "bg-ink text-paper" : "text-ink-2 hover:text-ink"}`}
            >
              {l}
            </button>
          ))}
        </div>
        {signOut && <AiStatus lang={lang} />}
        {signOut && (
          <a href="/api/logout" className="rounded-full px-2 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-3 transition hover:text-ink">
            {lang === "en" ? "Sign out" : "Ieșire"}
          </a>
        )}
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-[1480px] flex-1 grid-cols-1 gap-10 px-4 pb-10 pt-8 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:pt-14">
        {/* left: message + prompt */}
        <section className="flex flex-col">
          <div className="label mb-5 flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
            {tr("fromWallet", lang)} · {tenant.programName}
          </div>
          <h1 className="display text-[clamp(44px,7.2vw,108px)] text-ink">
            <span className="block">{head1}</span>
            <span className="block min-h-[1em] text-accent">
              <Scramble key={words[wordIdx]} text={words[wordIdx]} />
            </span>
            <span className="mt-3 block text-[0.4em] font-bold tracking-[-0.02em] text-ink-2">{head2}</span>
          </h1>
          <p className="mt-6 max-w-[560px] text-[16.5px] leading-relaxed text-ink-2 sm:text-[18px]">{tr("subhead", lang)}</p>

          {/* a saved project to pick up again */}
          <AnimatePresence>
            {saved && member && onResume && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="mt-8 flex max-w-[640px] items-center gap-3 rounded-[18px] border border-ink/15 bg-card p-3 pl-4 shadow-[0_18px_40px_-28px_rgba(20,19,17,0.5)]"
              >
                <span className="h-10 w-1 shrink-0 rounded-full bg-accent" />
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
                    {lang === "en" ? "Your saved project" : "Proiectul tău salvat"} · {ago(saved.savedAt, lang)}
                  </div>
                  <div className="truncate text-[15.5px] font-semibold text-ink">{saved.title}</div>
                  {saved.total !== undefined && (
                    <div className="font-mono text-[12px] text-ink-2">
                      {lei(saved.total, lang)} · {saved.lines} {lang === "en" ? "items" : "produse"}
                    </div>
                  )}
                </div>
                <button
                  onClick={onResume}
                  className="flex h-10 shrink-0 items-center gap-1.5 rounded-[12px] bg-ink px-3.5 text-[13.5px] font-semibold text-paper transition hover:bg-accent hover:text-on-accent"
                >
                  {lang === "en" ? "Continue" : "Continuă"} <IconArrow size={16} />
                </button>
                {onForget && (
                  <button onClick={onForget} title={lang === "en" ? "Forget this project" : "Șterge proiectul salvat"} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-3 transition hover:bg-ink/5 hover:text-ink">
                    <IconClose size={14} />
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* prompt */}
          <div className={`group relative max-w-[640px] ${saved && member ? "mt-4" : "mt-8"}`}>
            <div className="absolute -inset-px rounded-[20px] bg-gradient-to-r from-accent/60 via-accent/10 to-transparent opacity-0 blur transition group-focus-within:opacity-100" />
            <div className="relative flex items-end gap-2 rounded-[18px] border border-ink/15 bg-card p-2 shadow-[0_18px_40px_-24px_rgba(20,19,17,0.5)]">
              <textarea
                ref={inputRef}
                rows={2}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit(prompt);
                  }
                }}
                placeholder={tr(wide ? "placeholder" : "placeholderShort", lang)}
                className="min-h-[88px] flex-1 resize-none bg-transparent px-3 py-2.5 text-[16px] leading-snug text-ink placeholder:text-ink-3 sm:min-h-[56px]"
              />
              <MicButton lang={lang} value={prompt} onChange={setPrompt} className="h-12 w-12" />
              <button
                onClick={() => submit(prompt)}
                disabled={!prompt.trim() || !member}
                className="flex h-12 items-center gap-2 rounded-[14px] bg-ink px-4 text-[14px] font-semibold text-paper transition enabled:hover:bg-accent enabled:hover:text-on-accent disabled:opacity-30"
              >
                {tr("start", lang)} <IconArrow size={18} />
              </button>
            </div>
          </div>

          {/* starters */}
          <div className="mt-5 flex max-w-[680px] flex-wrap gap-2">
            {PROJECT_STARTERS.map((s, i) => {
              const Icon = PROJECT_ICONS[s.icon];
              return (
                <motion.button
                  key={s.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.05, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  onClick={() => submit(lang === "en" ? s.promptEn : s.promptRo)}
                  className="group/chip flex items-center gap-2 rounded-full border border-ink/15 bg-card/80 py-1.5 pl-2 pr-3.5 text-[13.5px] text-ink-2 backdrop-blur transition hover:-translate-y-0.5 hover:border-ink hover:bg-ink hover:text-paper"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-paper-2 text-ink transition group-hover/chip:bg-accent group-hover/chip:text-on-accent">
                    {Icon && <Icon size={16} />}
                  </span>
                  {lang === "en" ? s.en : s.ro}
                </motion.button>
              );
            })}
          </div>

          {/* who is asking: the demo members to pick from · a signed pass link: only the member's own card */}
          <MemberPicker
            members={members}
            selected={member}
            tenant={tenant}
            lang={lang}
            onSelect={onSelect}
            fromPass={fromPass}
            failed={membersFailed}
            onRetry={onRetryMembers}
          />

          <p className="mt-8 max-w-[560px] font-mono text-[11px] leading-relaxed text-ink-3">
            <span className="text-ink-2">{tr("aiIntro", lang)}</span> {tr("privacy", lang)}
          </p>
          {tenant.id !== "demo" && (
            <p className="mt-2 max-w-[560px] font-mono text-[11px] leading-relaxed text-ink-3">
              {lang === "en"
                ? `Concept demo by WalletLoop — not an official ${tenant.name} service. Catalogue, prices and stock are fictional.`
                : `Demo conceptual WalletLoop — nu este un serviciu oficial ${tenant.name}. Catalogul, prețurile și stocurile sunt fictive.`}
            </p>
          )}
        </section>

        {/* right: the blueprint sheet, uncovered */}
        <section className="lg:relative lg:min-h-[640px]">
          <div className="bp-sheet relative h-[360px] overflow-hidden rounded-[26px] shadow-[0_40px_80px_-40px_rgba(10,31,71,0.75)] sm:h-[460px] lg:absolute lg:inset-0 lg:h-auto">
            <div className="absolute inset-0">
              <SceneBoundary resetKey={heroIdx} en={lang === "en"} dark>
                <Scene build={heroBuild} mode="blueprint" autoRotate compact interactive={false} replayKey={heroIdx} accent={tenant.accent} />
              </SceneBoundary>
            </div>
            <div className="pointer-events-none absolute left-5 top-5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-[#b9d0f7] sm:left-7 sm:top-6">
              <AnimatePresence mode="wait">
                <motion.div key={heroIdx} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.35 }}>
                  <div>FIG. {String(heroIdx + 1).padStart(2, "0")} — {lang === "en" ? hero.en : hero.ro}</div>
                  <div className="mt-1 text-[#e6efff]">{hero.dims}</div>
                </motion.div>
              </AnimatePresence>
            </div>
            <TitleBlock lang={lang} />
          </div>

        </section>
      </main>

      <Ticker lang={lang} />
    </div>
  );
}

/**
 * Whose loyalty card the demo runs as: a row of compact cards (the selected one ringed), and the
 * member's story underneath. With a signed pass link there is nothing to pick — just their card.
 */
function MemberPicker({
  members,
  selected,
  tenant,
  lang,
  onSelect,
  fromPass,
  failed,
  onRetry,
}: {
  members: MemberSummary[];
  selected?: MemberSummary;
  tenant: Tenant;
  lang: Lang;
  onSelect: (m: MemberSummary) => void;
  fromPass: boolean;
  failed: boolean;
  onRetry?: () => void;
}) {
  const en = lang === "en";
  if (failed) {
    return (
      <div className="mt-7 flex max-w-[680px] items-center gap-3 rounded-xl border border-dashed border-ink/20 bg-card/70 px-4 py-3">
        <p className="flex-1 text-[13.5px] text-ink-2">{en ? "Couldn't load the loyalty cards." : "Nu am putut încărca cardurile de fidelitate."}</p>
        <button onClick={onRetry} className="rounded-full bg-ink px-3.5 py-1.5 text-[12.5px] font-semibold text-paper">
          {en ? "Try again" : "Reîncearcă"}
        </button>
      </div>
    );
  }
  const shown = fromPass ? (selected ? [selected] : []) : members;
  return (
    <div className="mt-7 max-w-[680px]">
      <div className="label mb-2">{fromPass ? `${en ? "Your card" : "Cardul tău"} · ${tenant.programName}` : tr("pickPass", lang)}</div>
      {!shown.length ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[46px] animate-pulse rounded-xl bg-paper-3" />
          ))}
        </div>
      ) : (
        <div role={fromPass ? undefined : "radiogroup"} aria-label={tr("pickPass", lang)} className={`grid gap-2 ${fromPass ? "max-w-[260px] grid-cols-1" : "grid-cols-2 sm:grid-cols-4"}`}>
          {shown.map((m) => {
            const on = m.memberId === selected?.memberId;
            return (
              <button
                key={m.memberId}
                role={fromPass ? undefined : "radio"}
                aria-checked={fromPass ? undefined : on}
                disabled={fromPass}
                onClick={() => onSelect(m)}
                className={`rounded-xl text-left transition ${on ? "ring-2 ring-accent ring-offset-2 ring-offset-paper" : "opacity-60 hover:-translate-y-0.5 hover:opacity-100"}`}
              >
                <WalletPass member={m} tenant={tenant} lang={lang} compact />
              </button>
            );
          })}
        </div>
      )}
      <AnimatePresence mode="wait">
        {selected && (
          <motion.p key={selected.memberId} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-2.5 text-[13px] leading-snug text-ink-3">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.14em]">
              {selected.firstName} · {selected.city}
            </span>
            {(en ? selected.personaEn : selected.persona) && <> — {en ? selected.personaEn : selected.persona}</>}
            {!selected.personalization && (
              <span className="ml-1.5 inline-flex rounded-full bg-ink px-2 py-0.5 align-middle font-mono text-[10px] uppercase tracking-wider text-paper">{tr("noPersonalization", lang)}</span>
            )}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function TitleBlock({ lang }: { lang: Lang }) {
  // The server may be on another day than the visitor (UTC vs Romania): the date cell is allowed to differ.
  const date = new Date().toLocaleDateString(lang === "en" ? "en-GB" : "ro-RO");
  // Deliberately NOT a technical-drawing title block: this is an indicative sketch.
  const rows: [string, string][] = [
    [lang === "en" ? "Type" : "Tip", lang === "en" ? "Indicative sketch" : "Schiță orientativă"],
    [lang === "en" ? "From" : "Din", lang === "en" ? "your dimensions" : "dimensiunile tale"],
    [lang === "en" ? "Date" : "Data", date],
  ];
  return (
    <div className="pointer-events-none absolute bottom-5 right-5 hidden border border-[#dce9ff]/40 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[#c7d9fa] sm:block">
      {rows.map(([k, v]) => (
        <div key={k} className="flex border-b border-[#dce9ff]/25 last:border-b-0">
          <span className="w-20 border-r border-[#dce9ff]/25 px-2 py-1 text-[#8fb0e8]">{k}</span>
          <span className="px-2 py-1 text-[#e6efff]" suppressHydrationWarning>
            {v}
          </span>
        </div>
      ))}
    </div>
  );
}

function Ticker({ lang }: { lang: Lang }) {
  const items =
    lang === "en"
      ? ["Quantity calculation", "Live store stock", "WalletLoop personal offers", "Step-by-step plan", "3D project blueprint", "8 project types", "Romanian / English", "Tools you own are skipped"]
      : ["Calcul cantități", "Stoc live în magazine", "Oferte personale WalletLoop", "Plan pas cu pas", "Model 3D al proiectului", "8 tipuri de proiecte", "Română / Engleză", "Sculele pe care le ai nu se mai cumpără"];
  const row = [...items, ...items];
  return (
    <div className="relative z-10 overflow-hidden border-y border-ink/10 bg-ink py-2.5 text-paper">
      <div className="marquee flex w-max gap-10 whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.18em]">
        {row.map((t, i) => (
          <span key={i} className="flex items-center gap-10">
            {t}
            <span className="text-accent">✕</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Behind the site sign-in (a demo): is the live AI ready? Checked once on the start screen, so the
 * presenter knows before the first question (/api/health — no tokens spent).
 */
function AiStatus({ lang }: { lang: Lang }) {
  const [ai, setAi] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { ai?: string } | null) => alive && setAi(d?.ai ?? "unreachable"))
      .catch(() => alive && setAi("unreachable"));
    return () => {
      alive = false;
    };
  }, []);
  if (!ai) return null;
  const en = lang === "en";
  const live = ai === "live";
  const why: Record<string, [string, string]> = {
    not_configured: ["fără cheie OpenAI", "no OpenAI key"],
    key_invalid: ["cheia OpenAI nu e validă", "OpenAI key invalid"],
    model_unavailable: ["modelul nu e disponibil", "model unavailable"],
    rate_limited: ["limită OpenAI atinsă", "OpenAI rate limit"],
    unreachable: ["OpenAI nu răspunde", "OpenAI unreachable"],
    off: ["mod offline", "offline mode"],
  };
  return (
    <span
      title={live ? (en ? "The live AI is ready" : "AI-ul live e pregătit") : `${en ? "Offline assistant only" : "Doar asistentul offline"}: ${why[ai]?.[en ? 1 : 0] ?? ai}`}
      className="flex items-center gap-1.5 rounded-full border border-rule px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-2"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-ok" : "bg-accent"}`} />
      <span className="hidden sm:inline">{live ? "AI live" : en ? "AI offline" : "AI offline"}</span>
    </span>
  );
}
