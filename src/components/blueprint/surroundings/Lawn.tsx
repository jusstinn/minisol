"use client";
/* three.js instance buffers and materials are filled imperatively, once per plan, by design. */
 

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { UNIT_BLADE } from "../detail/geometries";
import { lawnFadeTexture } from "../groundHalo";
import { finishTextures } from "../textures";
import { groundGeometry } from "./geometry";
import { dissolve, lawnLook, patched, windSway } from "./materials";
import type { UniformRef, WindUniforms } from "./materials";
import { distToRect, expand, mulberry32 } from "./plan";
import type { SurroundingsPlan } from "./plan";

const LAWN = { healthy: "#7fae5e", dry: "#a9b36a" } as const;

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
    return patched(m, `sur-lawn:${size.toFixed(1)}`, lawnLook(size, plan.lawnTone === "dry" ? 0.05 : 0.09));
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

const BLADES = 5200;

/**
 * Short tufts of grass scattered on the lawn around the build — thinning with distance, never
 * under it — so a close look at the ground finds blades, not a flat texture. Instanced, lit and
 * shadowed like the rest, and swaying in the same world-space wind as the lawn project's own turf
 * (see materials.ts `windSway`).
 */
export function LawnBlades({ plan, fade, wind }: { plan: SurroundingsPlan; fade: UniformRef; wind: WindUniforms }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const data = useMemo(() => {
    const rnd = mulberry32(0x9e3779b9 ^ Math.round(plan.footprint.maxX * 100) ^ Math.round(plan.footprint.maxZ * 977));
    const fp = plan.footprint;
    const solid = expand(fp, 0.04);
    const cx = (fp.minX + fp.maxX) / 2;
    const cz = (fp.minZ + fp.maxZ) / 2;
    const reach = Math.max(fp.maxX - fp.minX, fp.maxZ - fp.minZ) / 2 + 3.2;
    const out: { x: number; z: number; h: number; w: number; r: number; lean: number; hue: number; light: number }[] = [];
    let guard = 0;
    while (out.length < BLADES && guard++ < BLADES * 12) {
      const a = rnd() * Math.PI * 2;
      const rr = Math.sqrt(rnd()) * reach;
      const x = cx + Math.cos(a) * rr * 1.25;
      const z = cz + Math.sin(a) * rr;
      const dist = distToRect(x, z, fp);
      if (dist === 0 || distToRect(x, z, solid) === 0) continue;
      if (plan.hole && distToRect(x, z, plan.hole) < 0.02) continue;
      if (plan.house && z < fp.minZ + 0.02 && x > plan.house.x0 && x < plan.house.x1) continue;
      if (rnd() > Math.exp(-dist / 1.9)) continue;
      out.push({ x, z, h: 0.05 + rnd() * 0.075, w: 0.9 + rnd() * 0.9, r: rnd() * Math.PI, lean: (rnd() - 0.5) * 0.5, hue: (rnd() - 0.5) * 0.07, light: (rnd() - 0.5) * 0.26 });
    }
    return out;
  }, [plan]);
  const material = useMemo(
    () => patched(new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, side: THREE.DoubleSide, vertexColors: true }), "sur-blades", windSway(wind), dissolve(fade)),
    [wind, fade],
  );
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const tmp = new THREE.Object3D();
    const c = new THREE.Color();
    const base = new THREE.Color(plan.lawnTone === "dry" ? "#9bab55" : "#6aa04a");
    data.forEach((b, i) => {
      tmp.position.set(b.x, plan.groundY, b.z);
      tmp.rotation.set(b.lean, b.r, 0);
      tmp.scale.set(b.w, b.h, b.w);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
      mesh.setColorAt(i, c.copy(base).offsetHSL(b.hue, 0, b.light));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [data, plan.groundY, plan.lawnTone]);
  return <instancedMesh key={data.length} ref={ref} args={[UNIT_BLADE, material, data.length]} receiveShadow frustumCulled={false} raycast={() => null} />;
}
