"use client";

import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectType } from "@/domain/calculators";
import type { Lang } from "@/domain/types";
import { useLiteGraphics } from "@/lib/useLiteGraphics";
import { buildScene } from "../blueprint/builders";
import { tourArcFor } from "../blueprint/cameraPresets";
import type { FrameFit } from "../blueprint/cameraPresets";
import type { CaptureFn } from "../blueprint/Scene";
import SceneBoundary from "../blueprint/SceneBoundary";
import { heroCycle } from "./heroTiming";

/** Fills ~80% of the panel's own width (whatever its aspect), padded for the dimension labels,
 *  centred, seen from higher than the usual 3/4 view so a flat project fills a tall panel —
 *  see cameraPresets.ts's `FrameFit`. */
const HERO_FRAME: FrameFit = { fillWidth: 0.8, margin: 0.6, verticalBias: 0.02, phi: (50 * Math.PI) / 180 };

const Scene = dynamic(() => import("../blueprint/Scene"), { ssr: false, loading: () => <HeroPlaceholder /> });

/**
 * The five projects chosen to look best here: a mix of outdoor/indoor, and ones that show off
 * the REAL view's higher-fidelity geometry — round pedestals and instanced screws (deck), a
 * chamfered bond with a kerb (paving), grout depth (bathroom), posts/panels (fence), grass
 * growing in (lawn).
 */
const HERO_BUILDS: { type: ProjectType; inputs: Record<string, unknown>; ro: string; en: string }[] = [
  { type: "deck", inputs: { lengthM: 4, widthM: 3 }, ro: "Terasă din deck", en: "Garden deck" },
  { type: "paving", inputs: { lengthM: 4.5, widthM: 3.5, use: "patio", edging: true }, ro: "Terasă pavată", en: "Paved patio" },
  { type: "fence", inputs: { lengthM: 11, heightM: 1.8 }, ro: "Gard din panouri", en: "Panel fence" },
  { type: "tiling", inputs: { lengthM: 2.5, widthM: 2, roomType: "bathroom" }, ro: "Baie, placată", en: "Bathroom tiling" },
  { type: "lawn", inputs: { areaM2: 24 }, ro: "Gazon nou", en: "New lawn" },
];

/** How long the snapshot's own fade in/out takes — symmetric, with whatever's left of the
 *  crossfade window spent holding at full opacity (hiding the actual project swap underneath). */
const SNAPSHOT_FADE_MS = 260;

/** The start screen's right column: example projects assembling themselves in 3D, one after
 *  another — blueprint lines first, materialising into the realistic look as each one builds,
 *  holding on the finished result, then dissolving into the next with no pop (see heroTiming.ts). */
