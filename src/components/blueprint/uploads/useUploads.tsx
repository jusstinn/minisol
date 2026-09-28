"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Lang } from "@/domain/types";
import { calibrate } from "@/lib/uploads/calibration";
import { ACCEPT } from "@/lib/uploads/files";
import type { UploadsState } from "@/lib/uploads/store";
import type { Build } from "../builders";
import ModelControls from "../ModelControls";
import PlanCalibrator from "../PlanCalibrator";
import PlanControls from "../PlanControls";
import PlanGround from "../PlanGround";
import PlanUnderlay from "../PlanUnderlay";
import type { PlanFrame } from "../PlanUnderlay";
import type { ViewMode } from "../Scene";
import UserModel from "../UserModel";
import { IconWarn } from "../../ui/icons";
import { Spinner } from "../../ui/primitives";
import { useUploadsEnv } from "./UploadsContext";
import { IconHouse, IconPlanFile, IconUpload, rule, soft } from "./ui";

/**
 * Everything "bring your own plans and models" adds to the sketch panel, as ready-made pieces
 * that BlueprintPanel drops into its existing layout (so its own diff stays a few lines):
 * the 3D extras for <Scene extra>, the upload buttons, the dock panel, the plan editor
 * underlay, the drop target and the overlays (toasts, calibration dialog).
 */

export interface Uploads {
  /** For <Scene extra={…}>: the customer's model and the plan on the ground. */
  sceneExtra: React.ReactNode;
  /** "Încarcă" in the sketch's controls row. */
  button: React.ReactNode;
  /** Compact upload button for the plan editor dock header. */
  dockButton: React.ReactNode;
  /** The files panel inside the dock. */
  dock: React.ReactNode;
  /** Drop overlay, progress / error toasts, the calibration dialog, the hidden file input. */
  overlay: React.ReactNode;
  /** Spread on the sketch panel so files can be dropped on it. */
  dropProps: Pick<React.HTMLAttributes<HTMLDivElement>, "onDragEnter" | "onDragOver" | "onDragLeave" | "onDrop">;
  /** For <PlanEditor underlay={…}>. */
  underlay?: (frame: PlanFrame) => React.ReactNode;
}

const EMPTY_STATE: UploadsState = {
  model: null,
  plan: null,
  busy: null,
  error: null,
  notice: null,
  aiAvailable: false,
  readError: null,
  added: null,
  ui: { calibrating: false, aligning: false, open: null },
};
const noopSubscribe = () => () => {};
const emptySnapshot = () => EMPTY_STATE;

const isIOS = () => typeof navigator !== "undefined" && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

