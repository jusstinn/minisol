"use client";
/* The fade is written into plain uniform objects and a three.js group's visibility every frame, by design. */
/* eslint-disable react-hooks/immutability */

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type * as THREE from "three";
import House from "./House";
import { LawnBlades, LawnGround } from "./Lawn";
import type { UniformRef, WindUniforms } from "./materials";
import type { SurroundingsPlan } from "./plan";
import RoomDressing from "./Room";
import Vegetation from "./Vegetation";

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Everything around the project in the REAL view — see plan.ts for what and where. Mounted inside
 * the scene's world group (so it moves with the drawing) and faded in with the realistic look:
 * `realT` is the same 0 → 1 the model's own PLAN → REAL transition rides, so the garden
 * materialises as the parts do. `active` fades it back out (e.g. a patio's layer inspection,
 * which needs the cut-away rather than a lawn over it) without unmounting anything.
 */
export default function Surroundings({
  plan,
  realT,
  active,
  reduced,
  wind,
  day,
  night,
}: {
  plan: SurroundingsPlan;
  realT: React.RefObject<number>;
  active: boolean;
  reduced: boolean;
  wind: WindUniforms;
  /** 0 night → 1 day (window glow); and its mirror for lit interiors. */
  day: number;
  night: number;
}) {
  const group = useRef<THREE.Group>(null);
  const fade = useMemo<UniformRef>(() => ({ value: 0 }), []);
  const ground = useMemo<UniformRef>(() => ({ value: 0 }), []);
  const on = useRef(active ? 1 : 0);
  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    on.current += ((active ? 1 : 0) - on.current) * Math.min(1, delta * (reduced ? 30 : 5));
    const f = clamp01(realT.current * on.current);
    fade.value = f;
    ground.value = f;
    g.visible = f > 0.004;
  });
  return (
    <group ref={group} visible={false}>
      {plan.kind !== "room" && <LawnGround plan={plan} opacity={ground} />}
      {plan.kind !== "room" && <LawnBlades plan={plan} fade={fade} wind={wind} />}
      {plan.house && <House spec={plan.house} groundY={plan.groundY} fade={fade} night={night} />}
      {plan.kind !== "room" && <Vegetation plan={plan} fade={fade} />}
      {plan.room && <RoomDressing spec={plan.room} fade={fade} day={day} />}
    </group>
  );
}
