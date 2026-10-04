"use client";

import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Card, ProjectSnapshot } from "@/agent/types";
import type { Tenant } from "@/config/tenant";
import { exposedEdges, fenceSegments } from "@/domain/layout";
import type { Layout, SketchOp } from "@/domain/layout";
import type { Look } from "@/domain/look";
import type { Lang } from "@/domain/types";
import { dec, unitText } from "@/lib/format";
import { tr } from "@/lib/i18n";
import type { UiSignal } from "@/lib/useAgent";
import type { LiteGraphics } from "@/lib/useLiteGraphics";
import { buildScene } from "../blueprint/builders";
import type { ViewMode } from "../blueprint/Scene";
import { useUploads } from "../blueprint/uploads/useUploads";
import { IconClock, IconClose, IconCube, IconGrid, IconLayers, IconPencil, IconReplay, IconRotate, IconUndo, IconUsers, IconWarn } from "../ui/icons";
import ChangeCard, { Rolling, signed } from "./ChangeCard";
import SceneBoundary from "../blueprint/SceneBoundary";
import { useSketchMode } from "../workspace/NextStepChips";

const Scene = dynamic(() => import("../blueprint/Scene"), {
  ssr: false,
  loading: () => <div className="shimmer absolute inset-0 opacity-20" />,
});
const PlanEditor = dynamic(() => import("../blueprint/PlanEditor"), { ssr: false });

export interface SketchControls {
  edit: (ops: SketchOp[]) => Promise<boolean>;
  undo: () => void;
  open: () => void;
  busy: boolean;
  error: string | null;
  clearError: () => void;
  canUndo: boolean;
}


