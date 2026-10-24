"use client";

import { Environment, Lightformer } from "@react-three/drei";
import type { ViewMode } from "./Scene";
import { DEFAULT_SUN_LIGHT, FLAT_LIGHT } from "./sunLighting";
import type { SunLight } from "./sunLighting";

export type { SunLight };

/**
 * The sketch's lighting rig — ambient, directional (the one shadow-casting sun) and hemisphere
 * lights, plus a no-download IBL for REAL mode on desktop: three `Lightformer`s baked once into
 * a drei `Environment` (no HDRI ever fetched — CSP-safe, works offline). PLAN/EXPLODED always
 * get today's flat, fixed numbers (`FLAT_LIGHT`): their materials are unlit, so the simulation
 * only ever changes what REAL mode looks like. With the sun simulation off, REAL falls back to
 * `DEFAULT_SUN_LIGHT` — today's pleasant fixed afternoon sun, now with the IBL on top.
 */
export default function Lighting({ mode, lite, sun }: { mode: ViewMode; lite?: boolean | "low"; sun?: SunLight | null }) {
  const real = mode === "real";
  const light = real ? sun ?? DEFAULT_SUN_LIGHT : FLAT_LIGHT;

  return (
    <>
      <ambientLight intensity={light.ambient} />
      <directionalLight position={light.direction} color={light.color} intensity={light.intensity} castShadow={!lite} shadow-mapSize={[2048, 2048]}>
        <orthographicCamera attach="shadow-camera" args={[-12, 12, 12, -12, 0.1, 50]} />
      </directionalLight>
      <hemisphereLight args={[light.hemiSky, light.hemiGround, light.hemiIntensity]} />
      {real && !lite && (
        <Environment resolution={64} frames={1}>
          <Lightformer form="rect" intensity={1.2} color="#eaf1ff" position={[0, 7, -3]} scale={[9, 5, 1]} target={[0, 0, 0]} />
          <Lightformer form="rect" intensity={0.55} color="#fff2db" position={[5, 3, 5]} scale={[5, 3, 1]} target={[0, 1, 0]} />
          <Lightformer form="ring" intensity={0.4} color="#ffffff" position={[-5, 4, 1]} scale={3.5} target={[0, 0, 0]} />
        </Environment>
      )}
    </>
  );
}
