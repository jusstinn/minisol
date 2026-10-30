"use client";
/* three.js materials are tuned imperatively (night glow) by design. */
/* eslint-disable react-hooks/immutability */

import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { finishTextures } from "../textures";
import { dissolve, patched } from "./materials";
import type { UniformRef } from "./materials";
import type { HouseSpec } from "./plan";
import { wallPieces } from "./wallPieces";
import type { Hole } from "./wallPieces";

/**
 * The house behind a deck or patio (north side): a plastered wall with a real French door and a
 * window cut into it — the wall's thickness shows as a reveal — white window frame, anthracite
 * door frame, a stone sill, a plinth, a dark fascia and a clay-tile roof sloping away from the
 * camera. Glass is a smooth dark pane that mirrors the sky (the scene's own image-based light),
 * over a dim interior; at night the interior warms up. Boxes only: eight or so draw calls.
 */
let glassTex: THREE.CanvasTexture | null = null;
/** What a window pane shows by day (browser only): reflected sky fading to reflected garden, one soft sheen. */
function glassReflection(): THREE.CanvasTexture {
  if (glassTex) return glassTex;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const ctx = c.getContext("2d");
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, "#aebfcc");
    g.addColorStop(0.35, "#8497a6");
    g.addColorStop(0.7, "#56636c");
    g.addColorStop(1, "#3f4a46");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 128);
    const s = ctx.createLinearGradient(0, 128, 64, 0);
    s.addColorStop(0.3, "rgba(255,255,255,0)");
    s.addColorStop(0.45, "rgba(255,255,255,0.13)");
    s.addColorStop(0.55, "rgba(255,255,255,0)");
    ctx.fillStyle = s;
    ctx.fillRect(0, 0, 64, 128);
  }
  glassTex = new THREE.CanvasTexture(c);
  glassTex.colorSpace = THREE.SRGBColorSpace;
  return glassTex;
}

