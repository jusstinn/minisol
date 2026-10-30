"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { finishTextures } from "../textures";
import { foliageFor } from "./foliage";
import { blobGeometry, cardGeometry, dotGeometry, leafCardTexture, standingBoxGeometry, trunkGeometry } from "./geometry";
import { dissolve, foliageLook, leafNormals, patched } from "./materials";
import type { UniformRef } from "./materials";
import type { SurroundingsPlan } from "./plan";

/**
 * Shrubs, flowers, trees and planters: planned in plan.ts, expanded to instance lists in
 * foliage.ts, drawn here as a handful of `InstancedMesh`es — a dark leafy core per foliage mass,
 * thousands of alpha-cut leaf cards over it (the ragged, leafy silhouette a real shrub has),
 * flower heads, trunks and branches, planter boxes and their soil: seven draw calls for the
 * whole garden. Foliage and planters cast and receive the sun's soft shadows like everything else.
 */
export default function Vegetation({ plan, fade }: { plan: SurroundingsPlan; fade: UniformRef }) {
  const fol = useMemo(() => foliageFor(plan), [plan]);
  const blobs = useRef<THREE.InstancedMesh>(null);
  const cards = useRef<THREE.InstancedMesh>(null);
  const dots = useRef<THREE.InstancedMesh>(null);
  const trunks = useRef<THREE.InstancedMesh>(null);
  const planters = useRef<THREE.InstancedMesh>(null);
  const soils = useRef<THREE.InstancedMesh>(null);

  // Card orientations, and each card's outward normal rotated into the card's own frame.
  const cardData = useMemo(() => {
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const out = new Float32Array(fol.cards.length * 3);
    const quats = fol.cards.map((c, i) => {
      q.setFromEuler(e.set(c.rx, c.ry, c.rz));
      v.set(c.nx, c.ny, c.nz).applyQuaternion(q.clone().invert());
      out.set([v.x, v.y, v.z], i * 3);
      return q.clone();
    });
    return { geometry: cardGeometry(out), quats };
  }, [fol]);
  useLayoutEffect(() => () => cardData.geometry.dispose(), [cardData]);

  const mats = useMemo(() => {
    const woodTex = finishTextures({ kind: "wood", unit: [0.5, 0.12] }, [1, 1, 1]);
    return {
      foliage: patched(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }), "sur-foliage", dissolve(fade), foliageLook),
      leaf: patched(
        new THREE.MeshStandardMaterial({ map: leafCardTexture(), alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.78, metalness: 0 }),
        "sur-leaf",
        dissolve(fade),
        leafNormals,
      ),
      dot: patched(new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0 }), "sur-dot", dissolve(fade)),
      trunk: patched(new THREE.MeshStandardMaterial({ color: "#5a4a3d", roughness: 0.95, metalness: 0 }), "sur-trunk", dissolve(fade)),
      planter: patched(
        new THREE.MeshStandardMaterial({ color: "#8a6a4a", roughness: 0.85, metalness: 0, map: woodTex.map, roughnessMap: woodTex.roughnessMap, bumpMap: woodTex.bumpMap, bumpScale: 0.0015 }),
        "sur-planter",
        dissolve(fade),
      ),
      soil: patched(new THREE.MeshStandardMaterial({ color: "#3a2d22", roughness: 1, metalness: 0 }), "sur-soil", dissolve(fade)),
    };
  }, [fade]);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const c = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3();
    fol.blobs.forEach((b, i) => {
      // The core sits just inside its leaf cards and darker: the shade inside a real shrub.
      blobs.current?.setMatrixAt(i, m.compose(p.set(b.x, b.y, b.z), q.setFromAxisAngle(up, b.rotY), s.set(b.rx * 0.86, b.ry * 0.86, b.rz * 0.86)));
      blobs.current?.setColorAt(i, c.set(b.color).multiplyScalar(0.62));
    });
    fol.cards.forEach((k, i) => {
      cards.current?.setMatrixAt(i, m.compose(p.set(k.x, k.y, k.z), cardData.quats[i], s.setScalar(k.s)));
      cards.current?.setColorAt(i, c.set(k.color));
    });
    fol.dots.forEach((d, i) => {
      dots.current?.setMatrixAt(i, m.compose(p.set(d.x, d.y, d.z), q.identity(), s.setScalar(d.s)));
      dots.current?.setColorAt(i, c.set(d.color));
    });
    fol.trunks.forEach((t, i) => {
      q.setFromUnitVectors(up, dir.set(t.dx, t.dy, t.dz).normalize());
      trunks.current?.setMatrixAt(i, m.compose(p.set(t.x, t.y, t.z), q, s.set(t.r, t.h, t.r)));
    });
    fol.planters.forEach((b, i) => {
      planters.current?.setMatrixAt(i, m.compose(p.set(b.x, 0, b.z), q.setFromAxisAngle(up, b.rotY), s.set(b.w, b.h, b.d)));
    });
    fol.soils.forEach((b, i) => {
      soils.current?.setMatrixAt(i, m.compose(p.set(b.x, fol.planters[i].h - 0.03, b.z), q.setFromAxisAngle(up, b.rotY), s.set(b.w, 0.035, b.d)));
    });
    for (const r of [blobs, cards, dots, trunks, planters, soils]) {
      const mesh = r.current;
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [fol, cardData]);

  return (
    <group position={[0, plan.groundY, 0]}>
      {fol.blobs.length > 0 && (
        <instancedMesh key={`b${fol.blobs.length}`} ref={blobs} args={[blobGeometry(), mats.foliage, fol.blobs.length]} castShadow receiveShadow raycast={() => null} />
      )}
      {fol.cards.length > 0 && (
        <instancedMesh key={`c${fol.cards.length}`} ref={cards} args={[cardData.geometry, mats.leaf, fol.cards.length]} castShadow receiveShadow raycast={() => null} />
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
