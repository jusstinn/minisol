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
  const [rotate, setRotate] = useState(false);
  const [replay, setReplay] = useState(0);
  const build = useMemo(() => buildScene(project.type, project.inputs, lang), [project, lang]);
  const dark = mode !== "real";

  const modes: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
    { id: "blueprint", label: tr("viewBlueprint", lang), icon: <IconGrid size={14} /> },
    { id: "real", label: tr("viewReal", lang), icon: <IconCube size={14} /> },
    { id: "exploded", label: tr("viewExploded", lang), icon: <IconLayers size={14} /> },
  ];

  return (
    <div className="overflow-hidden rounded-[16px] border border-rule bg-card">
      <div className="flex flex-col gap-4 border-b border-rule px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
          FIG. 01 · {project.type.replace("_", " ")}
          </div>
          <motion.h2 key={project.title} initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} className="display mt-1 max-w-[520px] text-[clamp(21px,2vw,30px)] leading-[1.05] text-ink">
            {project.title}
          </motion.h2>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-2">
            {project.measurements.slice(0, inline ? 2 : 4).map((m) => (
              <span key={m.label}>
                <span className="text-ink-3">{m.label}: </span>
                <b>{dec(m.value, lang, m.unit === "buc" || m.unit === "rânduri" ? 0 : 2)} {m.unit}</b>
              </span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`flex h-9 items-center gap-1.5 border px-2.5 text-[10.5px] font-bold uppercase transition ${
                mode === m.id ? "border-accent bg-accent text-on-accent" : "border-ink/20 bg-white text-ink-2 hover:border-ink"
              }`}
            >
              {m.icon}
              <span className="hidden sm:inline">{m.label}</span>
            </button>
          ))}
          <RoundBtn dark={false} onClick={() => setReplay((r) => r + 1)} title="Replay">
            <IconReplay size={15} />
          </RoundBtn>
          <button
            type="button"
            aria-pressed={rotate}
            onClick={() => setRotate((r) => !r)}
            title={lang === "en" ? "Automatically orbit around the model" : "Rotește automat în jurul modelului"}
            className={`flex h-9 items-center gap-1.5 border px-2.5 text-[10px] font-bold uppercase transition ${
              rotate ? "border-accent bg-accent text-on-accent" : "border-ink/20 bg-white text-ink-2 hover:border-ink"
            }`}
          >
            <IconRotate size={15} />
            <span>{lang === "en" ? "Orbit" : "Orbită"}</span>
          </button>
        </div>
      </div>

      <div className={`relative ${inline ? "h-[270px]" : "h-[clamp(330px,48vh,500px)]"} ${dark ? "bp-sheet" : "bg-[radial-gradient(120%_100%_at_30%_0%,#fbf8f1,#e7e1d3)]"}`}>
        <div className="absolute inset-0">
          <Scene build={build} mode={mode} highlightLayer={highlight} autoRotate={rotate} replayKey={replay} accent={tenant.accent} compact={inline} />
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-rule bg-[#f5f5f3] p-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap gap-1">
          {build.layers.map((l, i) => (
            <button key={l.id} onMouseEnter={() => onHighlight(l.id)} onMouseLeave={() => onHighlight(null)} onClick={() => onHighlight(highlight === l.id ? null : l.id)} className={`flex min-h-8 items-center gap-2 border px-3 py-1.5 text-[10.5px] font-bold uppercase transition ${highlight === l.id ? "border-accent bg-accent" : "border-ink/20 bg-white hover:border-accent"}`}>
              <span className="border-r border-ink/20 pr-2 font-mono text-[10px]">{i + 1}</span>
              {l.label}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 flex-wrap border border-ink/15 bg-white text-[10px] uppercase text-ink-2">
          <EstRow dark={false} icon={<IconClock size={12} />} k={lang === "en" ? "Time" : "Timp"} v={`${project.estimate.hoursMin}–${project.estimate.hoursMax} ${tr("hours", lang)}`} />
          <EstRow dark={false} icon={<IconUsers size={12} />} k={lang === "en" ? "Crew" : "Echipă"} v={`${project.estimate.people} ${tr("people", lang)}`} />
          <EstRow dark={false} icon={<IconWarn size={12} />} k={tr("difficulty", lang)} v={<span className="flex gap-0.5">{[1, 2, 3, 4, 5].map((i) => <span key={i} className={`h-2.5 w-1.5 ${i <= project.estimate.difficulty ? "bg-accent" : "bg-ink/15"}`} />)}</span>} />
        </div>
      </div>
    </div>
  );
}

function EstRow({ icon, k, v, dark }: { icon: React.ReactNode; k: string; v: React.ReactNode; dark: boolean }) {
  return (
    <div className={`flex items-center border-r last:border-r-0 ${dark ? "border-[#dce9ff]/20" : "border-ink/10"}`}>
      <span className={`flex items-center gap-1.5 px-2 py-2 ${dark ? "text-[#8fb0e8]" : "text-ink-3"}`}>
        {icon}
        {k}
      </span>
      <span className="px-2 py-2 font-semibold text-ink">{v}</span>
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