export default function House({ spec, groundY, fade, night }: { spec: HouseSpec; groundY: number; fade: UniformRef; night: number }) {
  const { x0, x1, zFront, thickness: t, height, sillY, door, window: win } = spec;
  const baseY = groundY - 0.3;
  const wallW = x1 - x0;
  const wallCx = (x0 + x1) / 2;
  const backZ = zFront - t;

  const holes = useMemo(() => {
    const h: Hole[] = [{ u0: door.cx - door.w / 2, u1: door.cx + door.w / 2, v0: sillY, v1: sillY + door.h }];
    if (win) h.push({ u0: win.cx - win.w / 2, u1: win.cx + win.w / 2, v0: win.sill, v1: win.sill + win.h });
    return h;
  }, [door, win, sillY]);
  const pieces = useMemo(() => wallPieces(x0, x1, baseY, height, holes), [x0, x1, baseY, height, holes]);

  const mats = useMemo(() => {
    const d = dissolve(fade);
    const plaster = finishTextures({ kind: "plaster", unit: [1.1, 1.1], axes: "xy" }, [wallW, height, t]);
    const tiles = finishTextures({ kind: "paver", unit: [0.3, 0.18], axes: "xy" }, [wallW + 0.4, 4, t]);
    const std = (p: THREE.MeshStandardMaterialParameters, key: string) => patched(new THREE.MeshStandardMaterial(p), key, d);
    return {
      wall: std({ color: "#cdc5b6", roughness: 0.92, map: plaster.map, roughnessMap: plaster.roughnessMap, bumpMap: plaster.bumpMap, bumpScale: 0.0018 }, "sur-wall"),
      plinth: std({ color: "#8d8a83", roughness: 0.9 }, "sur-plinth"),
      white: std({ color: "#f4f2ec", roughness: 0.45, metalness: 0 }, "sur-white"),
      dark: std({ color: "#2f3338", roughness: 0.42, metalness: 0.55 }, "sur-frame"),
      stone: std({ color: "#d8d2c4", roughness: 0.78 }, "sur-stone"),
      fascia: std({ color: "#4b4038", roughness: 0.8 }, "sur-fascia"),
      roof: std({ color: "#76473a", roughness: 0.82, map: tiles.map, roughnessMap: tiles.roughnessMap, bumpMap: tiles.bumpMap, bumpScale: 0.004 }, "sur-roof"),
      inside: std({ color: "#1c1814", roughness: 0.95, emissive: "#ff9a3c", emissiveIntensity: 0 }, "sur-inside"),
      // Glazing as a photo shows it by day: mostly the sky and garden reflected (pale at the top,
      // darker toward the sill), a soft diagonal sheen, and only a hint of the dim room behind.
      glass: patched(new THREE.MeshStandardMaterial({ color: "#ffffff", map: glassReflection(), roughness: 0.12, metalness: 0.1, envMapIntensity: 0.6 }), "sur-glass", d),
      handle: std({ color: "#b9bcc0", roughness: 0.3, metalness: 0.85 }, "sur-handle"),
    };
  }, [fade, wallW, height, t]);
  useFrame(() => {
    mats.inside.emissiveIntensity = night * 0.9;
  });

  const box = (key: string, cx: number, cy: number, cz: number, w: number, h: number, d: number, m: THREE.Material, cast = true) => (
    <mesh key={key} position={[cx, cy, cz]} material={m} castShadow={cast} receiveShadow raycast={() => null}>
      <boxGeometry args={[w, h, d]} />
    </mesh>
  );
  /** A rectangular frame around an opening, in the reveal's front plane. */
  const frame = (key: string, u0: number, u1: number, v0: number, v1: number, sec: number, depth: number, m: THREE.Material) => {
    const cz = zFront + 0.008 - depth / 2;
    return (
      <group key={key}>
        {box(`${key}-b`, (u0 + u1) / 2, v0 + sec / 2, cz, u1 - u0, sec, depth, m, false)}
        {box(`${key}-t`, (u0 + u1) / 2, v1 - sec / 2, cz, u1 - u0, sec, depth, m, false)}
        {box(`${key}-l`, u0 + sec / 2, (v0 + v1) / 2, cz, sec, v1 - v0 - 2 * sec, depth, m, false)}
        {box(`${key}-r`, u1 - sec / 2, (v0 + v1) / 2, cz, sec, v1 - v0 - 2 * sec, depth, m, false)}
      </group>
    );
  };
  const glassZ = zFront - 0.07;
  const insideZ = backZ + 0.05;

  const openings: { key: string; u0: number; u1: number; v0: number; v1: number; isDoor: boolean }[] = [
    { key: "door", u0: door.cx - door.w / 2, u1: door.cx + door.w / 2, v0: sillY, v1: sillY + door.h, isDoor: true },
  ];
  if (win) openings.push({ key: "win", u0: win.cx - win.w / 2, u1: win.cx + win.w / 2, v0: win.sill, v1: win.sill + win.h, isDoor: false });

  // Roof: a slab sloping up and away from the camera, with the fascia along the eave.
  const roofDepth = 3.4;
  const pitch = 0.4;
  const roofY = height + Math.sin(pitch) * (roofDepth / 2) - 0.02;
  const roofZ = zFront + 0.4 - (Math.cos(pitch) * roofDepth) / 2;

  return (
    <group>
      {pieces.map((p, i) => box(`w${i}`, (p.u0 + p.u1) / 2, (p.v0 + p.v1) / 2, zFront - t / 2, p.u1 - p.u0, p.v1 - p.v0, t, mats.wall))}
      {box("plinth", wallCx, groundY + Math.max(0.05, Math.min(0.28, sillY - groundY - 0.03)) / 2, zFront + 0.012, wallW, Math.max(0.05, Math.min(0.28, sillY - groundY - 0.03)), 0.03, mats.plinth, false)}
      {openings.map((o) => {
        const w = o.u1 - o.u0;
        const h = o.v1 - o.v0;
        const cu = (o.u0 + o.u1) / 2;
        const sec = o.isDoor ? 0.07 : 0.055;
        const fm = o.isDoor ? mats.dark : mats.white;
        const panes = o.isDoor ? 2 : w > 1.0 ? 2 : 1;
        return (
          <group key={o.key}>
            <mesh position={[cu, (o.v0 + o.v1) / 2, insideZ]} material={mats.inside} castShadow={false} receiveShadow raycast={() => null}>
              <boxGeometry args={[w, h, 0.04]} />
            </mesh>
            {frame(`${o.key}-f`, o.u0, o.u1, o.v0, o.v1, sec, 0.12, fm)}
            {Array.from({ length: panes }, (_, i) => {
              const pw = (w - 2 * sec - (panes - 1) * 0.05) / panes;
              const pu = o.u0 + sec + pw / 2 + i * (pw + 0.05);
              return box(`${o.key}-g${i}`, pu, (o.v0 + o.v1) / 2, glassZ, pw, h - 2 * sec, 0.012, mats.glass, false);
            })}
            {panes === 2 && box(`${o.key}-m`, cu, (o.v0 + o.v1) / 2, glassZ + 0.005, 0.05, h - 2 * sec, 0.04, fm, false)}
            {!o.isDoor && box(`${o.key}-tr`, cu, o.v0 + h * 0.62, glassZ + 0.005, w - 2 * sec, 0.03, 0.035, fm, false)}
            {!o.isDoor && box(`${o.key}-sill`, cu, o.v0 - 0.02, zFront + 0.05, w + 0.2, 0.045, 0.16, mats.stone)}
            {o.isDoor && box(`${o.key}-h1`, cu - 0.09, o.v0 + h * 0.45, glassZ + 0.03, 0.02, 0.2, 0.025, mats.handle, false)}
            {o.isDoor && box(`${o.key}-h2`, cu + 0.09, o.v0 + h * 0.45, glassZ + 0.03, 0.02, 0.2, 0.025, mats.handle, false)}
          </group>
        );
      })}
      {box("fascia", wallCx, height + 0.06, zFront + 0.2, wallW + 0.5, 0.2, 0.62, mats.fascia)}
      <mesh position={[wallCx, roofY, roofZ]} rotation={[pitch, 0, 0]} material={mats.roof} castShadow receiveShadow raycast={() => null}>
        <boxGeometry args={[wallW + 0.5, 0.12, roofDepth]} />
      </mesh>
    </group>
  );
}
