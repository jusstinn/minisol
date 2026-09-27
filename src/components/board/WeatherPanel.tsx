"use client";

import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import type { ProjectType } from "@/domain/calculators";
import type { Lang } from "@/domain/types";
import { PanelHeader } from "../ui/primitives";

interface Day {
  date: string;
  tMax: number;
  tMin: number;
  rain: number; // precipitation probability %
  wind: number; // km/h
  code: number;
}

/** What "good weather" means for each outdoor project. */
const RULES: Partial<Record<ProjectType, { minT: number; maxT: number; maxRain: number; why: { ro: string; en: string } }>> = {
  deck: { minT: 10, maxT: 30, maxRain: 30, why: { ro: "Uleiul de terasă are nevoie de 2 zile uscate, peste 10 °C.", en: "Decking oil needs two dry days above 10 °C." } },
  fence: { minT: 5, maxT: 32, maxRain: 45, why: { ro: "Betonul pentru stâlpi prinde bine peste 5 °C; lazura vrea vreme uscată.", en: "Post concrete sets well above 5 °C; stain wants a dry day." } },
  lawn: { minT: 8, maxT: 26, maxRain: 70, why: { ro: "Semințele pornesc la 8–25 °C, iar o ploaie ușoară după semănat ajută.", en: "Seed germinates at 8–25 °C, and light rain after sowing helps." } },
};

function score(d: Day, r: NonNullable<(typeof RULES)[ProjectType]>): number {
  let s = 100 - Math.max(0, d.rain - (r.maxRain - 30));
  if (d.tMax < r.minT) s -= (r.minT - d.tMax) * 8;
  if (d.tMax > r.maxT) s -= (d.tMax - r.maxT) * 6;
  if (d.wind > 35) s -= (d.wind - 35) * 2;
  return s;
}

export default function WeatherPanel({ lat, lng, city, type, lang }: { lat: number; lng: number; city: string; type: ProjectType; lang: Lang }) {
  const rule = RULES[type];
  const [days, setDays] = useState<Day[] | null>(null);

  useEffect(() => {
    if (!rule) return;
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}` +
      "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,weather_code&timezone=Europe%2FBucharest&forecast_days=7";
    const ctrl = new AbortController();
    fetch(url, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => {
        const x = d.daily;
        setDays(
          x.time.map((t: string, i: number) => ({
            date: t,
            tMax: x.temperature_2m_max[i],
            tMin: x.temperature_2m_min[i],
            rain: x.precipitation_probability_max[i] ?? 0,
            wind: x.wind_speed_10m_max[i] ?? 0,
            code: x.weather_code[i] ?? 0,
          })),
        );
      })
      .catch(() => setDays([]));
    return () => ctrl.abort();
  }, [lat, lng, rule]);

  const best = useMemo(() => {
    if (!days?.length || !rule) return null;
    let bi = 0;
    let bs = -Infinity;
    for (let i = 0; i < days.length - 1; i++) {
      const s = score(days[i], rule) + score(days[i + 1], rule);
      if (s > bs) {
        bs = s;
        bi = i;
      }
    }
    return { i: bi, ok: bs > 120 };
  }, [days, rule]);

  if (!rule || (days && days.length === 0)) return null;

  const W = 700;
  const H = 210;
  const padX = 30;
  const top = 36;
  const chartH = 120;
  const colW = (W - padX * 2) / 7;
  const tMin = days ? Math.min(...days.map((d) => d.tMin)) - 2 : 0;
  const tMax = days ? Math.max(...days.map((d) => d.tMax)) + 2 : 30;
  const ty = (t: number) => top + chartH - ((t - tMin) / Math.max(1, tMax - tMin)) * chartH;
  // Parse "YYYY-MM-DD" as a local calendar day (not UTC midnight) so it never shifts by a day.
  const fmtDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(lang === "en" ? "en-GB" : "ro-RO", { weekday: "short", day: "numeric" });
  const path = days?.map((d, i) => `${i === 0 ? "M" : "L"}${padX + colW * i + colW / 2},${ty(d.tMax)}`).join(" ");
  const pathMin = days?.map((d, i) => `${i === 0 ? "M" : "L"}${padX + colW * i + colW / 2},${ty(d.tMin)}`).join(" ");

  return (
    <div className="rounded-[22px] border border-rule bg-card p-4 sm:p-6">
      <PanelHeader index="06" title={lang === "en" ? `When to build · ${city}` : `Când să lucrezi · ${city}`} right={<span className="font-mono text-[10px] text-ink-3">Open-Meteo · 7 {lang === "en" ? "days" : "zile"}</span>} />
      {!days ? (
        <div className="shimmer mt-4 h-[210px] rounded-xl bg-paper-2" />
      ) : (
        <>
          {best && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="display-cond text-[26px] leading-none text-ink">
                {best.ok ? (lang === "en" ? "Best window:" : "Fereastra ideală:") : lang === "en" ? "Least-bad window:" : "Cea mai bună variantă:"}{" "}
                <span className="text-accent">
                  {fmtDay(days[best.i].date)} – {fmtDay(days[best.i + 1].date)}
                </span>
              </span>
              <span className="text-[13px] text-ink-2">{rule.why[lang]}</span>
            </motion.div>
          )}
          <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full">
            {best && (
              <motion.rect
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.2 }}
                x={padX + colW * best.i + 3}
                y={8}
                width={colW * 2 - 6}
                height={H - 16}
                rx={12}
                fill="var(--accent)"
                fillOpacity={0.09}
                stroke="var(--accent)"
                strokeDasharray="5 5"
              />
            )}
            {/* rain probability bars */}
            {days.map((d, i) => {
              const h = (d.rain / 100) * chartH;
              return (
                <g key={d.date}>
                  <motion.rect
                    x={padX + colW * i + colW * 0.28}
                    width={colW * 0.44}
                    rx={4}
                    fill="#5b8cf0"
                    fillOpacity={0.35}
                    initial={{ y: top + chartH, height: 0 }}
                    animate={{ y: top + chartH - h, height: h }}
                    transition={{ duration: 0.8, delay: 0.1 + i * 0.07, ease: [0.16, 1, 0.3, 1] }}
                  />
                  <text x={padX + colW * i + colW / 2} y={top + chartH + 20} textAnchor="middle" fontSize={12} className="fill-ink-2 font-mono">
                    {fmtDay(d.date)}
                  </text>
                  <text x={padX + colW * i + colW / 2} y={top + chartH + 38} textAnchor="middle" fontSize={11} className="fill-ink-3 font-mono">
                    ☂ {d.rain}%
                  </text>
                  <text x={padX + colW * i + colW / 2} y={ty(d.tMax) - 10} textAnchor="middle" fontSize={12} fontWeight={600} className="fill-ink font-mono">
                    {Math.round(d.tMax)}°
                  </text>
                </g>
              );
            })}
            <motion.path d={pathMin} fill="none" stroke="var(--ink-3)" strokeWidth={1.5} strokeDasharray="3 4" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4 }} />
            <motion.path d={path} fill="none" stroke="var(--accent)" strokeWidth={3} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }} />
            {days.map((d, i) => (
              <motion.circle
                key={d.date}
                cx={padX + colW * i + colW / 2}
                cy={ty(d.tMax)}
                r={4.5}
                fill="var(--card)"
                stroke="var(--accent)"
                strokeWidth={2.5}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3 + i * 0.12 }}
              />
            ))}
          </svg>
        </>
      )}
    </div>
  );
}