export default function Hero({ lang, accent }: { lang: Lang; accent: string }) {
  const lite = useLiteGraphics();
  const [reduced] = useState(() => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches));
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"blueprint" | "real">(reduced ? "real" : "blueprint");
  const [snapshot, setSnapshot] = useState<{ idx: number; url: string; visible: boolean } | null>(null);
  const captureRef = useRef<CaptureFn | null>(null);

  // A new project starts over: back to lines (or straight to real, reduced motion) and no
  // leftover snapshot — React's own "adjust state when a prop changes" pattern (computed during
  // render, not an effect), the same one Scene.tsx's own build/replayKey tracking uses.
  const [seenIdx, setSeenIdx] = useState(idx);
  if (seenIdx !== idx) {
    setSeenIdx(idx);
    setPhase(reduced ? "real" : "blueprint");
    setSnapshot(null);
  }

  const hero = HERO_BUILDS[idx];
  const heroBuild = useMemo(() => buildScene(hero.type, hero.inputs, lang), [hero, lang]);
  const dims = useMemo(() => heroBuild.dims.slice(0, 2).map((d) => d.label).join(" × "), [heroBuild]);
  const timing = useMemo(() => heroCycle(heroBuild.duration, reduced), [heroBuild.duration, reduced]);
  // A restricted camera sweep picked from this build's own shape (never edge-on, never showing
  // the backs of a room's walls — see cameraPresets.ts's own doc).
  const tourArc = useMemo(() => tourArcFor(heroBuild.extent, heroBuild.interior), [heroBuild]);

  // Off-screen (scrolled away) or the tab is hidden: stop rendering, keep the state — resumes
  // exactly where it left off, no catch-up animation.
  const containerRef = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const onVis = () => setTabVisible(document.visibilityState === "visible");
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  const paused = !onScreen || !tabVisible;

  // One project's whole cycle: draw as lines, materialise, hold, then freeze a snapshot and
  // dissolve into the next — a plain timer chain (not tied to the Scene's own clock), so it
  // keeps the same cadence whether or not the canvas is currently rendering.
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let raf: number | null = null;
    if (!reduced) timers.push(setTimeout(() => setPhase("real"), timing.materializeAtMs));
    timers.push(
      setTimeout(() => {
        let url: string | null = null;
        try {
          url = captureRef.current?.(960) ?? null;
        } catch {
          url = null;
        }
        if (!url) {
          setIdx((i) => (i + 1) % HERO_BUILDS.length);
          return;
        }
        // Mounted invisible first, then flipped to visible a frame later: a CSS opacity
        // transition only animates a *change*, not an element's first style on insertion.
        setSnapshot({ idx, url, visible: false });
        raf = requestAnimationFrame(() => setSnapshot((s) => (s ? { ...s, visible: true } : s)));
        const holdMs = Math.max(0, timing.crossfadeDurationMs - SNAPSHOT_FADE_MS * 2);
        timers.push(
          setTimeout(() => {
            setIdx((i) => (i + 1) % HERO_BUILDS.length);
            setSnapshot((s) => (s ? { ...s, visible: false } : s));
          }, SNAPSHOT_FADE_MS + holdMs),
        );
      }, timing.crossfadeAtMs),
    );
    return () => {
      timers.forEach(clearTimeout);
      if (raf !== null) cancelAnimationFrame(raf);
    };
    // `idx` itself deliberately isn't a dependency beyond keying the snapshot: a lang-only change
    // (same project, translated) shouldn't restart the cycle; `timing` already captures every
    // reason the schedule would actually need to change. `reduced` never changes after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, timing]);

  return (
    <section className="lg:relative lg:min-h-[640px]">
      <div ref={containerRef} className="bp-sheet relative h-[360px] overflow-hidden rounded-[26px] shadow-[0_40px_80px_-40px_rgba(10,31,71,0.75)] sm:h-[460px] lg:absolute lg:inset-0 lg:h-auto">
        {/* Plan → reality transitions the backdrop too: a soft daylight gradient crossfades in
            under the canvas (the canvas itself stays transparent in both modes) in lock-step with
            the model's own blueprint → real materialise, so the result never looks pasted onto
            the blueprint grid — see GroundHalo (Scene.tsx) for the matching in-canvas ground. */}
        <div
          className="pointer-events-none absolute inset-0 transition-opacity ease-in-out"
          style={{ opacity: phase === "real" ? 1 : 0, transitionDuration: `${reduced ? 250 : 900}ms`, background: "radial-gradient(120% 100% at 30% 10%, #eef4ff 0%, #d9e6f7 45%, #c3d6ec 100%)" }}
        />
        <div className="absolute inset-0">
          <SceneBoundary resetKey={idx} en={lang === "en"} dark>
            <Scene
              build={heroBuild}
              mode={phase}
              autoRotate={false}
              preset="tour"
              compact
              interactive={false}
              replayKey={idx}
              accent={accent}
              lite={lite}
              paused={paused}
              frame={HERO_FRAME}
              tourArc={tourArc}
              onCaptureReady={(fn) => {
                captureRef.current = fn;
              }}
            />
          </SceneBoundary>
        </div>
        {snapshot && (
          // A transient client-generated data URL (a frozen canvas frame) — not an asset `next/image` can optimise.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={snapshot.url}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full object-cover ease-in-out"
            style={{ opacity: snapshot.visible ? 1 : 0, transitionProperty: "opacity", transitionDuration: `${SNAPSHOT_FADE_MS}ms` }}
          />
        )}
        <div className="pointer-events-none absolute left-5 top-5 sm:left-7 sm:top-6">
          <AnimatePresence mode="wait">
            {/* Solid colours (not the backdrop's own gradients) so the swap between the dark
                blueprint and the light daylight backdrop is a smooth CSS transition, not a pop —
                legible against either. */}
            <motion.div key={idx} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.35 }}>
              <div className={`text-[13.5px] transition-colors duration-700 ${phase === "real" ? "text-[#16233f]" : "text-[#dce9ff]"}`}>{lang === "en" ? hero.en : hero.ro}</div>
              <div className={`mt-0.5 text-[12px] transition-colors duration-700 ${phase === "real" ? "text-[#4b5b7a]" : "text-[#8fa9dd]"}`}>{dims}</div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

/** A static, CSS/SVG blueprint placeholder shown while the 3D chunk loads — so the hero never
 *  shows a blank box on first paint. */
function HeroPlaceholder() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(120%_120%_at_30%_0%,#13285c,#0a1f47)]">
      <svg viewBox="0 0 220 150" className="h-2/3 w-2/3 max-w-[360px] animate-pulse opacity-50" aria-hidden>
        <rect x="24" y="22" width="172" height="106" rx="5" fill="none" stroke="#5b8cf0" strokeWidth="1.1" />
        <line x1="24" y1="75" x2="196" y2="75" stroke="#5b8cf0" strokeWidth="0.6" strokeDasharray="4 5" />
        <line x1="110" y1="22" x2="110" y2="128" stroke="#5b8cf0" strokeWidth="0.6" strokeDasharray="4 5" />
      </svg>
    </div>
  );
}
