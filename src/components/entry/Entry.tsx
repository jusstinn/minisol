"use client";

import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Tenant } from "@/config/tenant";
import type { ProjectType } from "@/domain/calculators";
import type { Lang } from "@/domain/types";
import { PROJECT_STARTERS, tr } from "@/lib/i18n";
import { buildScene } from "../blueprint/builders";
import { IconArrow, Logo, PROJECT_ICONS } from "../ui/icons";
import { MicButton } from "../ui/MicButton";
import type { MemberSummary } from "./WalletPass";
import ModelImport from "./ModelImport";

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
  member,
  lang,
  onLang,
  onStart,
}: {
  tenant: Tenant;
  member?: MemberSummary;
  lang: Lang;
  onLang: (l: Lang) => void;
  onStart: (prompt: string) => void;
}) {
  const [heroIdx, setHeroIdx] = useState(0);
  const [prompt, setPrompt] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const id = setInterval(() => setHeroIdx((i) => (i + 1) % HERO_BUILDS.length), 7800);
    return () => clearInterval(id);
  }, []);

  const hero = HERO_BUILDS[heroIdx];
  const heroBuild = useMemo(() => buildScene(hero.type, hero.inputs, lang), [hero, lang]);
  const submit = (text: string) => {
    if (!text.trim() || !member) return;
    onStart(text.trim());
  };

  return (
    <div className="paper-grid relative flex min-h-dvh flex-col overflow-x-clip">
      {tenant.id === "hornbach" && (
        <div className="hornbach-store-strip">
          <span>{lang === "en" ? "Is Domnești, Ilfov your preferred store?" : "Magazinul Domnești, jud. Ilfov este cel potrivit?"}</span>
          <button>{lang === "en" ? "YES" : "DA"}</button>
          <span className="underline">{lang === "en" ? "No, change store" : "Nu, schimbă magazinul"}</span>
        </div>
      )}
      {/* top bar */}
      <header className="retail-header relative z-20 flex items-center gap-3 px-4 py-4 sm:px-8 sm:py-5">
        {tenant.id === "hornbach" ? (
          <Image
            className="hornbach-logo"
            src="https://media.hornbach.ro/webshop-commons/649/images/logo.ro-RO.v1.svg"
            width={283}
            height={72}
            alt="HORNBACH"
            unoptimized
          />
        ) : <Logo className="text-ink" />}
        <div className="flex flex-col gap-0.5">
          <span className="display text-[20px] leading-none">{tenant.id === "hornbach" ? (lang === "en" ? "Project Guide" : "Ghidul de proiect") : "Blueprint"}</span>
          <span className="label hidden sm:inline">{lang === "en" ? "Simple planning, step by step" : "Planificare simplă, pas cu pas"}</span>
        </div>
        {tenant.id !== "hornbach" && (
          <span className="ml-2 hidden rounded-full border border-rule px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-2 sm:inline-flex">
            {lang === "en" ? "for" : "pentru"}&nbsp;<b className="font-semibold text-ink">{tenant.name}</b>
          </span>
        )}
        <div className="language-switch ml-auto flex items-center gap-1 rounded-full border border-rule bg-card/70 p-0.5 font-mono text-[11px] backdrop-blur">
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
      {tenant.id === "hornbach" && (
        <nav className="hornbach-nav-row" aria-label={lang === "en" ? "Main navigation" : "Navigare principală"}>
          <span>{lang === "en" ? "RANGE" : "SORTIMENT"}</span>
          <span>{lang === "en" ? "PROJECTS" : "PROIECTE"}</span>
          <span className="hidden sm:inline">{lang === "en" ? "MY STORE" : "MAGAZINUL MEU"}</span>
          <button className="hornbach-search" onClick={() => inputRef.current?.focus()}>
            <span>{lang === "en" ? "What project do you want to build?" : "Ce proiect vrei să realizezi?"}</span>
            <span aria-hidden>⌕</span>
          </button>
          <span className="hidden lg:inline">{lang === "en" ? "MY ACCOUNT" : "CONTUL MEU"}</span>
          <span className="hidden xl:inline">♡ {lang === "en" ? "FAVORITES" : "LISTELE MELE"}</span>
        </nav>
      )}

      <main className="relative z-10 mx-auto grid w-full max-w-[1280px] flex-1 grid-cols-1 gap-10 px-4 pb-10 pt-8 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:pt-10">
        {/* left: message + prompt */}
        <section className="flex flex-col">
          <h1 className="display max-w-[720px] text-[clamp(42px,6.2vw,88px)] text-ink">
            {lang === "en" ? "What would you like to build?" : "Ce vrei să construiești?"}
          </h1>
          <p className="mt-5 max-w-[610px] text-[16.5px] leading-relaxed text-ink-2 sm:text-[18px]">
            {lang === "en"
              ? "Choose a common project or describe your own. We’ll use your measurements to suggest a design direction and an indicative shopping list."
              : "Alege un proiect obișnuit sau descrie-l pe al tău. Folosim măsurătorile tale pentru a propune o direcție de design și o listă orientativă de cumpărături."}
          </p>

          <JourneyPreview lang={lang} />

          <div className="mt-7 max-w-[680px]">
            <div className="mb-3 flex items-center justify-between gap-4">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink">
                {lang === "en" ? "Choose a project" : "Alege un proiect"}
              </span>
              <span className="text-[12.5px] text-ink-3">{lang === "en" ? "or write your own below" : "sau descrie-l mai jos"}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PROJECT_STARTERS.map((s, i) => {
                const Icon = PROJECT_ICONS[s.icon];
                return (
                  <motion.button
                    key={s.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 + i * 0.04, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    onClick={() => submit(lang === "en" ? s.promptEn : s.promptRo)}
                    className="project-card group/chip flex min-h-16 items-center gap-3 rounded-2xl border border-ink/15 bg-card/85 p-3 text-left text-[13.5px] font-medium text-ink transition hover:-translate-y-0.5 hover:border-ink hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-paper-2 text-ink transition group-hover/chip:bg-accent group-hover/chip:text-on-accent">
                      {Icon && <Icon size={19} />}
                    </span>
                    {lang === "en" ? s.en : s.ro}
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* prompt */}
          <div className="group relative mt-6 max-w-[680px]">
            <label htmlFor="project-description" className="mb-2 block font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink">
              {lang === "en" ? "Describe your project" : "Descrie proiectul tău"}
            </label>
            <div className="absolute -inset-px rounded-[20px] bg-gradient-to-r from-accent/60 via-accent/10 to-transparent opacity-0 blur transition group-focus-within:opacity-100" />
            <div className="project-input relative flex items-end gap-2 rounded-[18px] border border-ink/15 bg-card p-2 shadow-[0_18px_40px_-24px_rgba(20,19,17,0.5)]">
              <textarea
                id="project-description"
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
                className="primary-action flex h-12 items-center gap-2 rounded-[14px] bg-ink px-4 text-[14px] font-semibold text-paper transition enabled:hover:bg-accent enabled:hover:text-on-accent disabled:opacity-30"
              >
                {tr("start", lang)} <IconArrow size={18} />
              </button>
            </div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
              {lang === "en" ? "Include measurements if you know them. If not, we’ll guide you." : "Adaugă dimensiunile dacă le știi. Dacă nu, te ghidăm noi."}
            </p>
          </div>

          <ModelImport lang={lang} onStart={submit} />

          <p className="mt-8 max-w-[560px] font-mono text-[11px] leading-relaxed text-ink-3">{tr("privacy", lang)}</p>
          {tenant.id !== "demo" && (
            <p className="mt-2 max-w-[560px] font-mono text-[11px] leading-relaxed text-ink-3">
              {lang === "en"
                ? `Concept demo by WalletLoop — not an official ${tenant.name} service. Catalogue, prices and stock are fictional.`
                : `Demo conceptual WalletLoop — nu este un serviciu oficial ${tenant.name}. Catalogul, prețurile și stocurile sunt fictive.`}
            </p>
          )}
        </section>

        {/* right: project visual */}
        <section className="flex flex-col gap-8 lg:relative lg:block lg:min-h-[640px]">
          <div className="blueprint-hero bp-sheet relative h-[360px] overflow-hidden rounded-[26px] shadow-[0_40px_80px_-40px_rgba(10,31,71,0.75)] sm:h-[460px] lg:absolute lg:inset-0 lg:left-10 lg:h-auto">
            <div className="absolute inset-0">
              <Scene build={heroBuild} mode="blueprint" autoRotate={false} compact interactive={false} replayKey={heroIdx} accent={tenant.accent} />
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
    </div>
  );
}

function JourneyPreview({ lang }: { lang: Lang }) {
  const steps = lang === "en" ? ["Your idea", "Measurements", "Design estimate"] : ["Ideea ta", "Măsurători", "Estimare de design"];
  return (
    <ol aria-label={lang === "en" ? "How it works" : "Cum funcționează"} className="journey-shell mt-6 flex max-w-[680px] items-center rounded-2xl border border-rule bg-card/65 p-3">
      {steps.map((step, i) => (
        <li key={step} className="flex min-w-0 flex-1 items-center">
          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold ${i === 0 ? "bg-accent text-on-accent" : "bg-paper-2 text-ink-2"}`}>
            {i + 1}
          </span>
          <span className="ml-2 hidden text-[12px] font-medium text-ink-2 sm:block">{step}</span>
          {i < steps.length - 1 && <span className="mx-2 h-px flex-1 bg-rule" />}
        </li>
      ))}
    </ol>
  );
}

function TitleBlock({ lang }: { lang: Lang }) {
  const date = new Date().toLocaleDateString(lang === "en" ? "en-GB" : "ro-RO");
  const rows: [string, string][] = [
    [lang === "en" ? "Document" : "Document", lang === "en" ? "Concept sketch" : "Schiță conceptuală"],
    [lang === "en" ? "Scale" : "Scara", "1:50"],
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
