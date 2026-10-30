"use client";
/* three.js instance buffers and materials are filled imperatively, once per plan, by design. */
 

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { finishTextures } from "../textures";
import { foliageFor } from "./foliage";
import { blobGeometry, dotGeometry, standingBoxGeometry, trunkGeometry } from "./geometry";
import { dissolve, foliageLook, patched } from "./materials";
import type { UniformRef } from "./materials";
import type { SurroundingsPlan } from "./plan";

/**
 * Shrubs, flowers, trees and planters: planned in plan.ts, expanded to instance lists in
 * foliage.ts, drawn here as five `InstancedMesh`es (foliage blobs, flower dots, trunks, planter
 * boxes, their soil) — five draw calls for the whole garden. Foliage and planters cast and
 * receive the sun's soft shadows like everything else.
 */
export default function Vegetation({ plan, fade }: { plan: SurroundingsPlan; fade: UniformRef }) {
  const fol = useMemo(() => foliageFor(plan), [plan]);
  const blobs = useRef<THREE.InstancedMesh>(null);
  const dots = useRef<THREE.InstancedMesh>(null);
  const trunks = useRef<THREE.InstancedMesh>(null);
  const planters = useRef<THREE.InstancedMesh>(null);
  const soils = useRef<THREE.InstancedMesh>(null);

  const mats = useMemo(() => {
    const woodTex = finishTextures({ kind: "wood", unit: [0.5, 0.12] }, [1, 1, 1]);
    return {
      foliage: patched(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 }), "sur-foliage", dissolve(fade), foliageLook),
      dot: patched(new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0 }), "sur-dot", dissolve(fade)),
      trunk: patched(new THREE.MeshStandardMaterial({ color: "#6b5440", roughness: 0.95, metalness: 0 }), "sur-trunk", dissolve(fade)),
      planter: patched(
        new THREE.MeshStandardMaterial({ color: "#9a7650", roughness: 0.82, metalness: 0, map: woodTex.map, roughnessMap: woodTex.roughnessMap, bumpMap: woodTex.bumpMap, bumpScale: 0.0015 }),
        "sur-planter",
        dissolve(fade),
      ),
      soil: patched(new THREE.MeshStandardMaterial({ color: "#3d2f24", roughness: 1, metalness: 0 }), "sur-soil", dissolve(fade)),
    };
  }, [fade]);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const c = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    fol.blobs.forEach((b, i) => {
      blobs.current?.setMatrixAt(i, m.compose(p.set(b.x, b.y, b.z), q.setFromAxisAngle(up, b.rotY), s.set(b.rx, b.ry, b.rz)));
      blobs.current?.setColorAt(i, c.set(b.color));
    });
    fol.dots.forEach((d, i) => {
      dots.current?.setMatrixAt(i, m.compose(p.set(d.x, d.y, d.z), q.identity(), s.setScalar(d.s)));
      dots.current?.setColorAt(i, c.set(d.color));
    });
    fol.trunks.forEach((t, i) => {
      trunks.current?.setMatrixAt(i, m.compose(p.set(t.x, 0, t.z), q.setFromEuler(e.set(t.lean, t.rotY, t.lean * 0.6)), s.set(t.r, t.h, t.r)));
    });
    fol.planters.forEach((b, i) => {
      planters.current?.setMatrixAt(i, m.compose(p.set(b.x, 0, b.z), q.setFromAxisAngle(up, b.rotY), s.set(b.w, b.h, b.d)));
    });
    fol.soils.forEach((b, i) => {
      soils.current?.setMatrixAt(i, m.compose(p.set(b.x, fol.planters[i].h - 0.03, b.z), q.setFromAxisAngle(up, b.rotY), s.set(b.w, 0.035, b.d)));
    });
    for (const r of [blobs, dots, trunks, planters, soils]) {
      const mesh = r.current;
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [fol]);

  return (
    <group position={[0, plan.groundY, 0]}>
      {fol.blobs.length > 0 && (
        <instancedMesh key={`b${fol.blobs.length}`} ref={blobs} args={[blobGeometry(), mats.foliage, fol.blobs.length]} castShadow receiveShadow raycast={() => null} />
      )}
      {fol.dots.length > 0 && <instancedMesh key={`d${fol.dots.length}`} ref={dots} args={[dotGeometry(), mats.dot, fol.dots.length]} receiveShadow raycast={() => null} />}
      {fol.trunks.length > 0 && <instancedMesh key={`t${fol.trunks.length}`} ref={trunks} args={[trunkGeometry(), mats.trunk, fol.trunks.length]} castShadow receiveShadow raycast={() => null} />}
      {fol.planters.length > 0 && (
        <>
          <instancedMesh key={`p${fol.planters.length}`} ref={planters} args={[standingBoxGeometry(), mats.planter, fol.planters.length]} castShadow receiveShadow raycast={() => null} />
          <instancedMesh key={`s${fol.soils.length}`} ref={soils} args={[standingBoxGeometry(), mats.soil, fol.soils.length]} receiveShadow raycast={() => null} />
        </>
      )}
    </group>
  );
}
