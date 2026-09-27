"use client";

import { motion } from "motion/react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { ProjectSnapshot } from "@/agent/types";
import type { Tenant } from "@/config/tenant";
import type { Lang } from "@/domain/types";
import { dec } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { buildScene } from "../blueprint/builders";
import type { ViewMode } from "../blueprint/Scene";
import { IconClock, IconCube, IconGrid, IconLayers, IconReplay, IconRotate, IconUsers, IconWarn } from "../ui/icons";

const Scene = dynamic(() => import("../blueprint/Scene"), {
  ssr: false,
  loading: () => <div className="shimmer absolute inset-0 opacity-20" />,
});

export default function BlueprintPanel({
  project,
  tenant,
  lang,
  highlight,
  onHighlight,
  inline,
}: {
  project: ProjectSnapshot;
  tenant: Tenant;
  lang: Lang;
  highlight: string | null;
  onHighlight: (l: string | null) => void;
  inline?: boolean;
}) {
  const [mode, setMode] = useState<ViewMode>("blueprint");
  const [rotate, setRotate] = useState(true);
  const [replay, setReplay] = useState(0);
  const build = useMemo(() => buildScene(project.type, project.inputs, lang), [project, lang]);
  const dark = mode !== "real";

  const modes: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
    { id: "blueprint", label: tr("viewBlueprint", lang), icon: <IconGrid size={14} /> },
    { id: "real", label: tr("viewReal", lang), icon: <IconCube size={14} /> },
    { id: "exploded", label: tr("viewExploded", lang), icon: <IconLayers size={14} /> },
  ];

  return (
    <div
      className={`relative overflow-hidden rounded-[22px] transition-colors duration-700 ${
        dark ? "bp-sheet" : "bg-[radial-gradient(120%_100%_at_30%_0%,#fbf8f1,#e7e1d3)] text-ink"
      } ${inline ? "h-[380px]" : "h-[clamp(420px,58vh,620px)]"}`}
    >
      <div className="absolute inset-0">
        <Scene build={build} mode={mode} highlightLayer={highlight} autoRotate={rotate} replayKey={replay} accent={tenant.accent} compact={inline} />
      </div>

      {/* title block */}
      <div className="pointer-events-none absolute left-4 top-4 max-w-[70%] sm:left-6 sm:top-5">
        <div className={`font-mono text-[10px] uppercase tracking-[0.18em] ${dark ? "text-[#9fbcf0]" : "text-ink-3"}`}>
          FIG. 01 · {project.type.replace("_", " ")}
        </div>
        <motion.h2
          key={project.title}
          initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className={`display mt-1 text-[clamp(26px,3.4vw,46px)] ${dark ? "text-white" : "text-ink"}`}
        >
          {project.title}
        </motion.h2>
        <div className={`mt-3 space-y-0.5 font-mono text-[11px] ${dark ? "text-[#dce9ff]" : "text-ink-2"}`}>
          {project.measurements.slice(0, inline ? 2 : 4).map((m, i) => (
            <motion.div
              key={m.label}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 + i * 0.12 }}
              className="flex gap-2"
            >
              <span className={dark ? "text-[#8fb0e8]" : "text-ink-3"}>{m.label}</span>
              <span className="font-medium">
                {dec(m.value, lang, m.unit === "buc" || m.unit === "rânduri" ? 0 : 2)} {m.unit}
              </span>
            </motion.div>
          ))}
        </div>
      </div>

      {/* controls */}
      <div className="absolute right-3 top-3 flex flex-col items-end gap-2 sm:right-5 sm:top-5">
        <div className={`flex rounded-full p-0.5 backdrop-blur ${dark ? "bg-[#0a1f47]/70 ring-1 ring-[#dce9ff]/25" : "bg-white/70 ring-1 ring-ink/10"}`}>
          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-wider transition ${
                mode === m.id ? "bg-accent text-on-accent" : dark ? "text-[#dce9ff] hover:text-white" : "text-ink-2 hover:text-ink"
              }`}
            >
              {m.icon}
              <span className="hidden sm:inline">{m.label}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <RoundBtn dark={dark} onClick={() => setReplay((r) => r + 1)} title="Replay">
            <IconReplay size={15} />
          </RoundBtn>
          <RoundBtn dark={dark} active={rotate} onClick={() => setRotate((r) => !r)} title="Rotate">
            <IconRotate size={15} />
          </RoundBtn>
        </div>
      </div>

      {/* legend */}
      <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-end gap-1.5 sm:bottom-5 sm:left-6 sm:right-auto sm:max-w-[60%]">
        {build.layers.map((l, i) => (
          <button
            key={l.id}
            onMouseEnter={() => onHighlight(l.id)}
            onMouseLeave={() => onHighlight(null)}
            onClick={() => onHighlight(highlight === l.id ? null : l.id)}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider backdrop-blur transition ${
              highlight === l.id
                ? "bg-accent text-on-accent"
                : dark
                  ? "bg-[#0a1f47]/60 text-[#dce9ff] ring-1 ring-[#dce9ff]/20 hover:ring-[#dce9ff]/60"
                  : "bg-white/70 text-ink-2 ring-1 ring-ink/10 hover:ring-ink/40"
            }`}
          >
            <span className="text-[9px] opacity-60">{String(i + 1).padStart(2, "0")}</span>
            <span className="h-2 w-2 rounded-[2px]" style={{ background: l.color }} />
            {l.label}
          </button>
        ))}
      </div>

      {/* estimate */}
      <div
        className={`absolute bottom-3 right-3 hidden border font-mono text-[10px] uppercase tracking-[0.12em] sm:bottom-5 sm:right-5 sm:block ${
          dark ? "border-[#dce9ff]/35 text-[#dce9ff]" : "border-ink/20 text-ink-2"
        }`}
      >
        <EstRow dark={dark} icon={<IconClock size={12} />} k={lang === "en" ? "Time" : "Timp"} v={`${project.estimate.hoursMin}–${project.estimate.hoursMax} ${tr("hours", lang)}`} />
        <EstRow dark={dark} icon={<IconUsers size={12} />} k={lang === "en" ? "Crew" : "Echipă"} v={`${project.estimate.people} ${tr("people", lang)}`} />
        <EstRow
          dark={dark}
          icon={<IconWarn size={12} />}
          k={tr("difficulty", lang)}
          v={
            <span className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <span key={i} className={`h-2.5 w-1.5 ${i <= project.estimate.difficulty ? "bg-accent" : dark ? "bg-[#dce9ff]/20" : "bg-ink/15"}`} />
              ))}
            </span>
          }
        />
      </div>
    </div>
  );
}

function EstRow({ icon, k, v, dark }: { icon: React.ReactNode; k: string; v: React.ReactNode; dark: boolean }) {
  return (
    <div className={`flex items-center border-b last:border-b-0 ${dark ? "border-[#dce9ff]/20" : "border-ink/10"}`}>
      <span className={`flex w-28 items-center gap-1.5 border-r px-2 py-1.5 ${dark ? "border-[#dce9ff]/20 text-[#8fb0e8]" : "border-ink/10 text-ink-3"}`}>
        {icon}
        {k}
      </span>
      <span className="px-2 py-1.5">{v}</span>
    </div>
  );
}

function RoundBtn({ children, dark, active, onClick, title }: { children: React.ReactNode; dark: boolean; active?: boolean; onClick: () => void; title: string }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`grid h-8 w-8 place-items-center rounded-full backdrop-blur transition ${
        active ? "bg-accent text-on-accent" : dark ? "bg-[#0a1f47]/70 text-[#dce9ff] ring-1 ring-[#dce9ff]/25 hover:text-white" : "bg-white/70 text-ink-2 ring-1 ring-ink/10"
      }`}
    >
      {children}
    </button>
  );
}
