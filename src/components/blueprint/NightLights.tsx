"use client";

import { useMemo } from "react";
import { ITEMS } from "@/domain/items";
import type { Item, ItemKind } from "@/domain/items";
import { itemContainer } from "@/domain/layout";
import type { Layout } from "@/domain/layout";

/** Fixtures the night simulation lights up — anything else placed in the sketch stays unlit. */
export const LAMP_KINDS: readonly ItemKind[] = ["garden_light", "wall_lamp", "floor_lamp", "ceiling_lamp"];

/** The lamps actually placed in this layout, capped so the night view never draws more point
 *  lights than a device can comfortably afford (see `Scene`'s own `lite` cap elsewhere). */
export function lampItems(layout: Layout | undefined | null, limit: number): Item[] {
  if (!layout?.items?.length) return [];
  return layout.items.filter((it) => LAMP_KINDS.includes(it.kind)).slice(0, Math.max(0, limit));
}

/**
 * Warm point lights + a small glowing bulb for every garden/wall/floor/ceiling lamp placed in the
 * sketch — meant for `Scene`'s `extra` (plan coordinates, inside the world group, so the lamps
 * move with the drawing). No shadows from these: they're a lighting accent on top of the one
 * shadow-casting sun, not a second one.
 */
export default function NightLights({ layout, limit, strength = 1 }: { layout: Layout; limit: number; strength?: number }) {
  const lamps = useMemo(() => lampItems(layout, limit), [layout, limit]);
  return (
    <>
      {lamps.map((it) => {
        const spec = ITEMS[it.kind];
        const c = itemContainer(layout, it.zone, { x: it.x, z: it.z });
        const y =
          spec.mount === "ceiling"
            ? (c.ceilingY ?? 2.6) - spec.h / 2
            : spec.mount === "wall"
              ? c.floorY + (spec.elevation ?? 1) + spec.h * 0.5
              : c.floorY + spec.h * 0.85;
        return (
          <group key={it.id} position={[it.x, y, it.z]}>
            <pointLight color="#ffcb86" intensity={2.4 * strength} distance={4.6} decay={2} castShadow={false} />
            <mesh>
              <sphereGeometry args={[0.045, 10, 10]} />
              <meshStandardMaterial color="#ffe6ae" emissive="#ffc879" emissiveIntensity={1.6 + strength} toneMapped={false} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}