export function useUploads({
  lang,
  dark,
  mode,
  lite,
  inline,
  build,
  projectType,
  enabled,
  openEditor,
}: {
  lang: Lang;
  dark: boolean;
  mode: ViewMode;
  lite?: boolean | "low";
  inline?: boolean;
  build: Build;
  projectType: string;
  /** Only the current, editable project gets uploads. */
  enabled: boolean;
  /** Called with true when a file was added, so the plan editor dock (with its controls) opens. */
  openEditor?: (open: boolean) => void;
}): Uploads {
  const env = useUploadsEnv();
  const on = Boolean(env && enabled);
  const store = env?.store;
  const state = useSyncExternalStore(store && on ? store.subscribe : noopSubscribe, store && on ? store.getSnapshot : emptySnapshot, emptySnapshot);
  const en = lang === "en";
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [dragging, setDragging] = useState(false);
  const aiAvailable = state.aiAvailable && !env?.offline;

  // A newly added file opens the dock once (a remounted sketch doesn't re-open it).
  const seenAdd = useRef(state.added?.seq ?? 0);
  useEffect(() => {
    if (!state.added || state.added.seq === seenAdd.current) return;
    seenAdd.current = state.added.seq;
    openEditor?.(true);
  }, [state.added, openEditor]);

  // Toasts go away by themselves.
  const toastAt = state.error?.at ?? state.notice?.at;
  useEffect(() => {
    if (!toastAt || !store) return;
    const t = setTimeout(() => store.clearError(), 6500);
    return () => clearTimeout(t);
  }, [toastAt, store]);

  const center: [number, number] = build.center ?? [0, 0];
  const extent = Math.max(build.extent[0], build.extent[2]);
  const addFiles = useCallback(
    (files: FileList | File[] | null) => {
      if (!store || !files) return;
      // At most one model and one plan per drop.
      const list = Array.from(files).slice(0, 2);
      void (async () => {
        for (const f of list) await store.addFile(f, { center, extent });
      })();
    },
    // center is a fresh tuple each render; its numbers are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, center[0], center[1], extent],
  );

  if (!on || !store || !env) {
    return { sceneExtra: null, button: null, dockButton: null, dock: null, overlay: null, dropProps: {} };
  }

  const pick = () => inputRef.current?.click();
  const loading = state.busy === "model" || state.busy === "plan";

  const sceneExtra = (
    <>
      {state.model && <UserModel entry={state.model} mode={mode} lite={lite} />}
      {state.plan && <PlanGround plan={state.plan} mode={mode} />}
    </>
  );

  const button = (
    <button
      onClick={pick}
      disabled={loading}
      title={en ? "Upload your own 3D model (GLB, GLTF, OBJ) or plan (PNG, JPG, WebP, PDF) — it stays on your device" : "Încarcă modelul tău 3D (GLB, GLTF, OBJ) sau un plan (PNG, JPG, WebP, PDF) — rămâne pe dispozitiv"}
      className={`flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-full px-2 font-mono text-[10.5px] uppercase tracking-wider backdrop-blur transition disabled:opacity-60 sm:px-3 ${
        dark ? "bg-[#0a1f47]/70 text-[#dce9ff] ring-1 ring-[#dce9ff]/25 hover:text-white" : "bg-white/70 text-ink-2 ring-1 ring-ink/10"
      }`}
    >
      {loading ? <Spinner className="text-[13px]" /> : <IconUpload size={14} />}
      <span className={inline ? "sr-only" : "hidden sm:inline"}>{en ? "Upload" : "Încarcă"}</span>
    </button>
  );

  const open = state.ui.open;
  const toggle = (slot: "model" | "plan") => store.setUi({ open: open === slot ? null : slot });
  const has = Boolean(state.model || state.plan);
  const headChip = (active: boolean) =>
    `flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 normal-case tracking-normal transition ${active ? "bg-accent text-on-accent" : "enabled:hover:bg-current/10"}`;

  // Dock header: a chip per file (opens its controls) and the upload button.
  const dockButton = (
    <span className="flex shrink-0 items-center gap-0.5">
      {state.model && (
        <button className={headChip(open === "model")} onClick={() => toggle("model")} aria-expanded={open === "model"} title={state.model.name}>
          <IconHouse size={12} />
          {en ? "3D" : "3D"}
        </button>
      )}
      {state.plan && (
        <button className={headChip(open === "plan")} onClick={() => toggle("plan")} aria-expanded={open === "plan"} title={state.plan.name}>
          <IconPlanFile size={12} />
          {en ? "Plan" : "Plan"}
          {state.plan.cal.mpp === null && <span className="h-1.5 w-1.5 rounded-full bg-[#ffd479]" aria-label={en ? "not calibrated" : "necalibrat"} />}
        </button>
      )}
      <button
        onClick={pick}
        disabled={loading}
        className={headChip(false) + " disabled:opacity-35"}
        title={en ? "Upload a 3D model or a plan — it stays on your device" : "Încarcă un model 3D sau un plan — rămâne pe dispozitiv"}
        aria-label={en ? "Upload" : "Încarcă"}
      >
        <IconUpload size={12} />
        {!has && (en ? "Upload" : "Încarcă")}
      </button>
    </span>
  );

  // The open file's controls, under the plan editor. On desktop the dock is a flex column squeezed
  // into the sketch's right column: this part takes the height that is left and scrolls.
  const dock = has && open && (
    <div className={`thin-scroll min-h-[40px] shrink overflow-y-auto border-t ${rule(dark)} ${inline ? "max-h-[46vh]" : ""}`}>
      {open === "model" && state.model && <ModelControls entry={state.model} store={store} lang={lang} dark={dark} />}
      {open === "plan" && state.plan && (
        <PlanControls state={state} store={store} lang={lang} dark={dark} projectType={projectType} aiAvailable={aiAvailable} onSend={env.onSend} chatBusy={env.busy} />
      )}
    </div>
  );

  const underlay = state.plan ? (frame: PlanFrame) => <PlanUnderlay frame={frame} plan={state.plan!} dark={dark} aligning={state.ui.aligning} onMove={(cx, cz) => store.setCalibration((c) => ({ ...c, cx, cz }))} /> : undefined;

  const toast = state.error ?? state.notice;
  const overlay = (
    <>
      <span ref={anchorRef} hidden />
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={isIOS() ? undefined : ACCEPT}
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-2 z-30 grid place-items-center rounded-[18px] border-2 border-dashed border-accent bg-[#071634]/70 text-center text-[#e6efff] backdrop-blur-sm"
          >
            <div className="max-w-[360px] px-6">
              <IconUpload size={28} className="mx-auto text-accent" />
              <div className="display mt-2 text-[22px] text-white">{en ? "Drop it on the sketch" : "Lasă fișierul pe schiță"}</div>
              <p className="mt-1.5 text-[13px] leading-snug text-[#c7d9fa]">
                {en ? "A 3D model (GLB, GLTF, OBJ) or a plan (PNG, JPG, WebP, PDF). It stays on your device." : "Un model 3D (GLB, GLTF, OBJ) sau un plan (PNG, JPG, WebP, PDF). Rămâne pe dispozitivul tău."}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {(loading || toast) && (
          <motion.div
            key={loading ? `busy-${state.busy}` : `toast-${toast?.at}`}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            role="status"
            className={`absolute left-1/2 top-12 z-20 flex max-w-[86%] -translate-x-1/2 items-center gap-2 rounded-full px-3 py-1.5 text-[12px] shadow-lg ${
              loading || !state.error ? (dark ? "bg-[#0a1f47]/90 text-[#e6efff] ring-1 ring-[#dce9ff]/25" : "bg-white/95 text-ink ring-1 ring-ink/10") : "bg-[#b3261e] text-white"
            }`}
          >
            {loading ? <Spinner /> : <IconWarn size={13} className={state.error ? "" : soft(dark)} />}
            <span className="min-w-0">
              {loading
                ? state.busy === "model"
                  ? en ? "Opening your model on this device…" : "Deschid modelul pe dispozitiv…"
                  : en ? "Preparing your plan…" : "Pregătesc planul…"
                : toast?.[lang]}
            </span>
            {!loading && (
              <button onClick={() => store.clearError()} className="ml-1 opacity-70 hover:opacity-100" aria-label={en ? "Close" : "Închide"}>
                ×
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      {state.ui.calibrating && state.plan && (
        <PlanCalibrator
          key={state.plan.url}
          plan={state.plan}
          lang={lang}
          anchor={anchorRef}
          onClose={() => store.setUi({ calibrating: false })}
          onApply={(a, b, m) => {
            const plan = state.plan!;
            const next = calibrate(plan.cal, plan.img, a, b, m);
            if (next) store.setCalibration(() => next);
            store.setUi({ calibrating: false, open: "plan" });
          }}
        />
      )}
    </>
  );

  const dropProps: Uploads["dropProps"] = {
    onDragEnter: (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(true);
    },
    onDragOver: (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      if (!dragging) setDragging(true);
    },
    onDragLeave: (e) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setDragging(false);
    },
    onDrop: (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(false);
      addFiles(e.dataTransfer.files);
    },
  };

  return { sceneExtra, button, dockButton, dock, overlay, dropProps, underlay };
}