export default function BlueprintPanel({
  project,
  tenant,
  lang,
  highlight,
  onHighlight,
  inline,
  sketch,
  change,
  ui,
  look,
  lite,
  paused,
}: {
  project: ProjectSnapshot;
  tenant: Tenant;
  lang: Lang;
  highlight: string | null;
  onHighlight: (l: string | null) => void;
  inline?: boolean;
  sketch?: SketchControls;
  change?: Extract<Card, { kind: "change" }>;
  /** Screen commands from the assistant (view, highlight, editor, replay). */
  ui?: UiSignal | null;
  /** The chosen products' look (colour, board width, tile format…). */
  look?: Look;
  /** Lighter 3D for phones / low-end devices (see useLiteGraphics). */
  lite?: LiteGraphics;
  /** Mounted in a hidden phone tab: don't render frames. */
  paused?: boolean;
}) {
  const sketchMode = useSketchMode(tenant);
  const wantsSketch = Boolean(ui && (ui.command.view || ui.command.editor || ui.command.highlight || ui.command.replay || ui.command.panel === "sketch"));
  // Asking the assistant to show something on the sketch opens it (on-demand tenants).
  const closed = sketchMode === "on_demand" && !project.sketched;
  useEffect(() => {
    if (closed && wantsSketch && ui && Date.now() - ui.at < 5000) sketch?.open();
    // Once per command.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui?.seq]);
  if (sketchMode === "on_demand" && !project.sketched && sketch) {
    return <SketchCta project={project} lang={lang} inline={inline} onOpen={sketch.open} />;
  }
  return <SketchView project={project} tenant={tenant} lang={lang} highlight={highlight} onHighlight={onHighlight} inline={inline} sketch={sketch} change={change} ui={ui} look={look} lite={lite} paused={paused} />;
}

function SketchView({
  project,
  tenant,
  lang,
  highlight,
  onHighlight,
  inline,
  sketch,
  change,
  ui,
  look,
  lite,
  paused,
}: {
  project: ProjectSnapshot;
  tenant: Tenant;
  lang: Lang;
  highlight: string | null;
  onHighlight: (l: string | null) => void;
  inline?: boolean;
  sketch?: SketchControls;
  change?: Extract<Card, { kind: "change" }>;
  ui?: UiSignal | null;
  look?: Look;
  lite?: LiteGraphics;
  paused?: boolean;
}) {
  const en = lang === "en";
  const [mode, setMode] = useState<ViewMode>("blueprint");
  const [rotate, setRotate] = useState(true);
  const [replay, setReplay] = useState(0);
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState<Layout | null>(null);
  const [seenLayout, setSeenLayout] = useState(project.layout);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [diff, setDiff] = useState<{ added: number; changed: number; removed: number; at: number } | null>(null);

  // Apply the assistant's screen commands once each (fresh ones also when this view mounts).
  const [uiSeen, setUiSeen] = useState<number | null>(() => (ui && Date.now() - ui.at > 5000 ? ui.seq : null));
  if (ui && ui.seq !== uiSeen) {
    setUiSeen(ui.seq);
    const c = ui.command;
    if (c.view) setMode(c.view);
    if (typeof c.editor === "boolean") setEditing(c.editor && Boolean(sketch && project.layout));
    if (c.replay) setReplay((r) => r + 1);
    if (c.view || c.editor || c.highlight) setRotate(false);
  }

  // A newly committed layout replaces any drag preview.
  if (seenLayout !== project.layout) {
    setSeenLayout(project.layout);
    setPreview(null);
  }
  const layout = preview ?? project.layout;
  const build = useMemo(() => buildScene(project.type, project.inputs, lang, layout, look), [project.type, project.inputs, lang, layout, look]);
  const dark = mode !== "real";
  const canEdit = Boolean(sketch && project.layout);
  // The customer's own 3D model / architect's plan (see blueprint/uploads).
  const up = useUploads({ lang, dark, mode, lite, inline, build, projectType: project.type, enabled: canEdit, openEditor: setEditing });

  const onDiff = useCallback((d: { added: number; changed: number; removed: number }) => {
    if (d.added + d.changed + d.removed > 0) setDiff({ ...d, at: Date.now() });
  }, []);
  useEffect(() => {
    if (!diff) return;
    const t = setTimeout(() => setDiff(null), 3200);
    return () => clearTimeout(t);
  }, [diff]);
  useEffect(() => {
    if (!sketch?.error) return;
    const t = setTimeout(() => sketch.clearError(), 4500);
    return () => clearTimeout(t);
  }, [sketch]);

  const commit = useCallback(async (ops: SketchOp[]) => (sketch ? sketch.edit(ops) : false), [sketch]);
  const showChange = change && change.id !== dismissed && change.change.lines.length + change.change.edits.length > 0 ? change : undefined;
  const floatingChange = !inline && showChange;
  // On phones the assistant's change card is already in the conversation; show hand edits here.
  const inlineChange = inline && showChange?.change.source === "editor" ? showChange : undefined;

  const modes: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
    { id: "blueprint", label: tr("viewBlueprint", lang), icon: <IconGrid size={14} /> },
    { id: "real", label: tr("viewReal", lang), icon: <IconCube size={14} /> },
    { id: "exploded", label: tr("viewExploded", lang), icon: <IconLayers size={14} /> },
  ];

  const committed = project.layout;
  const dock = editing && canEdit && committed && (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={`thin-scroll overflow-y-auto overflow-x-hidden rounded-2xl ring-1 backdrop-blur-md ${
        inline ? "" : "max-h-full shadow-[0_24px_60px_-24px_rgba(0,0,0,0.6)]"
      } ${dark ? "bg-[#071634]/80 text-[#e6efff] ring-[#dce9ff]/25" : "bg-white/90 text-ink ring-ink/10"}`}
    >
      <div className={`flex items-center gap-2 border-b px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] ${dark ? "border-[#dce9ff]/15 text-[#9fbcf0]" : "border-ink/10 text-ink-3"}`}>
        <IconPencil size={12} />
        <span className="flex-1 truncate">{en ? "Plan · drag edges, tap +" : "Plan · trage de margini, apasă +"}</span>
        {sketch?.busy && <span className="animate-pulse normal-case tracking-normal">{en ? "recalculating…" : "recalculez…"}</span>}
        {up.dockButton}
        <button
          disabled={!sketch?.canUndo || sketch.busy}
          onClick={() => sketch?.undo()}
          className="flex items-center gap-1 rounded-full px-2 py-0.5 normal-case tracking-normal transition enabled:hover:bg-current/10 disabled:opacity-35"
        >
          <IconUndo size={12} />
          {en ? "Undo" : "Anulează"}
        </button>
      </div>
      {change && (
        <motion.div
          key={change.id}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className={`flex items-center gap-2 border-b px-3 py-2 text-[12px] ${dark ? "border-[#dce9ff]/15" : "border-ink/10"}`}
        >
          <span className="min-w-0 flex-1 truncate opacity-80" title={change.change.edits.join(" · ")}>
            {change.change.edits.at(-1)}
          </span>
          <span className="font-mono tabular-nums">
            <Rolling from={change.change.totalBefore} to={change.change.totalAfter} lang={lang} />
          </span>
          <span
            className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums ${
              change.change.delta > 0 ? "bg-accent text-on-accent" : change.change.delta < 0 ? "bg-[#2f9e5b] text-white" : "bg-current/10"
            }`}
          >
            {signed(change.change.delta, lang)}
          </span>
        </motion.div>
      )}
      <QuickControls layout={committed} lang={lang} dark={dark} busy={Boolean(sketch?.busy)} onCommit={commit} />
      <div className="px-2 pb-2">
        <PlanEditor layout={committed} lang={lang} dark={dark} busy={Boolean(sketch?.busy)} onPreview={setPreview} onCommit={commit} underlay={up.underlay} />
      </div>
      {up.dock}
    </motion.div>
  );

  return (
    <div className={inline ? "space-y-3" : undefined}>
      <div
        className={`relative overflow-hidden rounded-[22px] transition-colors duration-700 ${
          dark ? "bp-sheet" : "bg-[radial-gradient(120%_100%_at_30%_0%,#fbf8f1,#e7e1d3)] text-ink"
        } ${inline ? "h-[380px]" : "h-[clamp(460px,62vh,660px)]"}`}
        {...up.dropProps}
      >
        <div className="absolute inset-0">
          <SceneBoundary resetKey={build} en={lang === "en"} dark={dark}>
          <Scene
            build={build}
            mode={mode}
            highlightLayer={highlight}
            autoRotate={rotate && !editing}
            replayKey={replay}
            accent={tenant.accent}
            compact={inline}
            onDiff={onDiff}
            focusLeft={(editing || Boolean(floatingChange)) && !inline}
            lite={lite}
            paused={paused}
            extra={up.sceneExtra}
          />
          </SceneBoundary>
        </div>

        {/* title block — kept clear of the controls column on the right (≈7.5 rem on phones, ≈18 rem with labels from sm) */}
        <div className="pointer-events-none absolute left-4 right-[9.5rem] top-4 sm:left-6 sm:right-[18.5rem] sm:top-5">
          <div className={`flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] ${dark ? "text-[#9fbcf0]" : "text-ink-3"}`}>
            <span>{en ? "Indicative sketch" : "Schiță orientativă"}</span>
            <span
              className={`pointer-events-auto rounded-full px-2 py-0.5 text-[9px] tracking-[0.12em] ${dark ? "bg-[#0a1f47]/70 text-[#ffd479] ring-1 ring-[#ffd479]/40" : "bg-warn/15 text-ink"}`}
              title={
                en
                  ? "A to-scale visualisation of your dimensions. It does not account for slope, soil, loads or existing structures and is not a construction plan."
                  : "Vizualizare la scară a dimensiunilor tale. Nu ține cont de pantă, teren, sarcini sau structuri existente și nu este un proiect de execuție."
              }
            >
              {en ? "not a technical plan" : "nu e proiect tehnic"}
            </span>
            {(project.revision ?? 0) > 0 && (
              <span className={`rounded-full px-2 py-0.5 text-[9px] tracking-[0.12em] ${dark ? "bg-[#dce9ff]/10" : "bg-ink/5"}`}>
                {en ? "rev." : "rev."} {project.revision}
              </span>
            )}
          </div>
          <motion.h2
            key={project.title}
            initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className={`display mt-1 ${inline ? "line-clamp-2 text-[21px] leading-[1.05]" : "text-[clamp(26px,3.4vw,46px)]"} ${dark ? "text-white" : "text-ink"}`}
          >
            {project.title}
          </motion.h2>
          {/* On phones the facts card under the sketch lists these; keep the drawing clear. */}
          <div className={`mt-3 space-y-0.5 font-mono text-[11px] ${inline ? "hidden" : ""} ${dark ? "text-[#dce9ff]" : "text-ink-2"}`}>
            {project.measurements.slice(0, inline ? 2 : 4).map((m, i) => (
              <motion.div key={m.label} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.12 }} className="flex gap-2">
                <span className={dark ? "text-[#8fb0e8]" : "text-ink-3"}>{m.label}</span>
                <motion.span key={`${m.value}`} initial={{ opacity: 0.3 }} animate={{ opacity: 1 }} className="font-medium">
                  {dec(m.value, lang, m.unit === "buc" || m.unit === "rânduri" ? 0 : 2)} {unitText(m.unit, lang)}
                </motion.span>
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
                aria-pressed={mode === m.id}
                aria-label={m.label}
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
            {canEdit && (
              <button
                onClick={() => setEditing((e) => !e)}
                aria-pressed={editing}
                aria-label={editing ? (en ? "Done editing" : "Gata cu modificările") : en ? "Edit sketch" : "Modifică schița"}
                className={`flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-full px-2 font-mono sm:px-3 text-[10.5px] uppercase tracking-wider backdrop-blur transition ${
                  editing ? "bg-accent text-on-accent" : dark ? "bg-[#0a1f47]/70 text-[#dce9ff] ring-1 ring-[#dce9ff]/25 hover:text-white" : "bg-white/70 text-ink-2 ring-1 ring-ink/10"
                }`}
              >
                {editing ? <IconClose size={14} /> : <IconPencil size={14} />}
                <span className={inline ? "sr-only" : "hidden sm:inline"}>{editing ? (en ? "Done" : "Gata") : en ? "Edit sketch" : "Modifică"}</span>
              </button>
            )}
            {up.button}
            <RoundBtn dark={dark} onClick={() => setReplay((r) => r + 1)} title={en ? "Replay the build" : "Reia construcția"}>
              <IconReplay size={15} />
            </RoundBtn>
            <RoundBtn dark={dark} active={rotate && !editing} onClick={() => setRotate((r) => !r)} title={en ? "Rotate" : "Rotește"}>
              <IconRotate size={15} />
            </RoundBtn>
          </div>
        </div>

        {/* what the last edit did to the 3D model */}
        <AnimatePresence>
          {diff && (
            <motion.div
              key={diff.at}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`pointer-events-none absolute left-6 hidden gap-3 rounded-full px-3 py-1.5 font-mono text-[10.5px] tracking-wide backdrop-blur sm:flex ${
                editing ? "bottom-[92px]" : "bottom-[58px]"
              } ${
                dark ? "bg-[#0a1f47]/75 text-[#e6efff] ring-1 ring-[#dce9ff]/25" : "bg-white/80 text-ink ring-1 ring-ink/10"
              }`}
            >
              {diff.added > 0 && <span className="text-accent">▲ {diff.added} {en ? "new parts" : "piese noi"}</span>}
              {diff.changed > 0 && <span>◆ {diff.changed} {en ? "resized" : "redimensionate"}</span>}
              {diff.removed > 0 && <span className="text-[#ff7a70]">▼ {diff.removed} {en ? "removed" : "scoase"}</span>}
            </motion.div>
          )}
        </AnimatePresence>

        {/* edit rejected */}
        <AnimatePresence>
          {sketch?.error && (
            <motion.button
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              onClick={sketch.clearError}
              className="absolute left-1/2 top-12 z-20 flex max-w-[80%] -translate-x-1/2 items-center gap-2 rounded-full bg-[#b3261e] px-3 py-1.5 text-left text-[12px] text-white shadow-lg"
            >
              <IconWarn size={13} />
              <span className="truncate">
                {en ? "Can't do that: " : "Nu se poate: "}
                {sketch.error}
              </span>
            </motion.button>
          )}
        </AnimatePresence>
        {up.overlay}

        {/* legend */}
        <div className={`absolute bottom-3 left-3 right-3 flex flex-wrap items-end gap-1.5 sm:bottom-5 sm:left-6 sm:right-auto ${editing && !inline ? "sm:max-w-[38%]" : "sm:max-w-[60%]"}`}>
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

        {/* right column: plan editor dock, change receipt, or the estimate */}
        {!inline && (
          <div className="absolute bottom-5 right-5 top-[118px] hidden w-[min(380px,44%)] flex-col justify-end gap-3 sm:flex">
            <AnimatePresence mode="popLayout">{dock}</AnimatePresence>
            <AnimatePresence mode="popLayout">
              {floatingChange && !editing && (
                <ChangeCard
                  key={floatingChange.id}
                  change={floatingChange.change}
                  lang={lang}
                  dark={dark}
                  compact
                  onUndo={sketch?.canUndo ? sketch.undo : undefined}
                  onClose={() => setDismissed(floatingChange.id)}
                />
              )}
            </AnimatePresence>
            {!editing && !floatingChange && <Estimate project={project} lang={lang} dark={dark} />}
          </div>
        )}
      </div>

      {inline && (
        <>
          <AnimatePresence>{dock}</AnimatePresence>
          <AnimatePresence>{inlineChange && <ChangeCard key={inlineChange.id} change={inlineChange.change} lang={lang} compact onUndo={sketch?.canUndo ? sketch.undo : undefined} />}</AnimatePresence>
        </>
      )}
    </div>
  );
}

/** Type-specific one-tap controls above the plan (height, direction, toggles). */
function QuickControls({ layout, lang, dark, busy, onCommit }: { layout: Layout; lang: Lang; dark: boolean; busy: boolean; onCommit: (ops: SketchOp[]) => Promise<boolean> }) {
  const en = lang === "en";
  const [draft, setDraft] = useState<number | null>(null);
  const chip = (active: boolean) =>
    `rounded-full px-2.5 py-1 font-mono text-[10.5px] transition disabled:opacity-40 ${
      active ? "bg-accent text-on-accent" : dark ? "bg-[#dce9ff]/10 hover:bg-[#dce9ff]/20" : "bg-ink/5 hover:bg-ink/10"
    }`;
  const set = (key: string, value: string | number | boolean) => void onCommit([{ op: "set_option", key, value }]);
  const row = (children: React.ReactNode) => <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2.5">{children}</div>;

  switch (layout.type) {
    case "deck": {
      const cm = draft ?? Math.round(layout.heightM * 100);
      return (
        <>
          <div className="flex items-center gap-2 px-3 pt-2.5 font-mono text-[10.5px]">
            <span className="w-[92px] shrink-0 opacity-70">{en ? "Height" : "Înălțime"}</span>
            <input
              type="range"
              min={10}
              max={120}
              step={5}
              value={cm}
              disabled={busy}
              onChange={(e) => setDraft(Number(e.target.value))}
              onPointerUp={() => draft !== null && void onCommit([{ op: "set_height", value: draft / 100 }]).then(() => setDraft(null))}
              onKeyUp={() => draft !== null && void onCommit([{ op: "set_height", value: draft / 100 }]).then(() => setDraft(null))}
              className="h-1 flex-1 accent-[var(--accent)]"
              aria-label={en ? "Deck height" : "Înălțimea terasei"}
            />
            <span className="w-12 text-right tabular-nums">{cm} cm</span>
          </div>
          {row(
            <>
              <button disabled={busy} className={chip(layout.direction === "x")} onClick={() => set("direction", "x")}>
                ↔ {en ? "boards" : "deck"}
              </button>
              <button disabled={busy} className={chip(layout.direction === "z")} onClick={() => set("direction", "z")}>
                ↕ {en ? "boards" : "deck"}
              </button>
              <span className="mx-1 h-3 w-px bg-current opacity-20" />
              {(["soil", "gravel", "concrete_slab"] as const).map((b) => (
                <button key={b} disabled={busy} className={chip(layout.base === b)} onClick={() => set("base", b)}>
                  {b === "soil" ? (en ? "soil" : "pământ") : b === "gravel" ? (en ? "gravel" : "pietriș") : en ? "slab" : "beton"}
                </button>
              ))}
            </>,
          )}
        </>
      );
    }
    case "fence":
      return row(
        <>
          <span className="mr-1 font-mono text-[10.5px] opacity-70">{en ? "Height" : "Înălțime"}</span>
          {[0.9, 1.2, 1.8].map((h) => (
            <button key={h} disabled={busy} className={chip(layout.heightM === h)} onClick={() => void onCommit([{ op: "set_height", value: h }])}>
              {dec(h, lang, 1)} m
            </button>
          ))}
        </>,
      );
    case "paint_room":
      return row(
        <>
          <button disabled={busy} className={chip(layout.ceiling)} onClick={() => set("ceiling", !layout.ceiling)}>
            {en ? "Ceiling" : "Tavan"} {layout.ceiling ? "✓" : "—"}
          </button>
          {[1, 2, 3].map((c) => (
            <button key={c} disabled={busy} className={chip(layout.coats === c)} onClick={() => set("coats", c)}>
              {c} {en ? (c === 1 ? "coat" : "coats") : c === 1 ? "strat" : "straturi"}
            </button>
          ))}
        </>,
      );
    case "tiling":
      return row(
        <>
          <button disabled={busy} className={chip(layout.floor)} onClick={() => set("floor", !layout.floor)}>
            {en ? "Floor tiles" : "Gresie"} {layout.floor ? "✓" : "—"}
          </button>
          <span className="mx-1 h-3 w-px bg-current opacity-20" />
          <span className="mr-1 font-mono text-[10.5px] opacity-70">{en ? "All walls" : "Toți pereții"}</span>
          {[0, 1.2, 2.1].map((h) => (
            <button
              key={h}
              disabled={busy}
              className={chip(Object.values(layout.wallHeights).every((v) => Math.abs(v - h) < 0.01))}
              onClick={() => void onCommit([{ op: "set_wall_tiles", wall: "all", value: h }])}
            >
              {h === 0 ? "—" : `${dec(h, lang, 1)} m`}
            </button>
          ))}
        </>,
      );
    case "drywall_partition":
      return row(
        <>
          <button disabled={busy} className={chip(layout.insulation)} onClick={() => set("insulation", !layout.insulation)}>
            {en ? "Insulation" : "Izolație"} {layout.insulation ? "✓" : "—"}
          </button>
          <button disabled={busy} className={chip(layout.doubleLayer)} onClick={() => set("doubleLayer", !layout.doubleLayer)}>
            {en ? "Double board" : "Placare dublă"} {layout.doubleLayer ? "✓" : "—"}
          </button>
        </>,
      );
    case "laminate_floor":
      return row(
        <>
          {(["straight", "diagonal"] as const).map((p) => (
            <button key={p} disabled={busy} className={chip(layout.pattern === p)} onClick={() => set("pattern", p)}>
              {p === "straight" ? (en ? "Straight" : "Drept") : en ? "Diagonal" : "Diagonal"}
            </button>
          ))}
        </>,
      );
    case "lawn":
      return row(
        <>
          {(["new", "overseed"] as const).map((md) => (
            <button key={md} disabled={busy} className={chip(layout.mode === md)} onClick={() => set("mode", md)}>
              {md === "new" ? (en ? "New lawn" : "Gazon nou") : en ? "Overseed" : "Reînsămânțare"}
            </button>
          ))}
        </>,
      );
    case "paving":
      return row(
        <>
          {(["path", "patio", "driveway"] as const).map((u) => (
            <button key={u} disabled={busy} className={chip(layout.use === u)} onClick={() => set("use", u)}>
              {u === "path" ? (en ? "Path" : "Alee") : u === "patio" ? (en ? "Patio" : "Terasă") : en ? "Driveway" : "Auto"}
            </button>
          ))}
          <span className="mx-1 h-3 w-px bg-current opacity-20" />
          <button disabled={busy} className={chip(layout.edging)} onClick={() => set("edging", !layout.edging)}>
            {en ? "Edging" : "Borduri"} {layout.edging ? "✓" : "—"}
          </button>
        </>,
      );
  }
}

function Estimate({ project, lang, dark }: { project: ProjectSnapshot; lang: Lang; dark: boolean }) {
  return (
    <div className={`self-end border font-mono text-[10px] uppercase tracking-[0.12em] ${dark ? "border-[#dce9ff]/35 text-[#dce9ff]" : "border-ink/20 text-ink-2"}`}>
      <EstRow dark={dark} icon={<IconClock size={12} />} k={lang === "en" ? "Est. time" : "Timp estimat"} v={`${project.estimate.hoursMin}–${project.estimate.hoursMax} ${tr("hours", lang)}`} />
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
  );
}

/** On-demand tenants: a light card with a self-drawing outline instead of the 3D scene, until the customer asks for it. */
function SketchCta({ project, lang, inline, onOpen }: { project: ProjectSnapshot; lang: Lang; inline?: boolean; onOpen: () => void }) {
  const en = lang === "en";
  const paths = project.layout ? outlinePaths(project.layout) : [];
  return (
    <div className={`bp-sheet relative overflow-hidden rounded-[22px] ${inline ? "p-4" : "p-6"}`}>
      <div className="grid items-center gap-5 sm:grid-cols-[1fr_220px]">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#9fbcf0]">{en ? "Your project" : "Proiectul tău"}</div>
          <h2 className="display mt-1 text-[clamp(24px,3vw,40px)] text-white">{project.title}</h2>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[11px] text-[#dce9ff]">
            {project.measurements.slice(0, 3).map((m) => (
              <span key={m.label}>
                <span className="text-[#8fb0e8]">{m.label}</span> {dec(m.value, lang, m.unit === "buc" || m.unit === "rânduri" ? 0 : 2)} {unitText(m.unit, lang)}
              </span>
            ))}
          </div>
          <button
            onClick={onOpen}
            className="group mt-5 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 font-medium text-on-accent shadow-[0_10px_30px_-10px_var(--accent)] transition hover:brightness-105"
          >
            <IconCube size={16} />
            {en ? "Sketch my project" : "Schițează proiectul"}
            <span className="transition group-hover:translate-x-0.5">→</span>
          </button>
          <p className="mt-2 max-w-[42ch] text-[12px] leading-snug text-[#9fbcf0]">
            {en
              ? "A to-scale 3D sketch of your dimensions that you can reshape — the shopping list follows every change."
              : "O schiță 3D la scară, după dimensiunile tale, pe care o poți modifica — lista de cumpărături se actualizează la fiecare schimbare."}
          </p>
        </div>
        {paths.length > 0 && (
          <svg viewBox="0 0 220 150" className="hidden h-[150px] w-full sm:block" aria-hidden>
            {paths.map((d, i) => (
              <motion.path
                key={i}
                d={d}
                fill="none"
                stroke="#dce9ff"
                strokeWidth={1.6}
                initial={{ pathLength: 0, opacity: 0.2 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.6, delay: 0.2 + i * 0.15, ease: "easeInOut" }}
              />
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}

/** Outline of a layout as SVG paths in a 220 × 150 box (for the teaser). */
function outlinePaths(l: Layout): string[] {
  type Seg = [number, number, number, number];
  let segs: Seg[] = [];
  switch (l.type) {
    case "deck":
    case "laminate_floor":
    case "lawn":
    case "paving":
      segs = exposedEdges(l.zones).map((e) => [e.x1, e.z1, e.x2, e.z2]);
      break;
    case "paint_room":
    case "tiling":
      segs = [
        [-l.w / 2, -l.d / 2, l.w / 2, -l.d / 2],
        [l.w / 2, -l.d / 2, l.w / 2, l.d / 2],
        [l.w / 2, l.d / 2, -l.w / 2, l.d / 2],
        [-l.w / 2, l.d / 2, -l.w / 2, -l.d / 2],
      ];
      break;
    case "fence":
      segs = fenceSegments(l.points).map((s) => [s.a.x, s.a.z, s.b.x, s.b.z]);
      break;
    case "drywall_partition":
      segs = [[-l.length / 2, 0, l.length / 2, 0]];
      break;
  }
  const xs = segs.flatMap((s) => [s[0], s[2]]);
  const zs = segs.flatMap((s) => [s[1], s[3]]);
  const minX = Math.min(...xs);
  const minZ = Math.min(...zs);
  const w = Math.max(Math.max(...xs) - minX, 0.5);
  const d = Math.max(Math.max(...zs) - minZ, 0.5);
  const sc = Math.min(190 / w, 120 / d);
  const ox = 110 - (minX + w / 2) * sc;
  const oz = 75 - (minZ + d / 2) * sc;
  return segs.map(([a, b, c, e]) => `M${(ox + a * sc).toFixed(1)} ${(oz + b * sc).toFixed(1)}L${(ox + c * sc).toFixed(1)} ${(oz + e * sc).toFixed(1)}`);
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
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className={`grid h-8 w-8 place-items-center rounded-full backdrop-blur transition ${
        active ? "bg-accent text-on-accent" : dark ? "bg-[#0a1f47]/70 text-[#dce9ff] ring-1 ring-[#dce9ff]/25 hover:text-white" : "bg-white/70 text-ink-2 ring-1 ring-ink/10"
      }`}
    >
      {children}
    </button>
  );
}
