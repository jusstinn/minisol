"use client";

import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Lang } from "@/domain/types";
import { dec } from "@/lib/format";
import { metresPerPixel, parseMetres } from "@/lib/uploads/calibration";
import type { PlanEntry } from "@/lib/uploads/store";
import { IconClose, IconMinus, IconPlus } from "../ui/icons";
import { IconCaliper, monoLabel } from "./uploads/ui";

/**
 * Scale calibration: the plan full size, the customer taps both ends of a dimension they
 * know (a wall, a dimension line), types the real distance, and the plan gets its metres
 * per pixel. Points can be dragged to adjust; wheel / pinch / ± zoom, drag the empty paper
 * to pan. Rendered in a portal (the sketch panel clips and transforms its children).
 */

type P2 = [number, number];
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export default function PlanCalibrator({
  plan,
  lang,
  anchor,
  onApply,
  onClose,
}: {
  plan: PlanEntry;
  lang: Lang;
  /** An element inside the app, to carry the retailer's accent colour into the portal. */
  anchor: React.RefObject<HTMLElement | null>;
  onApply: (a: P2, b: P2, metres: number) => void;
  onClose: () => void;
}) {
  const en = lang === "en";
  const { w, h } = plan.img;
  const svgRef = useRef<SVGSVGElement>(null);
  const [pts, setPts] = useState<P2[]>(() => (plan.cal.ref ? [plan.cal.ref.a, plan.cal.ref.b] : []));
  const [text, setText] = useState(() => (plan.cal.ref ? dec(plan.cal.ref.m, lang, 2).replace(/0$/, "") : ""));
  const [vb, setVb] = useState<Box>({ x: 0, y: 0, w, h });
  /** Image units per screen pixel (markers keep a constant on-screen size). */
  const [k, setK] = useState(1);
  const gesture = useRef<{ id: number; start: { x: number; y: number }; img: P2; point: number | null; moved: boolean; vb: Box } | null>(null);
  const pinch = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStart = useRef<{ d: number; vb: Box; mid: P2 } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // The accent lives on the app root (a CSS variable); copy it onto the portal.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el || !anchor.current) return;
    const cs = getComputedStyle(anchor.current);
    for (const v of ["--accent", "--on-accent"]) el.style.setProperty(v, cs.getPropertyValue(v));
  }, [anchor]);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const update = () => {
      const ctm = svg.getScreenCTM();
      if (ctm && ctm.a) setK(1 / ctm.a);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(svg);
    return () => ro.disconnect();
  }, [vb]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toImage = (clientX: number, clientY: number): P2 => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return [Math.min(w, Math.max(0, p.x)), Math.min(h, Math.max(0, p.y))];
  };

  const zoomAt = (factor: number, at: P2, from: Box = vb) => {
    const nw = Math.min(w * 1.5, Math.max(Math.min(w, h) / 40, from.w / factor));
    const nh = (nw / from.w) * from.h;
    const fx = (at[0] - from.x) / from.w;
    const fy = (at[1] - from.y) / from.h;
    setVb({ x: at[0] - fx * nw, y: at[1] - fy * nh, w: nw, h: nh });
  };

  // Wheel zoom needs a non-passive listener (to keep the page from scrolling).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const svgEl = svgRef.current!;
      const pt = svgEl.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const p = pt.matrixTransform(svgEl.getScreenCTM()!.inverse());
      setVb((cur) => {
        const factor = Math.exp(-e.deltaY * 0.0015);
        const nw = Math.min(w * 1.5, Math.max(Math.min(w, h) / 40, cur.w / factor));
        const nh = (nw / cur.w) * cur.h;
        const fx = (p.x - cur.x) / cur.w;
        const fy = (p.y - cur.y) / cur.h;
        return { x: p.x - fx * nw, y: p.y - fy * nh, w: nw, h: nh };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [w, h]);

  /** The point under the pointer (within 18 screen px), nearest first. */
  const hit = (p: P2): number | null => {
    let best: number | null = null;
    let bestD = 18 * k;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - p[0], pts[i][1] - p[1]);
      if (d <= bestD) {
        best = i;
        bestD = d;
      }
    }
    return best;
  };

  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current.size === 2) {
      const [a, b] = [...pinch.current.values()];
      pinchStart.current = { d: Math.hypot(a.x - b.x, a.y - b.y), vb, mid: toImage((a.x + b.x) / 2, (a.y + b.y) / 2) };
      gesture.current = null;
      return;
    }
    const img = toImage(e.clientX, e.clientY);
    gesture.current = { id: e.pointerId, start: { x: e.clientX, y: e.clientY }, img, point: hit(img), moved: false, vb };
  };

  const onMove = (e: React.PointerEvent) => {
    if (pinch.current.has(e.pointerId)) pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const ps = pinchStart.current;
    if (ps && pinch.current.size === 2) {
      const [a, b] = [...pinch.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 0 && ps.d > 0) zoomAt(d / ps.d, ps.mid, ps.vb);
      return;
    }
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    if (!g.moved && Math.hypot(e.clientX - g.start.x, e.clientY - g.start.y) > 5) g.moved = true;
    if (!g.moved) return;
    if (g.point !== null) {
      const p = toImage(e.clientX, e.clientY);
      setPts((cur) => cur.map((q, i) => (i === g.point ? p : q)));
    } else {
      // Pan: move the view by the drag distance (in image units at the gesture's start).
      const dx = (e.clientX - g.start.x) * k;
      const dy = (e.clientY - g.start.y) * k;
      setVb({ ...g.vb, x: g.vb.x - dx, y: g.vb.y - dy });
    }
  };

  const onUp = (e: React.PointerEvent) => {
    pinch.current.delete(e.pointerId);
    if (pinch.current.size < 2) pinchStart.current = null;
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.id !== e.pointerId || g.moved || g.point !== null) return;
    // A tap: first / second point, then the tap moves the nearer point.
    setPts((cur) => {
      if (cur.length < 2) return [...cur, g.img];
      const d0 = Math.hypot(cur[0][0] - g.img[0], cur[0][1] - g.img[1]);
      const d1 = Math.hypot(cur[1][0] - g.img[0], cur[1][1] - g.img[1]);
      return d0 <= d1 ? [g.img, cur[1]] : [cur[0], g.img];
    });
  };

  const metres = parseMetres(text);
  const px = pts.length === 2 ? Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) : 0;
  const mpp = pts.length === 2 && metres !== null ? metresPerPixel(pts[0], pts[1], metres) : null;
  const step = pts.length < 2 ? pts.length + 1 : 3;
  const center = (): P2 => [vb.x + vb.w / 2, vb.y + vb.h / 2];

  const body = (
    <div ref={rootRef} className="fixed inset-0 z-[90] flex items-stretch justify-center bg-[#030a18]/70 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal aria-label={en ? "Calibrate the plan" : "Calibrează planul"}>
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="flex h-full w-full max-w-[1040px] flex-col overflow-hidden bg-[#071634] text-[#e6efff] ring-1 ring-[#dce9ff]/25 sm:h-[min(86vh,780px)] sm:rounded-2xl"
      >
        <div className="flex items-center gap-2 border-b border-[#dce9ff]/15 px-4 py-2.5">
          <IconCaliper size={14} />
          <span className={`flex-1 ${monoLabel(true)}`}>
            {en ? "Calibrate the plan" : "Calibrează planul"} · {en ? "step" : "pasul"} {step}/3
          </span>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-full hover:bg-[#dce9ff]/10" aria-label={en ? "Close" : "Închide"}>
            <IconClose size={14} />
          </button>
        </div>

        <div className="relative min-h-0 flex-1 bg-[#0a1f47]">
          <svg
            ref={svgRef}
            viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
            preserveAspectRatio="xMidYMid meet"
            className="absolute inset-0 h-full w-full cursor-crosshair touch-none select-none"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            <rect x={0} y={0} width={w} height={h} fill="#fff" />
            <image href={plan.url} x={0} y={0} width={w} height={h} preserveAspectRatio="none" />
            {pts.length === 2 && (
              <>
                <line x1={pts[0][0]} y1={pts[0][1]} x2={pts[1][0]} y2={pts[1][1]} stroke="#071634" strokeOpacity={0.5} strokeWidth={6 * k} strokeLinecap="round" />
                <line x1={pts[0][0]} y1={pts[0][1]} x2={pts[1][0]} y2={pts[1][1]} stroke="var(--accent)" strokeWidth={2.5 * k} strokeLinecap="round" />
              </>
            )}
            {pts.map((p, i) => (
              <g key={i}>
                <circle cx={p[0]} cy={p[1]} r={11 * k} fill="var(--accent)" fillOpacity={0.25} stroke="var(--accent)" strokeWidth={2 * k} />
                <path d={`M${p[0] - 16 * k} ${p[1]}h${32 * k}M${p[0]} ${p[1] - 16 * k}v${32 * k}`} stroke="#071634" strokeWidth={1.4 * k} />
                <text x={p[0] + 14 * k} y={p[1] - 14 * k} fontSize={12 * k} fontWeight={700} fill="#071634" stroke="#fff" strokeWidth={3 * k} paintOrder="stroke" className="font-mono">
                  {i === 0 ? "A" : "B"}
                </text>
              </g>
            ))}
          </svg>
          <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
            <button onClick={() => zoomAt(1.5, center())} className="grid h-9 w-9 place-items-center rounded-full bg-[#071634]/85 ring-1 ring-[#dce9ff]/25" aria-label={en ? "Zoom in" : "Mărește"}>
              <IconPlus size={16} />
            </button>
            <button onClick={() => zoomAt(1 / 1.5, center())} className="grid h-9 w-9 place-items-center rounded-full bg-[#071634]/85 ring-1 ring-[#dce9ff]/25" aria-label={en ? "Zoom out" : "Micșorează"}>
              <IconMinus size={16} />
            </button>
            <button onClick={() => setVb({ x: 0, y: 0, w, h })} className="grid h-9 w-9 place-items-center rounded-full bg-[#071634]/85 font-mono text-[9px] uppercase ring-1 ring-[#dce9ff]/25" aria-label={en ? "Fit" : "Tot planul"}>
              {en ? "fit" : "tot"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#dce9ff]/15 px-4 py-3">
          <p className="min-w-[220px] flex-1 text-[12.5px] leading-snug text-[#c7d9fa]">
            {pts.length < 2
              ? en
                ? `Tap ${pts.length ? "the other end" : "one end"} of a dimension you know — a wall, a dimension line (e.g. 3.20 m).`
                : `Atinge ${pts.length ? "celălalt capăt" : "un capăt"} al unei dimensiuni pe care o știi — un perete, o cotă (ex. 3,20 m).`
              : en
                ? "Drag A or B to adjust. Now type the real distance between them."
                : "Trage de A sau B ca să ajustezi. Acum scrie distanța reală dintre ele."}
            <span className="mt-0.5 block font-mono text-[10.5px] text-[#9fbcf0]">
              {px > 0 ? `${dec(px, lang, 0)} px` : "—"}
              {mpp ? ` · 1 m = ${dec(1 / mpp, lang, 0)} px` : ""}
            </span>
          </p>
          <label className="flex items-center gap-2">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#9fbcf0]">A–B</span>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && mpp && pts.length === 2 && metres !== null && onApply(pts[0], pts[1], metres)}
              inputMode="decimal"
              placeholder={en ? "3.20" : "3,20"}
              className="w-24 rounded-lg bg-[#0a1f47] px-2.5 py-2 font-mono text-[14px] text-white ring-1 ring-[#dce9ff]/25 placeholder:text-[#9fbcf0]/50 focus:ring-[#dce9ff]/60"
              aria-label={en ? "Real distance between A and B, in metres" : "Distanța reală dintre A și B, în metri"}
            />
            <span className="font-mono text-[12px]">m</span>
          </label>
          <div className="flex gap-2">
            {pts.length > 0 && (
              <button onClick={() => setPts([])} className="rounded-full px-3 py-2 text-[12.5px] text-[#c7d9fa] hover:bg-[#dce9ff]/10">
                {en ? "Reset points" : "Resetează"}
              </button>
            )}
            <button
              disabled={!mpp}
              onClick={() => mpp && metres !== null && onApply(pts[0], pts[1], metres)}
              className="rounded-full bg-accent px-4 py-2 text-[13px] font-medium text-on-accent transition disabled:opacity-35"
            >
              {en ? "Apply scale" : "Aplică scara"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(body, document.body);
}
