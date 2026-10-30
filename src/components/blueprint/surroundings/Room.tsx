"use client";
/* three.js materials are tuned imperatively (window glow by time of day) by design. */
 

import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { DISSOLVE_KEY, dissolve, patched } from "./materials";
import type { UniformRef } from "./materials";
import type { OpeningSpec, RoomSpec } from "./plan";

/**
 * Dressing for a cut-away room (paint / tiling): a window with daylight pouring through it, a
 * door with its casing, and skirting boards — fixed to the *inner* faces of the tall north and
 * west walls (the low south/east walls stay low, so the camera still sees in). Where the build
 * already has a window or door (its own thin `op-*` parts), the frame and glass sit exactly on
 * those; otherwise a sensible default is added. Everything is boxes, faded in with the REAL look.
 */

const PROUD = 0.022; // how far in front of the wall face the glass/leaf sits (clear of the op-* parts)

function skyPaneTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 2;
  c.height = 64;
  const ctx = c.getContext("2d");
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, "#9cc4f5");
    g.addColorStop(0.55, "#dcebff");
    g.addColorStop(1, "#f6f1e4");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

type Axis = "n" | "w" | "s" | "e";

export default function RoomDressing({ spec, fade, day }: { spec: RoomSpec; fade: UniformRef; day: number }) {
  const mats = useMemo(() => {
    const d = dissolve(fade);
    const pane = new THREE.MeshBasicMaterial({ map: skyPaneTexture(), toneMapped: true });
    return {
      white: patched(new THREE.MeshStandardMaterial({ color: "#f3f0e9", roughness: 0.5 }), DISSOLVE_KEY, d),
      leaf: patched(new THREE.MeshStandardMaterial({ color: "#e9e4d9", roughness: 0.55 }), DISSOLVE_KEY, d),
      panel: patched(new THREE.MeshStandardMaterial({ color: "#f4f1ea", roughness: 0.5 }), DISSOLVE_KEY, d),
      chrome: patched(new THREE.MeshStandardMaterial({ color: "#d4d7da", roughness: 0.32, metalness: 0.6 }), DISSOLVE_KEY, d),
      sill: patched(new THREE.MeshStandardMaterial({ color: "#ece8de", roughness: 0.6 }), DISSOLVE_KEY, d),
      pane: patched(pane, "room-pane", d),
    };
  }, [fade]);
  // The window is the brightest thing in the room by day, a dim blue square at night.
  useFrame(() => {
    const k = 0.1 + 2.1 * day;
    mats.pane.color.setRGB(k, k, k * (1 + (1 - day) * 0.5));
  });

  const { x0, x1, z0, z1, openings, door, skirting } = spec;

  /** Box on a wall: `u` is the position along it, `y` the height, `off` how far into the room. */
  const onWall = (wall: Axis, u: number, y: number, off: number, along: number, vert: number, depth: number, m: THREE.Material, key: string) => {
    const pos: [number, number, number] = wall === "n" ? [u, y, z0 + off] : wall === "s" ? [u, y, z1 - off] : wall === "w" ? [x0 + off, y, u] : [x1 - off, y, u];
    const size: [number, number, number] = wall === "n" || wall === "s" ? [along, vert, depth] : [depth, vert, along];
    return (
      <mesh key={key} position={pos} material={m} castShadow={false} receiveShadow raycast={() => null}>
        <boxGeometry args={size} />
      </mesh>
    );
  };

  const dress = (o: OpeningSpec, i: number) => {
    if (o.wall === "s" || o.wall === "e") return null; // the low walls stay as drawn
    const wall = o.wall;
    const w = o.u1 - o.u0;
    const h = o.y1 - o.y0;
    const cu = (o.u0 + o.u1) / 2;
    const cy = (o.y0 + o.y1) / 2;
    const k = `o${i}`;
    if (o.kind === "window") {
      const sec = 0.055;
      return (
        <group key={k}>
          {onWall(wall, cu, cy, PROUD + 0.002, w - 0.04, h - 0.04, 0.004, mats.pane, `${k}-pane`)}
          {onWall(wall, cu, o.y1 - sec / 2, PROUD + 0.012, w + 0.06, sec, 0.05, mats.white, `${k}-t`)}
          {onWall(wall, cu, o.y0 + sec / 2, PROUD + 0.012, w + 0.06, sec, 0.05, mats.white, `${k}-b`)}
          {onWall(wall, o.u0 + sec / 2 - 0.03, cy, PROUD + 0.012, sec, h, 0.05, mats.white, `${k}-l`)}
          {onWall(wall, o.u1 - sec / 2 + 0.03, cy, PROUD + 0.012, sec, h, 0.05, mats.white, `${k}-r`)}
          {onWall(wall, cu, cy, PROUD + 0.014, 0.04, h - sec, 0.04, mats.white, `${k}-m`)}
          {onWall(wall, cu, cy + h * 0.14, PROUD + 0.014, w - sec, 0.03, 0.04, mats.white, `${k}-tr`)}
          {onWall(wall, cu, o.y0 - 0.015, PROUD + 0.045, w + 0.2, 0.035, 0.12, mats.sill, `${k}-sill`)}
        </group>
      );
    }
    // A door: casing round the opening, a handle on the leaf.
    const sec = 0.075;
    return (
      <group key={k}>
        {onWall(wall, o.u0 - sec / 2 + 0.01, cy, PROUD + 0.01, sec, h + sec, 0.034, mats.white, `${k}-l`)}
        {onWall(wall, o.u1 + sec / 2 - 0.01, cy, PROUD + 0.01, sec, h + sec, 0.034, mats.white, `${k}-r`)}
        {onWall(wall, cu, o.y1 + sec / 2 - 0.01, PROUD + 0.01, w + 2 * sec - 0.02, sec, 0.034, mats.white, `${k}-t`)}
        {onWall(wall, o.u1 - 0.1, o.y0 + 1.0, PROUD + 0.045, 0.05, 0.024, 0.05, mats.chrome, `${k}-h`)}
      </group>
    );
  };

  // The default door (when the build has none on the tall walls) is a full panel door.
  const defaultDoor = door
    ? (() => {
        const w = door.u1 - door.u0;
        const h = door.y1 - door.y0;
        const cu = (door.u0 + door.u1) / 2;
        const cy = (door.y0 + door.y1) / 2;
        const sec = 0.075;
        const inner = (hh: number, y: number, key: string) => onWall("w", cu, y, 0.047, w * 0.62, hh, 0.012, mats.panel, key);
        return (
          <group key="door-default">
            {onWall("w", cu, cy, 0.03, w, h, 0.04, mats.leaf, "dd-leaf")}
            {inner(h * 0.34, cy + h * 0.22, "dd-p1")}
            {inner(h * 0.34, cy - h * 0.2, "dd-p2")}
            {onWall("w", door.u0 - sec / 2 + 0.005, cy, 0.036, sec, h + sec, 0.05, mats.white, "dd-l")}
            {onWall("w", door.u1 + sec / 2 - 0.005, cy, 0.036, sec, h + sec, 0.05, mats.white, "dd-r")}
            {onWall("w", cu, door.y1 + sec / 2 - 0.005, 0.036, w + 2 * sec - 0.01, sec, 0.05, mats.white, "dd-t")}
            {onWall("w", door.u1 - 0.1, door.y0 + 1.0, 0.075, 0.05, 0.024, 0.05, mats.chrome, "dd-h")}
          </group>
        );
      })()
    : null;

  // Skirting: 9 cm boards along every inner wall face, interrupted at doors.
  const skirt = () => {
    if (!skirting) return null;
    const boards: React.ReactNode[] = [];
    const runs: { wall: Axis; a: number; b: number }[] = [
      { wall: "n", a: x0, b: x1 },
      { wall: "s", a: x0, b: x1 },
      { wall: "w", a: z0, b: z1 },
      { wall: "e", a: z0, b: z1 },
    ];
    for (const r of runs) {
      const gaps = openings
        .filter((o) => o.kind === "door" && o.wall === r.wall)
        .map((o) => [o.u0 - 0.04, o.u1 + 0.04] as const)
        .concat(door && r.wall === "w" ? [[door.u0 - 0.04, door.u1 + 0.04] as const] : [])
        .sort((p, q) => p[0] - q[0]);
      let cursor = r.a;
      const push = (a: number, b: number, i: number) => {
        if (b - a > 0.05) boards.push(onWall(r.wall, (a + b) / 2, 0.045, 0.009, b - a, 0.09, 0.018, mats.white, `sk-${r.wall}-${i}`));
      };
      gaps.forEach((g, i) => {
        push(cursor, Math.min(g[0], r.b), i);
        cursor = Math.max(cursor, g[1]);
      });
      push(cursor, r.b, gaps.length);
    }
    return boards;
  };

  return (
    <group>
      {openings.map(dress)}
      {defaultDoor}
      {skirt()}
    </group>
  );
}
