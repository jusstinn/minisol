"use client";

import { SoftShadows } from "@react-three/drei";
import { useMemo } from "react";
import type * as THREE from "three";
import { daylightFor } from "./daylight";
import type { ShadowBounds } from "./shadowBounds";
import type { ViewMode } from "./Scene";
import SkyEnvironment from "./SkyEnvironment";
import { DEFAULT_SUN_LIGHT, FLAT_LIGHT } from "./sunLighting";
import type { SunLight } from "./sunLighting";

export type { SunLight };

/**
 * The sketch's lighting rig. Three situations:
 *
 * - PLAN/EXPLODED: today's flat, fixed numbers (`FLAT_LIGHT`) — their materials are unlit, so the
 *   simulation only ever changes what REAL mode looks like.
 * - REAL on phones (`lite`): the original ambient + directional + hemisphere fill, unchanged — no
 *   shadows, no image-based light.
 * - REAL on desktop: physically-flavoured daylight (see daylight.ts). A strong directional sun
 *   (the one shadow caster, with contact-hardening PCSS penumbrae), and a procedural sky — or,
 *   for a room, a soft window — baked into the image-based light (SkyEnvironment.tsx). The old
 *   ambient/hemisphere fill shrinks to a whisper by day and carries the night. Sun direction and
 *   colour follow the simulation when it is on, and a fixed pleasant afternoon otherwise.
 *
 * Nothing here ever fetches an HDRI: the sky is a shader, so it is CSP-safe and works offline.
 */
export default function Lighting({
  mode,
  lite,
  sun,
  shadowBounds,
  lightRef,
  interior = false,
}: {
  mode: ViewMode;
  lite?: boolean | "low";
  sun?: SunLight | null;
  /** The shadow camera's frustum/map size, fitted to the build's own extent (see shadowBounds.ts)
   *  — kept out of this component so Scene.tsx (which already knows the build) computes it once. */
  shadowBounds: ShadowBounds;
  /** So "Randare foto" (PhotoRender.tsx, via Scene's CaptureBridge) can reach the live light. */
  lightRef?: React.RefObject<THREE.DirectionalLight | null>;
  /** A cut-away room: window light instead of an open sky. */
  interior?: boolean;
}) {
  const real = mode === "real";
  const sky = real && !lite;
  const dl = useMemo(() => daylightFor(sun ?? null, interior), [sun, interior]);

  // The shadow camera sits just far enough back to see the whole caster volume, with a tight
  // depth range: PCSS reads depth as a fraction of that range, so a roomy range would soften
  // everything uniformly instead of by distance from the caster.
  const reach = shadowBounds.half * 1.5;
  const dist = reach + 1.5;
  const near = 0.5;
  const far = dist + reach + 1.5;

  const legacy = real ? sun ?? DEFAULT_SUN_LIGHT : FLAT_LIGHT;
  const dir: [number, number, number] = sky ? [dl.sunDir[0] * dist, dl.sunDir[1] * dist, dl.sunDir[2] * dist] : legacy.direction;
  // A room's sun arrives through glass and a window reveal: softer and warmer than open sky.
  const sunIntensity = sky ? dl.sunIntensity * (interior ? 0.55 : 1) : legacy.intensity;

  return (
    <>
      <ambientLight intensity={sky ? dl.ambient : legacy.ambient} />
      <directionalLight
        ref={lightRef}
        position={dir}
        color={sky ? dl.sunColor : legacy.color}
        intensity={sunIntensity}
        castShadow={!lite}
        shadow-mapSize={[shadowBounds.mapSize, shadowBounds.mapSize]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      >
        <orthographicCamera attach="shadow-camera" args={[-shadowBounds.half, shadowBounds.half, shadowBounds.half, -shadowBounds.half, near, far]} />
      </directionalLight>
      <hemisphereLight args={sky ? [dl.hemiSky, dl.hemiGround, dl.hemiIntensity] : [legacy.hemiSky, legacy.hemiGround, legacy.hemiIntensity]} />
      {!lite && <SoftShadows size={32} samples={16} focus={0.4} />}
      {/* Mounted for the whole desktop session (PLAN too — unlit materials ignore it), so entering REAL
          never pays the cube-map/PMREM shader compile mid-animation. */}
      {!lite && <SkyEnvironment daylight={dl} interior={interior} />}
    </>
  );
}
