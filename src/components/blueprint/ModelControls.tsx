"use client";

import { useState } from "react";
import type { Lang } from "@/domain/types";
import { dec } from "@/lib/format";
import { modelSize } from "@/lib/uploads/loadModel";
import type { ModelEntry, UploadsStore } from "@/lib/uploads/store";
import { ground, nudge, placedSize, rotateQuarter, setUnit, UNITS } from "@/lib/uploads/units";
import { IconTrash } from "../ui/icons";
import { chip, IconChevron, IconEye, IconGround, IconLock, IconTurn, iconBtn, MiniSlider, soft } from "./uploads/ui";

/**
 * Dock panel for the customer's own 3D model — two compact rows (the dock shares its height
 * with the plan editor): units, turn, ground, opacity, hide, remove / move ±0.1 or ±1 m.
 */
export default function ModelControls({ entry, store, lang, dark }: { entry: ModelEntry; store: UploadsStore; lang: Lang; dark: boolean }) {
  const en = lang === "en";
  const [step, setStep] = useState<0.1 | 1>(0.1);
  const p = entry.placement;
  const [w, h, d] = placedSize(modelSize(entry.model), p);
  const m = (v: number) => dec(v, lang, v >= 10 ? 1 : 2);
  const tris = entry.model.triangles >= 1000 ? `${dec(entry.model.triangles / 1000, lang, entry.model.triangles >= 100_000 ? 0 : 1)}k` : String(entry.model.triangles);

  const move = (dx: number, dz: number, dy = 0) => store.setPlacement((q) => nudge(q, dx * step, dz * step, dy * step));
  const arrows: { dir: "left" | "right" | "up" | "down"; label: string; go: () => void }[] = [
    { dir: "left", label: en ? "Move west" : "Mută spre vest", go: () => move(-1, 0) },
    { dir: "up", label: en ? "Move north" : "Mută spre nord", go: () => move(0, -1) },
    { dir: "down", label: en ? "Move south" : "Mută spre sud", go: () => move(0, 1) },
    { dir: "right", label: en ? "Move east" : "Mută spre est", go: () => move(1, 0) },
  ];

  return (
    <div className="space-y-1.5 px-3 pb-2.5 pt-2">
      <div className="flex items-center gap-1">
        {UNITS.map((u) => (
          <button
            key={u}
            className={chip(dark, p.unit === u)}
            onClick={() => store.setPlacement((q) => setUnit(q, u))}
            aria-pressed={p.unit === u}
            title={p.unit === u && p.unitAuto ? (en ? "Unit guessed from the model's size" : "Unitate ghicită din dimensiunea modelului") : en ? `The file is in ${u}` : `Fișierul e în ${u}`}
          >
            {u}
            {p.unit === u && p.unitAuto && <span className="text-[8.5px] uppercase opacity-70">auto</span>}
          </button>
        ))}
        <span className="mx-0.5 h-3 w-px shrink-0 bg-current opacity-20" />
        <button className={iconBtn(dark)} onClick={() => store.setPlacement((q) => rotateQuarter(q))} title={en ? "Turn 90° clockwise" : "Rotește 90° în sensul acelor"} aria-label={en ? "Turn 90°" : "Rotește 90°"}>
          <IconTurn size={13} />
        </button>
        <button className={iconBtn(dark, p.y === 0)} onClick={() => store.setPlacement(ground)} title={en ? "Stand it on the ground (y = 0)" : "Așază-l pe sol (y = 0)"} aria-label={en ? "On the ground" : "Pe sol"}>
          <IconGround size={13} />
        </button>
        <MiniSlider dark={dark} label={en ? "Opacity" : "Opacitate"} value={p.opacity} min={0.1} onChange={(v) => store.setPlacement((q) => ({ ...q, opacity: v }))} />
        <button
          className={iconBtn(dark, p.hidden)}
          onClick={() => store.setPlacement((q) => ({ ...q, hidden: !q.hidden }))}
          title={p.hidden ? (en ? "Show" : "Arată") : en ? "Hide" : "Ascunde"}
          aria-pressed={p.hidden}
          aria-label={en ? "Hide" : "Ascunde"}
        >
          <IconEye size={13} off={p.hidden} />
        </button>
        <button className={iconBtn(dark)} onClick={() => store.removeModel()} title={en ? "Remove from this device" : "Șterge de pe dispozitiv"} aria-label={en ? "Remove" : "Șterge"}>
          <IconTrash size={13} />
        </button>
      </div>

      <div className="flex items-center gap-1">
        {arrows.map((a) => (
          <button key={a.dir} className={iconBtn(dark)} onClick={a.go} title={a.label} aria-label={a.label}>
            <IconChevron size={13} dir={a.dir} />
          </button>
        ))}
        <button className={iconBtn(dark)} onClick={() => move(0, 0, 1)} title={en ? "Raise" : "Ridică"} aria-label={en ? "Raise" : "Ridică"}>
          <span className="font-mono text-[9px]">▲</span>
        </button>
        <button className={iconBtn(dark)} onClick={() => move(0, 0, -1)} title={en ? "Lower" : "Coboară"} aria-label={en ? "Lower" : "Coboară"}>
          <span className="font-mono text-[9px]">▼</span>
        </button>
        <span className="flex-1" />
        {([0.1, 1] as const).map((s) => (
          <button key={s} className={chip(dark, step === s)} onClick={() => setStep(s)} aria-pressed={step === s} title={en ? "Step of one move" : "Pasul unei mutări"}>
            ±{dec(s, lang, s < 1 ? 1 : 0)} m
          </button>
        ))}
      </div>

      <div className={`flex items-center gap-1.5 font-mono text-[10px] ${soft(dark)}`} title={en ? "Opened on this device — never uploaded" : "Deschis pe acest dispozitiv — nu se încarcă nicăieri"}>
        <IconLock size={10} className="shrink-0" />
        <span className="min-w-0 truncate">{entry.name}</span>
        <span className="shrink-0 tabular-nums">
          · {m(w)} × {m(d)} × {m(h)} m · {tris} ▲
        </span>
      </div>
    </div>
  );
}
