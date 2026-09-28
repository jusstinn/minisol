"use client";

import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Tenant } from "@/config/tenant";
import type { ProjectType } from "@/domain/calculators";
import type { Lang } from "@/domain/types";
import { lei } from "@/lib/format";
import { PROJECT_STARTERS, tr } from "@/lib/i18n";
import { ago } from "@/lib/savedSession";
import type { SavedSummary } from "@/lib/savedSession";
import { buildScene } from "../blueprint/builders";
import { IconArrow, IconClose, Logo, PROJECT_ICONS } from "../ui/icons";
import { MicButton } from "../ui/MicButton";
import { Scramble } from "../ui/primitives";
import type { MemberSummary } from "./WalletPass";
import { WalletPass } from "./WalletPass";

const Scene = dynamic(() => import("../blueprint/Scene"), { ssr: false });

const HERO_BUILDS: { type: ProjectType; inputs: Record<string, unknown>; ro: string; en: string; dims: string }[] = [
  { type: "deck", inputs: { lengthM: 4, widthM: 3 }, ro: "Terasă din deck", en: "Garden deck", dims: "4,00 × 3,00 m" },
  { type: "paint_room", inputs: { lengthM: 4, widthM: 3.5, heightM: 2.6 }, ro: "Dormitor, vopsit", en: "Bedroom repaint", dims: "4,00 × 3,50 × 2,60 m" },
  { type: "fence", inputs: { lengthM: 11, heightM: 1.8 }, ro: "Gard din panouri", en: "Panel fence", dims: "11,00 × 1,80 m" },
  { type: "tiling", inputs: { lengthM: 2.5, widthM: 2, roomType: "bathroom" }, ro: "Baie, placată", en: "Bathroom tiling", dims: "2,50 × 2,00 m" },
  { type: "drywall_partition", inputs: { lengthM: 3.5, heightM: 2.6, doors: 1 }, ro: "Perete gips-carton", en: "Drywall partition", dims: "3,50 × 2,60 m" },
  { type: "laminate_floor", inputs: { lengthM: 5, widthM: 4 }, ro: "Parchet în living", en: "Living-room laminate", dims: "5,00 × 4,00 m" },
];

export default function Entry({
  tenant,
  members,
  member,
  fromPass = false,
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
                placeholder={tr("placeholder", lang)}
                className="min-h-[56px] flex-1 resize-none bg-transparent px-3 py-2.5 text-[16px] leading-snug text-ink placeholder:text-ink-3"
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

        {/* right: blueprint sheet + wallet passes */}
        <section className="flex flex-col gap-8 lg:relative lg:block lg:min-h-[640px]">
          <div className="bp-sheet relative h-[360px] overflow-hidden rounded-[26px] shadow-[0_40px_80px_-40px_rgba(10,31,71,0.75)] sm:h-[460px] lg:absolute lg:inset-0 lg:left-10 lg:h-auto">
            <div className="absolute inset-0">
              <Scene build={heroBuild} mode="blueprint" autoRotate compact interactive={false} replayKey={heroIdx} accent={tenant.accent} />
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

          {/* demo: pass stack to pick from · signed pass link: only the member's own pass */}
          <div className="order-first mx-auto w-[min(92%,340px)] lg:absolute lg:-bottom-4 lg:-left-8 lg:order-none lg:mx-0 lg:w-[330px]">
            {fromPass && member ? (
              <>
                <div className="mb-3">
                  <span className="label inline-flex rounded-full bg-card/95 px-2.5 py-1 text-ink-2 shadow-sm">
                    {lang === "en" ? "Your card" : "Cardul tău"} · {tenant.programName}
                  </span>
                </div>
                <WalletPass member={member} tenant={tenant} lang={lang} />
              </>
            ) : (
              <>
                <div className="mb-[104px]">
                  <span className="label inline-flex rounded-full bg-card/95 px-2.5 py-1 text-ink-2 shadow-sm">{tr("pickPass", lang)} ↓</span>
                </div>
                <PassStack members={members} selected={member} tenant={tenant} lang={lang} onSelect={onSelect} />
              </>
            )}
          </div>
        </section>
      </main>

      <Ticker lang={lang} />
    </div>
  );
}

function PassStack({
  members,
  selected,
  tenant,
  lang,
  onSelect,
}: {
  members: MemberSummary[];
  selected?: MemberSummary;
  tenant: Tenant;
  lang: Lang;
  onSelect: (m: MemberSummary) => void;
}) {
  if (!members.length || !selected) return <div className="aspect-[1.58/1] w-full animate-pulse rounded-[18px] bg-paper-3" />;
  const order = [selected, ...members.filter((m) => m.memberId !== selected.memberId)];
  return (
    <div>
      <div className="relative aspect-[1.58/1] w-full">
        {order
          .map((m, pos) => ({ m, pos }))
          .reverse()
          .map(({ m, pos }) => (
            <motion.div
              key={m.memberId}
              className="absolute inset-0 cursor-pointer"
              style={{ zIndex: 10 - pos }}
              initial={false}
              animate={{ x: 0, y: -pos * 30, rotate: 0, scale: 1 - pos * 0.035, opacity: pos > 3 ? 0 : 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
              onClick={() => pos > 0 && onSelect(m)}
              whileHover={pos > 0 ? { y: -pos * 30 - 14 } : undefined}
            >
              <WalletPass member={m} tenant={tenant} lang={lang} tilt={pos === 0} />
            </motion.div>
          ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={selected.memberId}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="mt-4 rounded-xl border border-rule bg-card/85 px-3.5 py-2.5 backdrop-blur"
        >
          <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-3">
            {selected.firstName} · {selected.tier} · {selected.city}
          </div>
          <div className="mt-0.5 text-[13.5px] leading-snug text-ink-2">{lang === "en" ? selected.personaEn : selected.persona}</div>
          {!selected.personalization && (
            <div className="mt-1.5 inline-flex rounded-full bg-ink px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-paper">
              {tr("noPersonalization", lang)}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function TitleBlock({ lang }: { lang: Lang }) {
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
          <span className="px-2 py-1 text-[#e6efff]">{v}</span>
        </div>
      ))}
    </div>
  );
}

function Ticker({ lang }: { lang: Lang }) {
  const items =
    lang === "en"
      ? ["Quantity calculation", "Live store stock", "WalletLoop personal offers", "Step-by-step plan", "3D project blueprint", "7 project types", "Romanian / English", "Tools you own are skipped"]
      : ["Calcul cantități", "Stoc live în magazine", "Oferte personale WalletLoop", "Plan pas cu pas", "Model 3D al proiectului", "7 tipuri de proiecte", "Română / Engleză", "Sculele pe care le ai nu se mai cumpără"];
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
