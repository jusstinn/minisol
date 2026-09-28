"use client";
/* three.js materials are adjusted imperatively when the view or the opacity changes. */
/* eslint-disable react-hooks/immutability */

import { useEffect, useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { mergedEdges } from "@/lib/uploads/loadModel";
import type { ModelEntry } from "@/lib/uploads/store";
import { UNIT_SCALE, yaw } from "@/lib/uploads/units";
import type { ViewMode } from "./Scene";

/**
 * The customer's own 3D model (their house, garden, bathroom scan) drawn as context next
 * to the sketch, in plan metres. Blueprint / exploded view: translucent blue with one merged
 * edge overlay (a single draw call, however many meshes the file has). Real view: the file's
 * own materials. It never explodes, never takes part in the edit animation and isn't part
 * of the camera fit (Scene only frames the project).
 */

/** Triangles above which the edge overlay is skipped (the translucent fill stays). */
const EDGE_BUDGET = 250_000;
const EDGE_BUDGET_LITE = 60_000;

interface Own {
  material: THREE.Material | THREE.Material[];
}

export default function UserModel({ entry, mode, lite }: { entry: ModelEntry; mode: ViewMode; lite?: boolean | "low" }) {
  const { model, placement: p } = entry;
  const blue = mode !== "real";
  const s = UNIT_SCALE[p.unit];
  const cx = (model.min[0] + model.max[0]) / 2;
  const cz = (model.min[2] + model.max[2]) / 2;
  const minY = model.min[1];

  const edges = useMemo(() => (blue ? mergedEdges(model.root, model.triangles, lite ? EDGE_BUDGET_LITE : EDGE_BUDGET) : null), [blue, model, lite]);
  const fill = useMemo(() => new THREE.MeshBasicMaterial({ color: "#5b8cf0", transparent: true, depthWrite: false, side: THREE.DoubleSide }), []);
  const line = useMemo(() => new THREE.LineBasicMaterial({ color: "#dce9ff", transparent: true, depthWrite: false }), []);
  useEffect(
    () => () => {
      fill.dispose();
      line.dispose();
    },
    [fill, line],
  );

  // Blueprint: one shared translucent material; real: the file's own (kept in userData).
  useLayoutEffect(() => {
    model.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const own = mesh.userData.__own as Own | undefined;
      if (!own) mesh.userData.__own = { material: mesh.material } satisfies Own;
      mesh.material = blue ? fill : ((mesh.userData.__own as Own).material ?? mesh.material);
      mesh.castShadow = !blue && !lite;
    });
  }, [blue, model, fill, lite]);

  // Opacity: the blue fill and outline scale with it; in the real view the file's materials fade.
  useLayoutEffect(() => {
    fill.opacity = (edges ? 0.09 : 0.2) * p.opacity;
    line.opacity = 0.5 * p.opacity;
    if (blue) return;
    model.root.traverse((o) => {
      const own = (o as THREE.Mesh).isMesh ? (o.userData.__own as Own | undefined) : undefined;
      if (!own) return;
      for (const m of Array.isArray(own.material) ? own.material : [own.material]) {
        const base = (m.userData.__base ??= { opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite }) as { opacity: number; transparent: boolean; depthWrite: boolean };
        m.opacity = base.opacity * p.opacity;
        const transparent = base.transparent || p.opacity < 0.999;
        if (m.transparent !== transparent) {
          m.transparent = transparent;
          m.needsUpdate = true;
        }
        m.depthWrite = p.opacity < 0.999 ? false : base.depthWrite;
      }
    });
  }, [p.opacity, blue, model, fill, line, edges]);

  return (
    <group position={[p.x, p.y, p.z]} rotation={[0, yaw(p.rot), 0]} visible={!p.hidden}>
      <group scale={s} position={[-cx * s, -minY * s, -cz * s]}>
        <primitive object={model.root} dispose={null}>
          {blue && edges && <lineSegments geometry={edges} material={line} renderOrder={2} />}
        </primitive>
      </group>
    </group>
  );
}
