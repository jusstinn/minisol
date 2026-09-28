"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import type { Lang } from "@/domain/types";
import { dec } from "@/lib/format";
import { roomMessage } from "@/lib/planRead";
import type { PlanOpening } from "@/lib/planRead";
import { rotatePlan } from "@/lib/uploads/calibration";
import type { UploadsState, UploadsStore } from "@/lib/uploads/store";
import { IconCube, IconSpark, IconTrash, IconWarn } from "../ui/icons";
import { Spinner } from "../ui/primitives";
import { chip, IconCaliper, IconEye, IconLock, IconMove, IconTurn, iconBtn, MiniSlider, monoLabel, soft } from "./uploads/ui";

/**
 * Dock panel for the architect's plan under the plan editor: calibrate, turn, align, show on
 * the 3D ground, opacity, hide, remove — and, when an OpenAI key is configured, read the room
 * sizes with AI. The sizes are only suggestions: tapping one sends it as a normal chat message.
 */
export default function PlanControls({
  state,
  store,
  lang,
  dark,
  projectType,
  aiAvailable,
  onSend,
  chatBusy,
}: {
  state: UploadsState;
  store: UploadsStore;
  lang: Lang;
  dark: boolean;
  projectType: string;
  aiAvailable: boolean;
  onSend?: (text: string) => void;
  chatBusy?: boolean;
}) {
  const en = lang === "en";
  const plan = state.plan;
  const results = useRef<HTMLDivElement>(null);
  // Results that arrive while this panel is open are brought into view (the dock can be short on laptops).
  const read0 = plan?.read;
  const shown = useRef(read0);
  useEffect(() => {
    if (!read0 || read0 === shown.current) return;
    shown.current = read0;
    const t = setTimeout(() => results.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 350);
    return () => clearTimeout(t);
  }, [read0]);
  if (!plan) return null;
  const cal = plan.cal;
  const calibrated = cal.mpp !== null;
  const reading = state.busy === "read";
  const read = plan.read;

  return (
    <div className="space-y-1.5 px-3 pb-2.5 pt-2">
      <div className="flex items-center gap-1">
        <button className={chip(dark, !calibrated)} onClick={() => store.setUi({ calibrating: true })} title={en ? "Tap two points and type the real distance" : "Atinge două puncte și scrie distanța reală"}>
          <IconCaliper size={12} /> {en ? "Calibrate" : "Calibrează"}
        </button>
        <button
          className={chip(dark, state.ui.aligning)}
          onClick={() => store.setUi({ aligning: !state.ui.aligning })}
          aria-pressed={state.ui.aligning}
          title={en ? "Drag the plan in the editor to line it up with the sketch" : "Trage planul în editor ca să-l aliniezi cu schița"}
        >
          <IconMove size={12} /> {state.ui.aligning ? (en ? "Drag it" : "Trage-l") : en ? "Align" : "Aliniază"}
        </button>
        <button className={iconBtn(dark)} onClick={() => store.setCalibration(rotatePlan)} title={en ? "Turn 90° clockwise" : "Rotește 90° în sensul acelor"} aria-label={en ? "Turn 90°" : "Rotește 90°"}>
          <IconTurn size={13} />
        </button>
        <button
          className={chip(dark, calibrated && cal.in3d)}
          disabled={!calibrated}
          onClick={() => store.setCalibration((c) => ({ ...c, in3d: !c.in3d }))}
          aria-pressed={calibrated && cal.in3d}
          title={calibrated ? (en ? "Show the plan on the ground in 3D" : "Arată planul pe sol, în 3D") : en ? "Calibrate first" : "Calibrează întâi"}
        >
          <IconCube size={12} /> 3D
        </button>
        <span className="flex-1" />
        <button
          className={iconBtn(dark, cal.hidden)}
          onClick={() => store.setCalibration((c) => ({ ...c, hidden: !c.hidden }))}
          title={cal.hidden ? (en ? "Show" : "Arată") : en ? "Hide" : "Ascunde"}
          aria-pressed={cal.hidden}
          aria-label={en ? "Hide" : "Ascunde"}
        >
          <IconEye size={13} off={cal.hidden} />
        </button>
        <button className={iconBtn(dark)} onClick={() => store.removePlan()} title={en ? "Remove from this device" : "Șterge de pe dispozitiv"} aria-label={en ? "Remove" : "Șterge"}>
          <IconTrash size={13} />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <MiniSlider dark={dark} label={en ? "Opacity" : "Opacitate"} value={cal.opacity} onChange={(v) => store.setCalibration((c) => ({ ...c, opacity: v }))} />
        <span
          className={`flex min-w-0 shrink items-center gap-1 font-mono text-[10px] ${soft(dark)}`}
          title={en ? "Opened on this device — never uploaded" : "Deschis pe acest dispozitiv — nu se încarcă nicăieri"}
        >
          <IconLock size={10} className="shrink-0" />
          <span className="min-w-0 truncate">{plan.name}</span>
        </span>
        <span className={`shrink-0 font-mono text-[10px] tabular-nums ${calibrated ? soft(dark) : "text-[#ffd479]"}`}>
          {calibrated ? `1 m = ${dec(1 / cal.mpp!, lang, 0)} px` : en ? "not calibrated" : "necalibrat"}
        </span>
      </div>

      {(aiAvailable || read) && (
        <div className={`rounded-xl px-2.5 py-2 ${dark ? "bg-[#dce9ff]/[0.06] ring-1 ring-[#dce9ff]/15" : "bg-ink/[0.03] ring-1 ring-ink/10"}`}>
          {aiAvailable && (
            <button onClick={() => void store.readPlan(projectType, lang)} disabled={reading || state.busy !== null} className="group flex w-full items-start gap-2 text-left disabled:opacity-60">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-on-accent">{reading ? <Spinner className="text-[11px]" /> : <IconSpark size={13} />}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-medium group-enabled:group-hover:underline">
                  {reading ? (en ? "Reading the plan…" : "Citesc planul…") : read ? (en ? "Read the sizes again" : "Citește din nou dimensiunile") : en ? "Read the sizes with AI" : "Citește dimensiunile cu AI"}
                </span>
                <span className={`block text-[11px] leading-snug ${soft(dark)}`}>
                  {en ? "Sends a downscaled copy of this plan to the AI once — nothing else leaves your device." : "Trimite o dată către AI o copie micșorată a planului — restul rămâne pe dispozitiv."}
                </span>
              </span>
            </button>
          )}
          {state.readError && (
            <div className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-[#ff9a92]">
              <IconWarn size={12} /> {state.readError[lang]}
            </div>
          )}
          <AnimatePresence>
            {read && (
              <motion.div ref={results} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className={aiAvailable ? "mt-2" : ""}>
                <div className={`flex items-center gap-2 ${monoLabel(dark)}`}>
                  <span className="flex-1">{en ? "Read by AI — check them" : "Citite de AI — verifică-le"}</span>
                  <span className={`rounded-full px-1.5 py-px text-[9px] ${read.confidence === "high" ? "bg-[#2f9e5b]/25" : read.confidence === "medium" ? "bg-[#ffd479]/20" : "bg-[#ff7a70]/20"}`}>
                    {en ? `${read.confidence} confidence` : { low: "încredere mică", medium: "încredere medie", high: "încredere mare" }[read.confidence]}
                  </span>
                </div>
                {read.rooms.length ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {read.rooms.map((r, i) => {
                      const text = roomMessage(r, lang);
                      return (
                        <button
                          key={`${r.name}-${i}`}
                          disabled={!onSend || chatBusy}
                          onClick={() => onSend?.(text)}
                          className={chip(dark)}
                          title={en ? "Send to the chat — the assistant uses it once you confirm" : "Trimite în chat — asistentul o folosește după ce confirmi"}
                        >
                          {text} <span aria-hidden>→</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className={`mt-1 text-[11.5px] ${soft(dark)}`}>{en ? "No sizes found on this plan." : "Nu am găsit dimensiuni pe acest plan."}</div>
                )}
                {read.openings.length > 0 && <div className={`mt-1.5 font-mono text-[10.5px] ${soft(dark)}`}>{openingsSummary(read.openings, lang)}</div>}
                {read.note && <p className={`mt-1 text-[11.5px] leading-snug ${soft(dark)}`}>{read.note}</p>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function openingsSummary(openings: PlanOpening[], lang: Lang): string {
  const en = lang === "en";
  const doors = openings.filter((o) => o.kind === "door").length;
  const windows = openings.filter((o) => o.kind === "window").length;
  const other = openings.length - doors - windows;
  const parts = [
    doors && (en ? `${doors} door${doors > 1 ? "s" : ""}` : `${doors} ${doors > 1 ? "uși" : "ușă"}`),
    windows && (en ? `${windows} window${windows > 1 ? "s" : ""}` : `${windows} ${windows > 1 ? "ferestre" : "fereastră"}`),
    other && (en ? `${other} opening${other > 1 ? "s" : ""}` : `${other} ${other > 1 ? "goluri" : "gol"}`),
  ].filter(Boolean);
  return parts.join(" · ");
}
