"use client";

import { useId, useRef, useState } from "react";
import { planFootprint, svgTransform } from "@/lib/uploads/calibration";
import type { PlanCalibration } from "@/lib/uploads/calibration";
import type { PlanEntry } from "@/lib/uploads/store";

/**
 * The customer's plan image drawn behind the plan editor's shapes, in plan metres (rendered
 * inside PlanEditor's <svg> through its `underlay` prop). While "align" is on it can be
 * dragged to line up with the sketch; otherwise it ignores the pointer.
 */

export interface PlanFrame {
  sc: number;
  ox: number;
  oz: number;
}

const snap = (v: number) => Math.round(v / 0.05) * 0.05;

export default function PlanUnderlay({
  frame,
  plan,
  dark,
  aligning,
  onMove,
}: {
  frame: PlanFrame;
  plan: PlanEntry;
  dark: boolean;
  aligning: boolean;
  onMove: (cx: number, cz: number) => void;
}) {
  const filterId = `pu-${useId().replace(/:/g, "")}`;
  const drag = useRef<{ x: number; z: number; cx: number; cz: number } | null>(null);
  const [live, setLive] = useState<{ cx: number; cz: number } | null>(null);
  if (plan.cal.hidden) return null;
  const cal: PlanCalibration = live ? { ...plan.cal, ...live } : plan.cal;

  const toPlan = (e: React.PointerEvent) => {
    const svg = (e.currentTarget as SVGGraphicsElement).ownerSVGElement;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: (p.x - frame.ox) / frame.sc, z: (p.y - frame.oz) / frame.sc };
  };

  const fp = planFootprint(plan.img, cal);
  const outline = aligning && (
    <rect
      x={frame.ox + (cal.cx - fp.w / 2) * frame.sc}
      y={frame.oz + (cal.cz - fp.d / 2) * frame.sc}
      width={fp.w * frame.sc}
      height={fp.d * frame.sc}
      fill="none"
      stroke="var(--accent)"
      strokeWidth={1.2}
      strokeDasharray="5 3"
      pointerEvents="none"
    />
  );

  return (
    <g aria-hidden>
      {/* Dark views: dark lines → light blue, the paper → transparent (luminance to alpha). */}
      {dark && (
        <defs>
          <filter id={filterId} colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values="0 0 0 0 0.86  0 0 0 0 0.91  0 0 0 0 1  -0.4 -0.8 -0.15 1.35 0" />
          </filter>
        </defs>
      )}
      <g transform={svgTransform(plan.img, cal, frame)}>
        <image
          href={plan.url}
          width={plan.img.w}
          height={plan.img.h}
          preserveAspectRatio="none"
          opacity={cal.opacity}
          filter={dark ? `url(#${filterId})` : undefined}
          style={{ mixBlendMode: dark ? undefined : "multiply", cursor: aligning ? "move" : undefined, touchAction: "none" }}
          pointerEvents={aligning ? "all" : "none"}
          onPointerDown={(e) => {
            if (!aligning) return;
            const p = toPlan(e);
            if (!p) return;
            e.stopPropagation();
            (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
            drag.current = { x: p.x, z: p.z, cx: plan.cal.cx, cz: plan.cal.cz };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            const p = d && toPlan(e);
            if (!d || !p) return;
            setLive({ cx: Math.round(snap(d.cx + p.x - d.x) * 1000) / 1000, cz: Math.round(snap(d.cz + p.z - d.z) * 1000) / 1000 });
          }}
          onPointerUp={() => {
            drag.current = null;
            if (live) onMove(live.cx, live.cz);
            setLive(null);
          }}
          onPointerCancel={() => {
            drag.current = null;
            setLive(null);
          }}
        />
      </g>
      {outline}
    </g>
  );
}
