"use client";

import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { ProjectType } from "@/domain/calculators";
import type { Lang } from "@/domain/types";
import { buildScene } from "../blueprint/builders";
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

/** The start screen's right column: example projects drawing themselves in 3D, one after another. */
export default function Hero({ lang, accent }: { lang: Lang; accent: string }) {
  const [heroIdx, setHeroIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setHeroIdx((i) => (i + 1) % HERO_BUILDS.length), 7800);
    return () => clearInterval(id);
  }, []);
  const hero = HERO_BUILDS[heroIdx];
  const heroBuild = useMemo(() => buildScene(hero.type, hero.inputs, lang), [hero, lang]);

  return (
                <section className="lg:relative lg:min-h-[640px]">
          <div className="bp-sheet relative h-[360px] overflow-hidden rounded-[26px] shadow-[0_40px_80px_-40px_rgba(10,31,71,0.75)] sm:h-[460px] lg:absolute lg:inset-0 lg:h-auto">
            <div className="absolute inset-0">
              <SceneBoundary resetKey={heroIdx} en={lang === "en"} dark>
                <Scene build={heroBuild} mode="blueprint" autoRotate compact interactive={false} replayKey={heroIdx} accent={accent} />
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
