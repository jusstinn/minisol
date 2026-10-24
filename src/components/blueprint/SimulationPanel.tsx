"use client";

import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Layout } from "@/domain/layout";
import { DEFAULT_LOCATION, localHourOfDay, solarPosition, sunTimes, todayInZone, zonedTimeToUtc } from "@/domain/sun";
import type { Location } from "@/domain/sun";
import type { Lang } from "@/domain/types";
import { tr } from "@/lib/i18n";
import type { Layer } from "./builders";
import { dayHourAt, hoursAtProgress, progressToLayer, sweepProgress } from "./buildTimeline";
import { lampItems } from "./NightLights";
import type { ViewMode } from "./Scene";
import { sunAppearance } from "./sunLighting";
import type { SunLight } from "./sunLighting";
import { IconClock, IconClose, IconLayers, IconPause, IconPlay, IconSun } from "../ui/icons";

const PLAY_MS = 8000;
const reducedMotion = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
/** "14:05" from a fractional hour. */
const hhmm = (h: number) => {
  const wrapped = ((h % 24) + 24) % 24;
  const mm = Math.round((wrapped % 1) * 60) % 60;
  return `${String(Math.floor(wrapped)).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};

const SIM_DATES: { id: string; month: number; day: number; label: [string, string] }[] = [
  { id: "mar21", month: 3, day: 21, label: ["21 mar", "21 Mar"] },
  { id: "jun21", month: 6, day: 21, label: ["21 iun", "21 Jun"] },
  { id: "sep23", month: 9, day: 23, label: ["23 sep", "23 Sep"] },
  { id: "dec21", month: 12, day: 21, label: ["21 dec", "21 Dec"] },
  { id: "today", month: 0, day: 0, label: ["Azi", "Today"] },
];

/**
 * The "Simulare" panel mounted by `BlueprintPanel`: two independent, mutually-exclusive
 * simulations over the same sketch — a sun/time-of-day scrubber (with sunrise/sunset and the
 * sun's altitude, driving `Scene`'s lighting and, after sunset, its placed lamps) and a
 * construction-order scrubber (driving `Scene`'s existing highlight/dim machinery one
 * `build.layers` entry at a time). Both "play" buttons sweep over ~8 s and jump straight to the
 * end instead when the visitor prefers reduced motion.
 */
export default function SimulationPanel({
  lang,
  dark,
  compact,
  mode,
  layout,
  layers,
  hoursMin,
  hoursMax,
  location = DEFAULT_LOCATION,
  lite,
  onSun,
  onBuildLayer,
  onSwitchReal,
  onClose,
}: {
  lang: Lang;
  dark: boolean;
  /** Phones / the inline tab: a full-width sheet under the sketch instead of a floating card. */
  compact?: boolean;
  mode: ViewMode;
  layout?: Layout;
  layers: Layer[];
  hoursMin: number;
  hoursMax: number;
  /** Where the sun simulation computes its solar position for (defaults to Bucharest). */
  location?: Location;
  lite?: boolean | "low";
  onSun: (sun: SunLight | null) => void;
  onBuildLayer: (index: number | null) => void;
  onSwitchReal?: () => void;
  onClose: () => void;
}) {
  const en = lang === "en";
  const [tab, setTab] = useState<"sun" | "build">("sun");
  const [dateId, setDateId] = useState("jun21");
  const [hour, setHour] = useState(13);
  const [playingSun, setPlayingSun] = useState(false);
  const [progress, setProgress] = useState(0.4);
  const [playingBuild, setPlayingBuild] = useState(false);

  // ───────────────────────── sun & shadows ─────────────────────────
  const today = useMemo(() => todayInZone(location.tz), [location.tz]);
  const picked = SIM_DATES.find((d) => d.id === dateId) ?? SIM_DATES[1];
  const ymd = dateId === "today" ? today : { year: today.year, month: picked.month, day: picked.day };
  const instant = useMemo(
    () => zonedTimeToUtc(ymd.year, ymd.month, ymd.day, Math.floor(hour), Math.round((hour % 1) * 60), location.tz),
    [ymd.year, ymd.month, ymd.day, hour, location.tz],
  );
  const pos = useMemo(() => solarPosition(instant, location.lat, location.lon), [instant, location.lat, location.lon]);
  const times = useMemo(() => sunTimes(instant, location.lat, location.lon), [instant, location.lat, location.lon]);
  const sun = useMemo(() => sunAppearance(pos.altitudeDeg, pos.azimuthDeg), [pos.altitudeDeg, pos.azimuthDeg]);
  const lamps = useMemo(() => lampItems(layout, lite ? 2 : 6), [layout, lite]);
  const hasLamps = lamps.length > 0;
  const noLampsHint = sun.isNight && !hasLamps;

  useEffect(() => {
    onSun(tab === "sun" ? sun : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, sun]);
  useEffect(() => () => onSun(null), [onSun]);

  const sunSweep = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (sunSweep.current !== null) cancelAnimationFrame(sunSweep.current);
    },
    [],
  );
  const toggleSunPlay = () => {
    if (playingSun) {
      if (sunSweep.current !== null) cancelAnimationFrame(sunSweep.current);
      setPlayingSun(false);
      return;
    }
    const from = times.sunrise ? localHourOfDay(times.sunrise, location.tz) : 6;
    const to = (times.sunset ? localHourOfDay(times.sunset, location.tz) : 20) + 2.5;
    if (reducedMotion()) {
      setHour(to);
      return;
    }
    setHour(from);
    setPlayingSun(true);
    const start = performance.now();
    const step = (now: number) => {
      const p = sweepProgress(now - start, PLAY_MS);
      setHour(from + (to - from) * p);
      if (p < 1) sunSweep.current = requestAnimationFrame(step);
      else setPlayingSun(false);
    };
    sunSweep.current = requestAnimationFrame(step);
  };

  const fmtLocal = (d: Date | null) =>
    d ? new Intl.DateTimeFormat(en ? "en-GB" : "ro-RO", { timeZone: location.tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(d) : "—";

  // ────────────────────────── build simulation ──────────────────────────
  const layerCount = layers.length;
  const { layerIndex } = progressToLayer(progress, layerCount);
  const hours = hoursAtProgress(progress, hoursMin, hoursMax);
  const dh = dayHourAt(hours);

  useEffect(() => {
    onBuildLayer(tab === "build" && layerCount > 0 ? layerIndex : null);
  }, [tab, layerIndex, layerCount, onBuildLayer]);
  useEffect(() => () => onBuildLayer(null), [onBuildLayer]);

  const buildSweep = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (buildSweep.current !== null) cancelAnimationFrame(buildSweep.current);
    },
    [],
  );
  const toggleBuildPlay = () => {
    if (playingBuild) {
      if (buildSweep.current !== null) cancelAnimationFrame(buildSweep.current);
      setPlayingBuild(false);
      return;
    }
    if (reducedMotion()) {
      setProgress(1);
      return;
    }
    setProgress(0);
    setPlayingBuild(true);
    const start = performance.now();
    const step = (now: number) => {
      const p = sweepProgress(now - start, PLAY_MS);
      setProgress(p);
      if (p < 1) buildSweep.current = requestAnimationFrame(step);
      else setPlayingBuild(false);
    };
    buildSweep.current = requestAnimationFrame(step);
  };

  const chooseTab = (t: "sun" | "build") => {
    if (t === tab) return;
    if (sunSweep.current !== null) cancelAnimationFrame(sunSweep.current);
    if (buildSweep.current !== null) cancelAnimationFrame(buildSweep.current);
    setPlayingSun(false);
    setPlayingBuild(false);
    setTab(t);
  };

  const tabBtn = (active: boolean) =>
    `flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide transition ${
      active ? "bg-accent text-on-accent" : dark ? "text-[#dce9ff] hover:bg-[#dce9ff]/10" : "text-ink-2 hover:bg-ink/5"
    }`;
  const chip = (active: boolean) =>
    `rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide transition ${
      active ? "bg-accent text-on-accent" : dark ? "bg-[#dce9ff]/10 hover:bg-[#dce9ff]/20" : "bg-ink/5 hover:bg-ink/10"
    }`;
  const playBtn =
    `grid h-7 w-7 shrink-0 place-items-center rounded-full transition ${dark ? "bg-[#dce9ff]/10 hover:bg-[#dce9ff]/20" : "bg-ink/5 hover:bg-ink/10"}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={`overflow-hidden rounded-2xl ring-1 backdrop-blur-md ${compact ? "" : "shadow-[0_24px_60px_-24px_rgba(0,0,0,0.6)]"} ${
        dark ? "bg-[#071634]/85 text-[#e6efff] ring-[#dce9ff]/25" : "bg-white/92 text-ink ring-ink/10"
      }`}
    >
      <div className={`flex items-center gap-1 border-b px-2 py-1.5 ${dark ? "border-[#dce9ff]/15" : "border-ink/10"}`}>
        <button onClick={() => chooseTab("sun")} className={tabBtn(tab === "sun")}>
          <IconSun size={12} />
          {tr("simSun", lang)}
        </button>
        <button onClick={() => chooseTab("build")} className={tabBtn(tab === "build")}>
          <IconLayers size={12} />
          {tr("simBuild", lang)}
        </button>
        <span className="flex-1" />
        <button onClick={onClose} aria-label={en ? "Close" : "Închide"} className={`grid h-6 w-6 place-items-center rounded-full transition ${dark ? "hover:bg-[#dce9ff]/10" : "hover:bg-ink/5"}`}>
          <IconClose size={12} />
        </button>
      </div>

      {tab === "sun" ? (
        <div className="space-y-2.5 px-3 py-2.5">
          <div className="flex flex-wrap gap-1">
            {SIM_DATES.map((d) => (
              <button key={d.id} onClick={() => setDateId(d.id)} className={chip(dateId === d.id)}>
                {d.label[en ? 1 : 0]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={24}
              step={1 / 12}
              value={hour}
              onChange={(e) => setHour(Number(e.target.value))}
              className="h-1 flex-1 accent-[var(--accent)]"
              aria-label={en ? "Time of day" : "Ora din zi"}
            />
            <span className="w-11 shrink-0 text-right font-mono text-[11px] tabular-nums">{hhmm(hour)}</span>
            <button onClick={toggleSunPlay} aria-label={playingSun ? (en ? "Pause" : "Pauză") : en ? "Play the day" : "Rulează ziua"} className={playBtn}>
              {playingSun ? <IconPause size={12} /> : <IconPlay size={12} />}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[10px] opacity-75">
            <span>↑ {fmtLocal(times.sunrise)}</span>
            <span>↓ {fmtLocal(times.sunset)}</span>
            <span>
              {en ? "Altitude" : "Altitudine"} {Math.round(pos.altitudeDeg)}°
            </span>
          </div>
          {mode !== "real" && onSwitchReal && (
            <button onClick={onSwitchReal} className={`w-full rounded-lg px-2 py-1.5 text-center font-mono text-[10.5px] uppercase tracking-wide ${dark ? "bg-[#dce9ff]/10 hover:bg-[#dce9ff]/20" : "bg-ink/5 hover:bg-ink/10"}`}>
              {en ? "Switch to Real to see it" : "Comută pe Real ca să vezi"}
            </button>
          )}
          {noLampsHint && <p className="text-[10.5px] leading-snug opacity-75">{en ? "Add garden lights from the chat" : "Adaugă lămpi de grădină din chat"}</p>}
        </div>
      ) : (
        <div className="space-y-2.5 px-3 py-2.5">
          <div className="font-mono text-[11px]">{layers[layerIndex]?.label ?? (en ? "Nothing to build yet" : "Nimic de construit încă")}</div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              className="h-1 flex-1 accent-[var(--accent)]"
              aria-label={en ? "Build progress" : "Progres montaj"}
            />
            <button onClick={toggleBuildPlay} aria-label={playingBuild ? (en ? "Pause" : "Pauză") : en ? "Play the build" : "Rulează montajul"} className={playBtn}>
              {playingBuild ? <IconPause size={12} /> : <IconPlay size={12} />}
            </button>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[10px] opacity-75">
            <IconClock size={11} />
            {/* Workdays of 8 h; the total is the project's own estimate range. */}
            {en
              ? `Day ${dh.day} · ~${Math.round(hours)} h of ${hoursMin}–${hoursMax} h`
              : `Ziua ${dh.day} · ~${Math.round(hours)} h din ${hoursMin}–${hoursMax} h`}
          </div>
        </div>
      )}
    </motion.div>
  );
}
