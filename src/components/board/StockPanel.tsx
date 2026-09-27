"use client";

import { motion } from "motion/react";
import { useState } from "react";
import type { Quote } from "@/domain/quote";
import type { Lang } from "@/domain/types";
import { RO_MAP, projectRO } from "@/data/romania-map";
import { tr } from "@/lib/i18n";
import { PanelHeader } from "../ui/primitives";

/** Romania map with every store, the member's origin and availability of the whole basket. */
export default function StockPanel({ quote, lang, onMoveStore }: { quote: Quote; lang: Lang; onMoveStore: (id: string) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const stores = quote.availability.alternatives;
  const origin = projectRO(quote.availability.origin.lat, quote.availability.origin.lng);
  const nearest = stores.slice(0, 5);
  const lineCount = quote.lines.length;

  return (
    <div className="bp-sheet relative overflow-hidden rounded-[22px] p-4 sm:p-6">
      <PanelHeader index="03" title={tr("stock", lang)} dark />
      <div className="relative mt-3">
        <svg viewBox={`-20 -20 ${RO_MAP.width + 40} ${RO_MAP.height + 40}`} className="w-full">
          <defs>
            <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(206,226,255,0.12)" strokeWidth="2" />
            </pattern>
          </defs>
          <motion.path
            d={RO_MAP.path}
            fill="url(#hatch)"
            stroke="rgba(220,233,255,0.8)"
            strokeWidth={2}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 2.2, ease: [0.16, 1, 0.3, 1] }}
          />
          {/* connection lines origin → stores with everything */}
          {stores.map((s, i) => {
            const [x, y] = projectRO(s.lat, s.lng);
            if (!s.allInStock || s.distanceKm > 250) return null;
            return (
              <motion.line
                key={`l-${s.storeId}`}
                x1={origin[0]}
                y1={origin[1]}
                x2={x}
                y2={y}
                stroke="var(--accent)"
                strokeWidth={2}
                strokeDasharray="6 6"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.9 }}
                transition={{ delay: 0.8 + i * 0.1, duration: 0.9 }}
              />
            );
          })}
          {stores.map((s, i) => {
            const [x, y] = projectRO(s.lat, s.lng);
            const selected = s.storeId === quote.storeId;
            const color = s.allInStock ? "#3ddc84" : s.missingCount <= 1 ? "#ffc53d" : "#ff6b5a";
            return (
              <motion.g
                key={s.storeId}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.6 + i * 0.07, type: "spring", stiffness: 300, damping: 18 }}
                style={{ transformOrigin: `${x}px ${y}px` }}
                onMouseEnter={() => setHover(s.storeId)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onMoveStore(s.storeId)}
                className="cursor-pointer"
              >
                {selected && <circle cx={x} cy={y} r={18} fill="none" stroke="#fff" strokeWidth={2} />}
                <circle cx={x} cy={y} r={9} fill={color} stroke="#0a1f47" strokeWidth={3} />
                {(hover === s.storeId || selected) && (
                  <g>
                    <rect
                      x={x > RO_MAP.width * 0.6 ? x - 26 - Math.max(250, s.name.length * 15) : x + 26}
                      y={y - 52}
                      width={Math.max(250, s.name.length * 15)}
                      height={80}
                      rx={10}
                      fill="#0a1f47"
                      stroke="rgba(220,233,255,0.45)"
                      strokeWidth={2}
                    />
                    <text x={x > RO_MAP.width * 0.6 ? x - 10 - Math.max(250, s.name.length * 15) : x + 42} y={y - 18} fill="#fff" fontSize={26} fontFamily="var(--font-jetbrains)">
                      {s.name.split(" ").slice(1).join(" ")}
                    </text>
                    <text x={x > RO_MAP.width * 0.6 ? x - 10 - Math.max(250, s.name.length * 15) : x + 42} y={y + 14} fill={color} fontSize={22} fontFamily="var(--font-jetbrains)">
                      {lineCount - s.missingCount}/{lineCount} · {s.distanceKm} km
                    </text>
                  </g>
                )}
              </motion.g>
            );
          })}
          {/* origin */}
          <circle cx={origin[0]} cy={origin[1]} r={10} fill="var(--accent)" className="pulse-ring" />
          <circle cx={origin[0]} cy={origin[1]} r={6} fill="var(--accent)" stroke="#fff" strokeWidth={2} />
        </svg>
      </div>

      <ul className="mt-2 space-y-1.5">
        {nearest.map((s, i) => {
          const pct = ((lineCount - s.missingCount) / Math.max(1, lineCount)) * 100;
          const selected = s.storeId === quote.storeId;
          return (
            <li key={s.storeId} className={`grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl px-3 py-2 ${selected ? "bg-white/10 ring-1 ring-white/30" : ""}`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[13px] text-white">
                  <span className="truncate">{s.name}</span>
                  <span className="shrink-0 font-mono text-[10px] text-[#9fbcf0]">{s.distanceKm} km</span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.9, delay: 0.3 + i * 0.08 }}
                    className={`h-full rounded-full ${s.allInStock ? "bg-[#3ddc84]" : "bg-[#ffc53d]"}`}
                  />
                </div>
              </div>
              {selected ? (
                <span className="font-mono text-[10px] uppercase tracking-wider text-white/70">✓</span>
              ) : (
                <button
                  onClick={() => onMoveStore(s.storeId)}
                  className="rounded-full bg-white/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-white transition hover:bg-accent hover:text-on-accent"
                >
                  {tr("moveTo", lang)}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
