"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { lawnFadeTexture } from "../groundHalo";
import { finishTextures } from "../textures";
import { groundGeometry } from "./geometry";
import { lawnLook, patched } from "./materials";
import type { UniformRef } from "./materials";
import type { SurroundingsPlan } from "./plan";

// Daylight lawn after the tone curve lands around #5f7f3a–#6b8a45: a real, slightly yellow green.
const LAWN = { healthy: "#5b7a2f", dry: "#7c8748" } as const;

/**
 * The lawn the project stands in: one big faded disc (see groundHalo.ts's `lawnFadeTexture`) with
 * the procedural turf map, patchy growth and mowing stripes (materials.ts `lawnLook`), receiving
 * the sun's soft shadows and — unlike the old ground halo — writing depth, so ambient occlusion
 * can ground everything that stands on it. A paved build sits flush in a hole in it.
 */
export function LawnGround({ plan, opacity }: { plan: SurroundingsPlan; opacity: UniformRef }) {
  const size = plan.groundR * 2;
  const cx = (plan.footprint.minX + plan.footprint.maxX) / 2;
  const cz = (plan.footprint.minZ + plan.footprint.maxZ) / 2;
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const geometry = useMemo(
    () => groundGeometry(size, plan.hole ? { minX: plan.hole.minX - cx, maxX: plan.hole.maxX - cx, minZ: plan.hole.minZ - cz, maxZ: plan.hole.maxZ - cz } : null),
    [size, plan.hole, cx, cz],
  );
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);
  const material = useMemo(() => {
    const t = finishTextures({ kind: "grass", unit: [0.55, 0.55] }, [size, 0.01, size]);
    const m = new THREE.MeshStandardMaterial({
      map: t.map,
      roughnessMap: t.roughnessMap,
      bumpMap: t.bumpMap,
      bumpScale: 0.004,
      alphaMap: lawnFadeTexture(),
      color: LAWN[plan.lawnTone],
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0,
    });
    return patched(m, `sur-lawn:${size.toFixed(1)}`, lawnLook(size, plan.lawnTone === "dry" ? 0.025 : 0.04));
  }, [size, plan.lawnTone]);
  useFrame(() => {
    if (mat.current) mat.current.opacity = opacity.value;
  });
  return (
    <mesh position={[cx, plan.groundY - 0.004, cz]} geometry={geometry} renderOrder={-10} receiveShadow raycast={() => null}>
      <primitive object={material} ref={mat} attach="material" />
    </mesh>
  );
}
