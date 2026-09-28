"use client";

import { useEffect, useState } from "react";
import * as THREE from "three";
import { scaleOf } from "@/lib/uploads/calibration";
import { groundCanvases } from "@/lib/uploads/loadPlan";
import type { PlanEntry } from "@/lib/uploads/store";
import { yaw } from "@/lib/uploads/units";
import type { ViewMode } from "./Scene";

/**
 * The customer's calibrated plan, laid faintly on the ground under the 3D sketch (plan metres,
 * the same place as in the plan editor). Dark views get a light-blue line version with the
 * paper made transparent; the real view shows the plan as drawn.
 */
export default function PlanGround({ plan, mode }: { plan: PlanEntry; mode: ViewMode }) {
  const [tex, setTex] = useState<{ blob: Blob; real: THREE.Texture; blue: THREE.Texture } | null>(null);

  useEffect(() => {
    let alive = true;
    let made: { real: THREE.Texture; blue: THREE.Texture } | null = null;
    void groundCanvases(plan.blob).then((c) => {
      if (!alive || !c) return;
      const mk = (canvas: HTMLCanvasElement) => {
        const t = new THREE.CanvasTexture(canvas);
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        return t;
      };
      made = { real: mk(c.real), blue: mk(c.blue) };
      setTex({ blob: plan.blob, ...made });
    });
    return () => {
      alive = false;
      made?.real.dispose();
      made?.blue.dispose();
    };
  }, [plan.blob]);

  const { cal, img } = plan;
  if (!tex || tex.blob !== plan.blob || cal.mpp === null || cal.hidden || !cal.in3d) return null;
  const s = scaleOf(cal);
  const blue = mode !== "real";
  return (
    // Laid flat (−90° about x), then turned about the vertical like the plan (clockwise from above).
    <mesh position={[cal.cx, 0.004, cal.cz]} rotation={[-Math.PI / 2, 0, yaw(cal.rot)]} renderOrder={-1}>
      <planeGeometry args={[img.w * s, img.h * s]} />
      <meshBasicMaterial
        key={blue ? "blue" : "real"}
        map={blue ? tex.blue : tex.real}
        transparent
        opacity={blue ? Math.min(1, 0.45 + cal.opacity * 0.7) : cal.opacity * 0.85}
        depthWrite={false}
        toneMapped={false}
        polygonOffset
        polygonOffsetFactor={-2}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
