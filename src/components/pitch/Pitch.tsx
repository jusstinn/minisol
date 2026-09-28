"use client";

import { motion } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { Tenant } from "@/config/tenant";
import type { Lang } from "@/domain/types";
import { int, lei } from "@/lib/format";
import { buildScene } from "../blueprint/builders";
import { IconArrow, IconCheck, IconLayers, IconPin, IconSpark, IconTag, IconWallet, IconWarn, Logo, PROJECT_ICONS } from "../ui/icons";
import { Counter } from "../ui/primitives";

const Scene = dynamic(() => import("../blueprint/Scene"), { ssr: false });

export interface ProjectExample {
  id: string;
  icon: string;
  labelRo: string;
  labelEn: string;
  products: number;
  total: number;
  hours: string;
}

const ease = [0.16, 1, 0.3, 1] as const;
const reveal = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.8, ease },
};

export default function Pitch({ tenant, lang, examples }: { tenant: Tenant; lang: Lang; examples: ProjectExample[] }) {
  const L = (ro: string, en: string) => (lang === "en" ? en : ro);
  const style = { "--accent": tenant.accent, "--on-accent": tenant.onAccent } as React.CSSProperties;
  const demoHref = `/?retailer=${tenant.id}${lang === "en" ? "&member=WL-RO-309877" : ""}`;
  const [heroIdx, setHeroIdx] = useState(0);
  const heroes = useMemo(
    () => [
      buildScene("deck", { lengthM: 4, widthM: 3 }, lang),
      buildScene("tiling", { lengthM: 2.5, widthM: 2, roomType: "bathroom" }, lang),
      buildScene("fence", { lengthM: 11, heightM: 1.8 }, lang),
    ],
    [lang],
  );
  useEffect(() => {
    const id = setInterval(() => setHeroIdx((i) => (i + 1) % heroes.length), 7000);
    return () => clearInterval(id);
  }, [heroes.length]);
  const avgBasket = examples.length ? Math.round(examples.reduce((s, e) => s + e.total, 0) / examples.length) : 2500;
  const maxProducts = Math.max(...examples.map((e) => e.products), 1);

  return (
    <div style={style} className="paper-grid min-h-dvh text-ink">
      {/* nav */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-rule bg-paper/80 px-4 py-3 backdrop-blur sm:px-8">
        <Logo />
        <span className="display text-[18px] leading-none">Blueprint</span>
        <span className="label hidden sm:inline">by WalletLoop</span>
        <span className="ml-2 hidden rounded-full border border-rule px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-2 md:inline">
          {L("propunere pentru", "proposal for")} <b className="text-ink">{tenant.name}</b>
        </span>
        <div className="ml-auto flex items-center gap-2">
          <a href={`/pitch?retailer=${tenant.id}&lang=${lang === "en" ? "ro" : "en"}`} className="rounded-full border border-rule px-3 py-1.5 font-mono text-[11px] uppercase">
            {lang === "en" ? "RO" : "EN"}
          </a>
          <a href={demoHref} className="flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-paper transition hover:bg-accent hover:text-on-accent">
            {L("Demo live", "Live demo")} <IconArrow size={16} />
          </a>
        </div>
      </header>

      {/* hero */}
      <section className="mx-auto grid max-w-[1400px] gap-10 px-4 pb-20 pt-14 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:pt-24">
        <div>
          <motion.div {...reveal} className="label mb-6 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" /> {L("Agentul de proiecte pentru retail DIY", "The project agent for DIY retail")}
          </motion.div>
          <motion.h1 {...reveal} className="display text-[clamp(44px,6.6vw,104px)]">
            {L("Clienții nu cumpără produse.", "Customers don't buy products.")}
            <span className="block text-accent">{L("Cumpără proiecte.", "They buy projects.")}</span>
          </motion.h1>
          <motion.p {...reveal} transition={{ ...reveal.transition, delay: 0.15 }} className="mt-7 max-w-[600px] text-[18px] leading-relaxed text-ink-2">
            {L(
              `Blueprint transformă „vreau o terasă” într-un coș complet, calculat la bucată, cu prețul personal al membrului, pe stoc în magazinul lui — direct din cardul ${tenant.programName} din Wallet.`,
              `Blueprint turns “I want a deck” into a complete basket — quantities to the piece, the member's personal price, in stock at their store — straight from their ${tenant.programName} wallet pass.`,
            )}
          </motion.p>
          <motion.div {...reveal} transition={{ ...reveal.transition, delay: 0.25 }} className="mt-9 flex flex-wrap gap-3">
            <a href={demoHref} className="flex items-center gap-2 rounded-2xl bg-accent px-5 py-3.5 text-[15px] font-semibold text-on-accent shadow-[0_18px_40px_-20px_var(--accent)]">
              {L("Încearcă demo-ul", "Try the demo")} <IconArrow size={18} />
            </a>
            <a href="#roi" className="rounded-2xl border border-ink/20 px-5 py-3.5 text-[15px] font-semibold">
              {L("Calculează impactul", "Estimate the impact")}
            </a>
          </motion.div>
        </div>
        <motion.div {...reveal} transition={{ ...reveal.transition, delay: 0.2 }} className="bp-sheet relative h-[420px] overflow-hidden rounded-[28px] shadow-[0_50px_90px_-50px_rgba(10,31,71,0.9)] lg:h-[560px]">
          <Scene build={heroes[heroIdx]} mode="blueprint" autoRotate compact interactive={false} replayKey={heroIdx} accent={tenant.accent} />
          <div className="pointer-events-none absolute bottom-5 left-6 font-mono text-[10.5px] uppercase tracking-[0.16em] text-[#c7d9fa]">
            {L("Schiță orientativă din dimensiunile clientului — nu proiect tehnic", "Indicative sketch from the customer's dimensions — not a technical plan")}
          </div>
        </motion.div>
      </section>

      {/* real numbers */}
      <section className="border-y border-rule bg-card/70 py-20">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-8">
          <SectionTitle index="01" title={L("Un proiect = o listă lungă", "One project = a long list")} />
          <motion.p {...reveal} className="mt-4 max-w-[760px] text-[17px] leading-relaxed text-ink-2">
            {L(
              "Clientul știe ce vrea să construiască, nu și ce trebuie să cumpere. Cifrele de mai jos sunt calculate live de motorul Blueprint, pe catalogul demo:",
              "Customers know what they want to build — not everything they need to buy. The numbers below are computed live by the Blueprint engine on the demo catalogue:",
            )}
          </motion.p>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {examples.map((e, i) => {
              const Icon = PROJECT_ICONS[e.icon];
              return (
                <motion.div
                  key={e.id}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.06, duration: 0.7, ease }}
                  className="rounded-2xl border border-rule bg-paper p-5"
                >
                  <div className="flex items-center gap-2 text-ink-2">
                    {Icon && <Icon size={18} />}
                    <span className="text-[14px] font-semibold text-ink">{lang === "en" ? e.labelEn : e.labelRo}</span>
                  </div>
                  <div className="mt-5 flex items-baseline gap-2">
                    <span className="display text-[52px] leading-none">{e.products}</span>
                    <span className="font-mono text-[11px] uppercase tracking-wider text-ink-3">{L("produse", "products")}</span>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-paper-3">
                    <motion.div
                      initial={{ width: 0 }}
                      whileInView={{ width: `${(e.products / maxProducts) * 100}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 1.1, delay: 0.2 + i * 0.06, ease }}
                      className="h-full bg-accent"
                    />
                  </div>
                  <div className="mt-3 flex justify-between font-mono text-[11px] text-ink-2">
                    <span>{lei(e.total, lang)}</span>
                    <span>
                      {e.hours} {L("ore", "h")}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
          <motion.div {...reveal} className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              [L("Coș incomplet", "Incomplete baskets"), L("Lipsesc folia, șuruburile, amorsa — clientul revine sau cumpără de la concurență.", "The underlay, screws or primer get forgotten — the customer comes back later, or buys them elsewhere.")],
              [L("Timp de consultanță", "Advice time"), L("„Cât îmi trebuie?” e cea mai frecventă întrebare pe culoar — și cea mai scumpă ca timp de personal.", "“How much do I need?” is the most common question in the aisle — and the most expensive in staff time.")],
              [L("Oferte generice", "Generic promotions"), L("Reducerile nu știu ce proiect are clientul și ce scule are deja acasă.", "Discounts don't know which project the customer has or which tools they already own.")],
            ].map(([t, d]) => (
              <div key={t} className="rounded-2xl border border-dashed border-ink/20 p-5">
                <div className="flex items-center gap-2 text-[15px] font-semibold">
                  <IconWarn size={16} className="text-accent" /> {t}
                </div>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{d}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* how it works */}
      <section className="mx-auto max-w-[1400px] px-4 py-24 sm:px-8">
        <SectionTitle index="02" title={L("Cum funcționează", "How it works")} />
        <div className="relative mt-12 grid gap-6 md:grid-cols-4">
          <motion.span
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.6, ease }}
            className="absolute left-0 right-0 top-7 hidden h-px origin-left bg-ink/25 md:block"
          />
          {[
            [<IconWallet key="w" size={22} />, L("Tap pe card", "Tap the pass"), L("Linkul de pe cardul din Wallet deschide Blueprint — membrul e deja recunoscut, fără login, fără aplicație.", "A link on the wallet pass opens Blueprint — the member is already known. No login, no app install.")],
            [<IconSpark key="s" size={22} />, L("Descrie proiectul", "Describe the project"), L("Text sau voce, în română sau engleză. Agentul cere doar dimensiunile care lipsesc.", "Text or voice, Romanian or English. The agent only asks for missing dimensions.")],
            [<IconLayers key="l" size={22} />, L("Blueprint desenează", "Blueprint draws it"), L("Model 3D, cantități calculate determinist, prețul personal, stoc pe magazine, plan pas cu pas.", "3D model, deterministic quantities, personal price, store stock, a step-by-step plan.")],
            [<IconPin key="p" size={22} />, L("Ridică din magazin", "Pick up in store"), L("Lista pe spatele cardului, sortată pe culoare, QR la casă, notificare lângă magazin.", "The list on the back of the pass, sorted by aisle, a QR at the till, a nudge near the store.")],
          ].map(([icon, t, d], i) => (
            <motion.div
              key={String(t)}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 + i * 0.15, duration: 0.7, ease }}
              className="relative"
            >
              <div className="relative z-10 grid h-14 w-14 place-items-center rounded-2xl bg-ink text-paper">{icon}</div>
              <div className="mt-4 font-mono text-[11px] text-ink-3">0{i + 1}</div>
              <div className="display mt-1 text-[24px]">{t}</div>
              <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">{d}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* trust */}
      <section className="bp-sheet py-24">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-8">
          <SectionTitle index="03" title={L("De ce poți avea încredere în el", "Why you can trust it")} dark />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              [L("Fiecare sumă e verificată", "Every amount is verified"), L("Modelul AI nu face calcule. Cantitățile, prețurile, ofertele și punctele vin din motorul de prețuri; fiecare sumă din răspuns e verificată automat.", "The AI never does maths. Quantities, prices, offers and points come from the pricing engine; every amount in a reply is checked automatically.")],
              [L("Știe ce ai deja", "Knows what you own"), L("Istoricul WalletLoop scoate din listă sculele cumpărate deja — clientul simte că e recunoscut.", "WalletLoop history drops tools the member already bought — it feels like being recognised.")],
              [L("Stoc real, pe magazine", "Real stock, per store"), L("Dacă lipsește ceva, propune magazinul apropiat care are tot, alternative sau livrare.", "If something is short, it suggests the nearby store that has everything, alternatives or delivery.")],
              [L("GDPR by design", "GDPR by design"), L("Modelul vede nivelul, punctele și interesele — niciodată nume, e-mail sau telefon. Fără consimțământ, fără personalizare.", "The model sees tier, points and interests — never name, email or phone. No consent, no personalisation.")],
              [L("Siguranță", "Safety"), L("Electrice, gaz, pereți portanți, acoperiș → trimite la profesioniști autorizați, cu instalatorii recomandați de voi.", "Electrics, gas, load-bearing walls, roofs → routed to licensed professionals — your recommended installers.")],
              [L("White-label, multi-retailer", "White-label, multi-retailer"), L("Același produs, brandul vostru: nume, culori, magazine, program de fidelitate — o singură configurație.", "One product, your brand: name, colours, stores, loyalty programme — a single config.")],
            ].map(([t, d], i) => (
              <motion.div
                key={t}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07, duration: 0.7, ease }}
                className="rounded-2xl border border-[#dce9ff]/25 bg-[#0a1f47]/50 p-6 backdrop-blur"
              >
                <IconCheck size={20} className="text-accent" />
                <div className="mt-3 text-[17px] font-semibold text-white">{t}</div>
                <p className="mt-2 text-[14px] leading-relaxed text-[#c7d9fa]">{d}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <Roi lang={lang} avgBasket={avgBasket} />

      {/* integration */}
      <section className="border-t border-rule bg-card/70 py-24">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-8">
          <SectionTitle index="05" title={L("Integrare", "Integration")} />
          <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_1.2fr]">
            <div className="space-y-3">
              {[
                [L("Catalog", "Catalogue"), L("API-ul de produse + o etichetă de „rol” per produs (ex. deck_board).", "Product API + one “role” tag per product (e.g. deck_board).")],
                [L("Stoc", "Inventory"), L("Stoc per magazin, interogat în batch.", "Per-store stock, batch lookup.")],
                [L("Magazine", "Stores"), L("Lista magazinelor, coordonate, program, culoare.", "Store list, coordinates, hours, aisles.")],
                ["WalletLoop", L("Membri, niveluri, puncte, oferte, card — deja integrat.", "Members, tiers, points, offers, pass — already integrated.")],
              ].map(([t, d]) => (
                <div key={t} className="flex items-start gap-4 rounded-2xl border border-rule bg-paper p-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink font-mono text-[11px] text-paper">API</span>
                  <div>
                    <div className="text-[15px] font-semibold">{t}</div>
                    <div className="text-[13.5px] text-ink-2">{d}</div>
                  </div>
                </div>
              ))}
            </div>
            <div>
              <div className="label mb-4">{L("Plan pilot · 6 săptămâni", "Pilot plan · 6 weeks")}</div>
              {[
                [L("Adaptoare date + etichetare roluri", "Data adapters + role tagging"), 0, 2],
                [L("Branding + conținut proiecte", "Branding + project content"), 1, 2],
                [L("Pilot într-un magazin", "Pilot in one store"), 3, 1],
                [L("Test A/B coș & conversie", "A/B test basket & conversion"), 3, 3],
              ].map(([t, start, len], i) => (
                <div key={String(t)} className="mb-3">
                  <div className="mb-1 text-[13.5px]">{t}</div>
                  <div className="relative h-7 rounded-lg bg-paper-2">
                    <motion.div
                      initial={{ width: 0 }}
                      whileInView={{ width: `${(Number(len) / 6) * 100}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.9, delay: 0.2 + i * 0.15, ease }}
                      className="absolute top-0 h-full rounded-lg bg-ink"
                      style={{ left: `${(Number(start) / 6) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
              <div className="mt-2 flex justify-between font-mono text-[10px] text-ink-3">
                {[1, 2, 3, 4, 5, 6].map((w) => (
                  <span key={w}>
                    {L("S", "W")}
                    {w}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* cta */}
      <section className="mx-auto max-w-[1400px] px-4 py-24 text-center sm:px-8">
        <motion.h2 {...reveal} className="display mx-auto max-w-[900px] text-[clamp(36px,5vw,76px)]">
          {L("Hai să-l vedeți pe proiectele clienților voștri.", "Let's see it on your customers' projects.")}
        </motion.h2>
        <motion.div {...reveal} className="mt-10 flex justify-center">
          <a href={demoHref} className="flex items-center gap-2 rounded-2xl bg-accent px-6 py-4 text-[16px] font-semibold text-on-accent">
            {L("Deschide demo-ul", "Open the demo")} <IconArrow size={18} />
          </a>
        </motion.div>
        <p className="mt-10 font-mono text-[11px] text-ink-3">
          {L("Demo conceptual WalletLoop. Catalogul, prețurile și stocurile sunt fictive.", "Concept demo by WalletLoop. Catalogue, prices and stock are fictional.")}
          {tenant.id !== "demo" && L(` Nu este un serviciu oficial ${tenant.name}.`, ` Not an official ${tenant.name} service.`)}
        </p>
      </section>
    </div>
  );
}

function SectionTitle({ index, title, dark }: { index: string; title: string; dark?: boolean }) {
  return (
    <motion.div {...reveal} className="flex items-baseline gap-4">
      <span className={`font-mono text-[12px] ${dark ? "text-[#9fbcf0]" : "text-ink-3"}`}>{index}</span>
      <h2 className={`display text-[clamp(32px,4vw,58px)] ${dark ? "text-white" : "text-ink"}`}>{title}</h2>
    </motion.div>
  );
}

function Roi({ lang, avgBasket }: { lang: Lang; avgBasket: number }) {
  const L = (ro: string, en: string) => (lang === "en" ? en : ro);
  const [members, setMembers] = useState(93000);
  const [projectShare, setProjectShare] = useState(20);
  const [adoption, setAdoption] = useState(25);
  const [basket, setBasket] = useState(avgBasket);
  const [uplift, setUplift] = useState(15);

  const projects = Math.round(members * (projectShare / 100) * (adoption / 100));
  const base = projects * basket;
  const incremental = base * (uplift / 100);
  const max = base + incremental;

  const sliders: [string, number, (v: number) => void, number, number, number, (v: number) => string][] = [
    [L("Membri activi în program", "Active loyalty members"), members, setMembers, 10000, 500000, 1000, (v) => int(v, lang)],
    [L("Membri cu un proiect / an", "Members with a project / year"), projectShare, setProjectShare, 5, 60, 1, (v) => `${v}%`],
    [L("Dintre ei, folosesc Blueprint", "Of those, use Blueprint"), adoption, setAdoption, 5, 80, 1, (v) => `${v}%`],
    [L("Coș mediu pe proiect", "Average project basket"), basket, setBasket, 300, 10000, 50, (v) => lei(v, lang)],
    [L("Creștere coș (completitudine + cross-sell)", "Basket uplift (completeness + cross-sell)"), uplift, setUplift, 0, 40, 1, (v) => `${v}%`],
  ];

  return (
    <section id="roi" className="mx-auto max-w-[1400px] px-4 py-24 sm:px-8">
      <SectionTitle index="04" title={L("Impactul, în cifrele voastre", "The impact, in your numbers")} />
      <p className="mt-4 max-w-[760px] text-[15px] text-ink-2">
        {L(
          "Model ilustrativ — ajustați ipotezele. Coșul mediu implicit e media proiectelor calculate mai sus. Pilotul măsoară creșterea reală printr-un test A/B.",
          "Illustrative model — adjust the assumptions. The default basket is the average of the projects computed above. The pilot measures the real uplift with an A/B test.",
        )}
      </p>
      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-6 rounded-[22px] border border-rule bg-card p-6">
          {sliders.map(([label, value, set, min, maxV, step, fmt]) => (
            <label key={label} className="block">
              <div className="flex items-baseline justify-between">
                <span className="text-[14px] text-ink-2">{label}</span>
                <span className="num font-mono text-[14px] font-semibold">{fmt(value)}</span>
              </div>
              <input
                type="range"
                min={min}
                max={maxV}
                step={step}
                value={value}
                onChange={(e) => set(Number(e.target.value))}
                className="mt-2 w-full accent-[var(--accent)]"
              />
            </label>
          ))}
        </div>
        <div className="flex flex-col justify-between rounded-[22px] bg-ink p-6 text-paper sm:p-8">
          <div>
            <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-paper/60">{L("Venit incremental / an", "Incremental revenue / year")}</div>
            <div className="display mt-2 text-[clamp(40px,5vw,72px)] leading-none text-accent">
              <Counter value={incremental} lang={lang} decimals={0} /> <span className="text-[0.4em] text-paper/70">lei</span>
            </div>
            <div className="mt-3 font-mono text-[12px] text-paper/60">
              {int(projects, lang)} {L("proiecte planificate prin Blueprint / an", "projects planned through Blueprint / year")}
            </div>
          </div>
          <div className="mt-8 space-y-4">
            {[
              [L("Fără Blueprint", "Without Blueprint"), base, "bg-paper/30"],
              [L("Cu Blueprint", "With Blueprint"), max, "bg-accent"],
            ].map(([label, v, cls]) => (
              <div key={String(label)}>
                <div className="mb-1 flex justify-between text-[13px] text-paper/80">
                  <span>{label}</span>
                  <span className="num font-mono">{int(Number(v), lang)} lei</span>
                </div>
                <div className="h-4 overflow-hidden rounded-full bg-paper/10">
                  <motion.div animate={{ width: `${(Number(v) / Math.max(1, max)) * 100}%` }} transition={{ duration: 0.8, ease }} className={`h-full rounded-full ${cls}`} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 grid grid-cols-3 gap-3 border-t border-paper/15 pt-5 text-center">
            {[
              [<IconTag key="t" size={16} />, L("Oferte aplicate automat", "Offers auto-applied")],
              [<IconWallet key="w" size={16} />, L("Engagement pe card", "Pass engagement")],
              [<IconPin key="p" size={16} />, L("Trafic în magazin", "Store footfall")],
            ].map(([icon, t]) => (
              <div key={String(t)} className="flex flex-col items-center gap-1.5 text-[11.5px] text-paper/70">
                <span className="text-accent">{icon}</span>
                {t}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
