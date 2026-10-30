"use client";
/* three.js objects (camera, refs shared with useFrame) are mutated imperatively every frame by design. */
/* eslint-disable react-hooks/immutability */

import { ContactShadows, Edges, Line, OrbitControls } from "@react-three/drei";
import { addAfterEffect, Canvas, useFrame, useThree } from "@react-three/fiber";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Line2, LineSegments2 } from "three-stdlib";
import type { Build, DimLine as DimLineSpec, Part, Vec3 } from "./builders";
import { cameraFor, TOUR_LAP_SECONDS, tourFrame } from "./cameraPresets";
import type { CameraPreset, FrameFit, TourArc } from "./cameraPresets";
import { captureHighRes, computeCaptureSize, EXCLUDE_FROM_CAPTURE } from "./capture";
import { deckScrewInstances } from "./detail/deckScrews";
import { bevelGeometryFor, slatsGeometryFor, UNIT_BLADE, unitGeometryFor } from "./detail/geometries";
import { isBevelShape, isRealSized, shapeFor } from "./detail/shapes";
import { daylightFor } from "./daylight";
import { groundHaloTexture } from "./groundHalo";
import Lighting from "./Lighting";
import { patched, turfNormals, windSway } from "./surroundings/materials";
import type { WindUniforms } from "./surroundings/materials";
import { useSurroundings } from "./surroundings/pref";
import { groundPartRole, planSurroundings } from "./surroundings/plan";
import Surroundings from "./surroundings/Surroundings";
import { hasVariation, partVariation } from "./partVariation";
import { shadowBoundsFor } from "./shadowBounds";
import type { SunLight } from "./sunLighting";
import { finishTextures } from "./textures";

// Lazy: ambient occlusion + anti-aliasing cost real bundle weight, so this never slows the
// start screen's first paint — only fetched once a REAL-mode, non-`lite` canvas actually mounts.
const Effects = dynamic(() => import("./Effects"), { ssr: false });

export type ViewMode = "blueprint" | "real" | "exploded";
export type { CameraPreset };
/** Imperative capture for "Randare foto" (see PhotoRender.tsx): a PNG data URL of the current
 *  frame at high resolution, or `null` if the canvas isn't ready yet. */
export type CaptureFn = (maxWidth?: number) => string | null;
/** Copy the next finished frame (post-processing included) into `target`, at the canvas's own
 *  size; resolves false if no frame arrives (paused) or the copy fails. */
export type SnapshotFn = (target: HTMLCanvasElement) => Promise<boolean>;

/** PCF is the fallback; drei's SoftShadows (see Lighting.tsx) swaps the map type for its own PCSS filter.
 *  A module constant: R3F re-applies the `shadows` prop whenever its content changes. */
const DESKTOP_SHADOWS = { type: THREE.PCFShadowMap } as const;
const PART_DUR = 0.55;
const MORPH_DUR = 0.7;
const GLOW_DUR = 1.8;
const EXPLODE_GAP = 0.55;
const PRESET_GLIDE_S = 0.7;
const REMOVED = "#ff5a4f";
/** Every part is a scaled unit box by default, so an edit can morph a part's size smoothly —
 *  see detail/shapes.ts and detail/geometries.ts for the higher-fidelity REAL-view shapes. */
const UNIT_BOX = unitGeometryFor("box");

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

interface Shared {
  clock: React.RefObject<number>;
  explode: React.RefObject<number>;
  /** Eases toward 1 in REAL mode, 0 otherwise — the ground halo's own fade (see `GroundHalo`),
   *  so "plan → reality" transitions the backdrop along with the model, not just the parts. */
  realT: React.RefObject<number>;
  reduced: boolean;
  /** Current world offset of the drawing (it is recentred on its plan centre). */
  offset: THREE.Vector3;
  /** Wind for the instanced grass (sway amplitude 0 under reduced motion) — see surroundings/materials.ts. */
  wind: WindUniforms;
}

/** Holds the drawing and eases it to its new centre after an edit (snaps on a full build). */
function World({ build, epoch, shared, children }: { build: Build; epoch: number; shared: Shared; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const seen = useRef(-1);
  const [cx, cz] = build.center ?? [0, 0];
  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    const snap = seen.current !== epoch || shared.reduced;
    seen.current = epoch;
    const k = snap ? 1 : Math.min(1, delta * 3);
    g.position.x += (-cx - g.position.x) * k;
    g.position.z += (-cz - g.position.z) * k;
    shared.offset.copy(g.position);
  });
  return <group ref={ref}>{children}</group>;
}

/**
 * How a part enters the scene. A full build plays every part in its assembly
 * order; after an edit only what changed moves: new parts assemble, resized
 * ones morph, removed ones sink away — and all of them glow for a moment so
 * the customer sees exactly what their edit did. `start` is resolved on the
 * first frame (clock time + offset), so no clock reset is ever needed.
 */
type AnimKind = "build" | "still" | "new" | "changed" | "leave";
interface Anim {
  kind: AnimKind;
  offset: number;
  start?: number;
  from?: { pos: Vec3; size: Vec3 };
}

interface Track {
  build: Build;
  replayKey: SceneProps["replayKey"];
  /** Increments on every full (re)build; edits keep it. */
  epoch: number;
  anims: Map<string, Anim>;
  ghosts: Part[];
  diff: { added: number; changed: number; removed: number } | null;
}

/** Edge overlays are one draw call each: lite drops them on the context, and on small parts when there are many. */
type EdgeBudget = "all" | "products" | "major";
const MANY_PARTS = 250;

const sig = (p: Part) => `${p.pos.map((v) => v.toFixed(3)).join(",")}|${p.size.map((v) => v.toFixed(3)).join(",")}|${p.color}`;

function fullTrack(build: Build, replayKey: Track["replayKey"], epoch: number): Track {
  return { build, replayKey, epoch, anims: new Map(build.parts.map((p) => [p.id, { kind: "build", offset: p.delay }])), ghosts: [], diff: null };
}

function nextTrack(prev: Track, build: Build, replayKey: Track["replayKey"]): Track {
  const before = new Map(prev.build.parts.map((p) => [p.id, p]));
  const kept = build.parts.filter((p) => before.has(p.id)).length;
  // A replay, a different project, or a change so big nothing is recognisable → full build.
  if (replayKey !== prev.replayKey || !build.parts.length || kept / build.parts.length < 0.3) return fullTrack(build, replayKey, prev.epoch + 1);

  const fresh: { p: Part; from?: Part }[] = [];
  const anims = new Map<string, Anim>();
  for (const p of build.parts) {
    const q = before.get(p.id);
    if (q && sig(q) === sig(p)) anims.set(p.id, { kind: "still", offset: 0, start: -Infinity });
    else fresh.push({ p, from: q });
  }
  const delays = fresh.map((f) => f.p.delay);
  const min = Math.min(...delays);
  const spread = Math.max(...delays) - min;
  const k = spread > 0 ? Math.min(0.45, 2.2 / spread) : 0;
  for (const { p, from } of fresh) {
    anims.set(
      p.id,
      from ? { kind: "changed", offset: 0.1 + (p.delay - min) * k * 0.5, from: { pos: from.pos, size: from.size } } : { kind: "new", offset: 0.25 + (p.delay - min) * k },
    );
  }
  const ids = new Set(build.parts.map((p) => p.id));
  const ghosts = prev.build.parts.filter((p) => !ids.has(p.id));
  ghosts.forEach((g, i) => anims.set(`ghost:${g.id}`, { kind: "leave", offset: Math.min(0.4, i * 0.01) }));
  const changed = fresh.filter((f) => f.from).length;
  return { build, replayKey, epoch: prev.epoch, anims, ghosts, diff: { added: fresh.length - changed, changed, removed: ghosts.length } };
}

function Driver({ shared, mode }: { shared: Shared; mode: ViewMode }) {
  useFrame((_, delta) => {
    // Real time (so slow devices don't play the build in slow motion), capped so a
    // background tab doesn't skip the whole animation when it comes back.
    const dt = Math.min(delta, 0.25);
    shared.clock.current += dt;
    const target = mode === "exploded" ? 1 : 0;
    shared.explode.current += (target - shared.explode.current) * Math.min(1, dt * 5);
    const realTarget = mode === "real" ? 1 : 0;
    const realRate = shared.reduced ? 20 : 1.6; // snap instantly under reduced motion
    shared.realT.current += (realTarget - shared.realT.current) * Math.min(1, dt * realRate);
    shared.wind.uTime.value = shared.clock.current;
  });
  return null;
}

function PartMesh({
  part,
  anim,
  mode,
  highlighted,
  dimmed,
  layerIndex,
  shared,
  accent,
  edges = "all",
  lite = false,
  hidden = false,
}: {
  part: Part;
  anim: Anim;
  mode: ViewMode;
  highlighted: boolean;
  dimmed: boolean;
  layerIndex: number;
  shared: Shared;
  accent: string;
  /** Which parts get an edge overlay (lite: not the context, and not the small ones in a big build). */
  edges?: EdgeBudget;
  /** Phones / low-end: flat colour, no procedural textures (see Scene's own `lite` prop). */
  lite?: boolean | "low";
  /** Drawn by something else in this view (a lawn replaces the builders' ghost ground): stays mounted, never shown. */
  hidden?: boolean;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial | THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial>(null);
  const glow = useMemo(() => new THREE.Color(anim.kind === "leave" ? REMOVED : accent), [anim.kind, accent]);
  /** Last glow applied; once a part has settled (0) the material is left to its props. */
  const lastGlow = useRef(-1);
  const leaving = anim.kind === "leave";
  const blue = mode !== "real";
  // REAL view: each board/paver/tile its own subtle tone and grain position (seeded by its id — see partVariation.ts).
  const variation = useMemo(() => (lite ? null : partVariation(part)), [part, lite]);
  const realColor = useMemo(() => {
    // The new turf's flat sheet under its blades: a lawn green, not the plan's bright swatch green.
    if (part.layer === "grass_seed" && !lite) return `#${new THREE.Color(part.color).offsetHSL(-0.06, -0.12, -0.07).getHexString()}`;
    if (!variation || !hasVariation(variation)) return part.color;
    return `#${new THREE.Color(part.color).offsetHSL(variation.dh, variation.ds, variation.dl).getHexString()}`;
  }, [part.color, part.layer, lite, variation]);
  const baseColor = highlighted ? accent : blue ? (part.context ? "#4f82ea" : "#5b8cf0") : realColor;
  // REAL mode ghosts (a dimmed layer, or a build-simulation step not reached yet) need to read
  // clearly fainter than the blueprint's own dim, since they sit over a light, busy background.
  const baseOpacity = blue ? (highlighted ? 0.6 : part.context || dimmed ? 0.06 : 0.28) : dimmed ? 0.11 : (part.opacity ?? 1);
  const slideAxis = part.size[0] >= part.size[2] ? "x" : "z";
  const minor = Math.max(...part.size) < 0.25 || Math.min(...part.size) < 0.03;
  const outlined = highlighted || edges === "all" || (!part.context && (edges === "products" || !minor));
  // Procedural PBR maps for the REAL view only — desktop/tablet; phones keep a flat colour.
  const useFinish = !blue && !lite && Boolean(part.finish);
  const finish = useMemo(() => {
    if (!useFinish || !part.finish) return null;
    const set = finishTextures(part.finish, part.size);
    if (!variation || (variation.du === 0 && variation.dv === 0)) return set;
    // Same image on the GPU (a clone shares its Source), only this part's own offset into it.
    const slide = (t: THREE.Texture) => {
      const c = t.clone();
      c.offset.set(variation.du, variation.dv);
      return c;
    };
    return { ...set, map: slide(set.map), roughnessMap: slide(set.roughnessMap), bumpMap: slide(set.bumpMap), owned: true };
  }, [useFinish, part.finish, part.size, variation]);
  useEffect(() => {
    if (!finish || !("owned" in finish)) return;
    return () => {
      finish.map.dispose();
      finish.roughnessMap.dispose();
      finish.bumpMap.dispose();
    };
  }, [finish]);
  // Higher-fidelity geometry for the REAL view, desktop only (see detail/shapes.ts): a chamfered
  // edge at the part's own real size, a round pedestal, a post cap, or a furniture/BBQ/lamp
  // highlight — PLAN/EXPLODED and phones stay plain boxes. Built to the part's *real* size (not a
  // scaled unit cube), so a bevel stays a constant few millimetres regardless of how long the
  // part is — see geometries.ts's module doc for why that matters for a 4 m deck board.
  const shape = useMemo(() => shapeFor(part, { real: !blue, lite }), [part, blue, lite]);
  const bevel = isRealSized(shape);
  const steadyGeometry = useMemo(
    () => (shape === "slats" ? slatsGeometryFor(part.size) : isBevelShape(shape) ? bevelGeometryFor(shape, part.size) : unitGeometryFor(shape)),
    [shape, part.size],
  );

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const now = shared.clock.current;
    if (anim.start === undefined) anim.start = now + anim.offset;
    const age = now - anim.start;
    const t = shared.reduced ? (leaving ? 1 : 1) : clamp01(age / (anim.kind === "changed" ? MORPH_DUR : PART_DUR));
    mesh.visible = !hidden && (leaving ? t < 0.999 : t > 0.001);
    if (!mesh.visible) return;
    const e = easeOutCubic(t);
    let [x, y, z] = part.pos;
    let [w, h, d] = part.size;
    let sx = 1,
      sy = 1,
      sz = 1;
    if (anim.kind === "changed" && anim.from) {
      const m = easeInOut(t);
      x = lerp(anim.from.pos[0], x, m);
      y = lerp(anim.from.pos[1], y, m);
      z = lerp(anim.from.pos[2], z, m);
      w = lerp(anim.from.size[0], w, m);
      h = lerp(anim.from.size[1], h, m);
      d = lerp(anim.from.size[2], d, m);
    } else if (leaving) {
      sy = Math.max(1 - e, 0.001);
      y = part.pos[1] - h / 2 + (h * sy) / 2 - e * 0.15;
      sx = sz = 1 + 0.05 * e;
    } else {
      switch (part.grow) {
        case "drop":
          y += (1 - e) * 0.9;
          break;
        case "rise":
          sy = Math.max(e, 0.001);
          y = part.pos[1] - h / 2 + (h * sy) / 2;
          break;
        case "pop": {
          const s = Math.max(easeOutBack(t), 0.001);
          sx = sy = sz = s;
          break;
        }
        case "slide":
          if (slideAxis === "x") {
            sx = Math.max(e, 0.001);
            x = part.pos[0] - w / 2 + (w * sx) / 2;
          } else {
            sz = Math.max(e, 0.001);
            z = part.pos[2] - d / 2 + (d * sz) / 2;
          }
          break;
        case "fade":
          sx = sz = 0.96 + 0.04 * e;
          break;
      }
    }
    if (!part.context) y += shared.explode.current * (layerIndex + 1) * EXPLODE_GAP;
    mesh.position.set(x, y, z);
    // A bevel geometry is baked to the part's *real* size (see the module doc), so it only
    // needs the bare growth fraction on top — except mid-resize (an edit's "changed" morph),
    // where the target size itself is still interpolating: fall back to the plain box rather
    // than rebuild (or distort) a chamfered geometry every frame for a fraction of a second.
    const morphing = bevel && anim.kind === "changed" && t < 0.999;
    mesh.geometry = morphing ? UNIT_BOX : steadyGeometry;
    if (bevel && !morphing) mesh.scale.set(Math.max(sx, 1e-4), Math.max(sy, 1e-4), Math.max(sz, 1e-4));
    else mesh.scale.set(Math.max(w * sx, 1e-4), Math.max(h * sy, 1e-4), Math.max(d * sz, 1e-4));

    // Diff glow: edited parts light up in the accent colour, removed ones in red, then settle.
    const mtl = mat.current;
    if (!mtl) return;
    const g = leaving ? 1 : anim.kind === "new" || anim.kind === "changed" ? 1 - clamp01((age - PART_DUR * 0.5) / GLOW_DUR) : 0;
    if (g === 0 && lastGlow.current === 0 && !leaving) return;
    lastGlow.current = g;
    mtl.color.set(baseColor);
    if (g > 0) mtl.color.lerp(glow, g);
    if (blue) mtl.opacity = (leaving ? 1 - e : 1) * lerp(baseOpacity, 0.7, g);
    else {
      mtl.opacity = leaving ? (1 - e) * baseOpacity : baseOpacity;
      const std = mtl as THREE.MeshStandardMaterial;
      if (std.emissive) {
        std.emissive.set(highlighted ? accent : "#000000");
        if (g > 0) std.emissive.lerp(glow, g * 0.6);
        std.emissiveIntensity = highlighted ? 0.35 : g > 0 ? 0.6 * g : 0;
      }
    }
  });

  return (
    <mesh ref={ref} geometry={steadyGeometry} visible={false} castShadow={!blue && !part.context && !leaving} receiveShadow={!blue}>
      {blue ? (
        <meshBasicMaterial ref={mat as React.RefObject<THREE.MeshBasicMaterial>} color={baseColor} transparent opacity={baseOpacity} depthWrite={false} toneMapped={false} />
      ) : finish?.clearcoat ? (
        // Ceramic: a thin lacquer layer on top of the base PBR response — the glazed look a
        // plain meshStandardMaterial can't give (desktop only; `useFinish` already excludes lite).
        <meshPhysicalMaterial
          ref={mat as React.RefObject<THREE.MeshPhysicalMaterial>}
          color={baseColor}
          roughness={finish.roughness}
          metalness={finish.metalness}
          map={finish.map}
          roughnessMap={finish.roughnessMap}
          bumpMap={finish.bumpMap}
          bumpScale={finish.bumpScale}
          clearcoat={finish.clearcoat}
          clearcoatRoughness={finish.clearcoatRoughness}
          transparent={baseOpacity < 1 || dimmed || leaving}
          opacity={baseOpacity}
          depthWrite={!dimmed}
        />
      ) : finish ? (
        <meshStandardMaterial
          ref={mat as React.RefObject<THREE.MeshStandardMaterial>}
          color={baseColor}
          roughness={finish.roughness}
          metalness={finish.metalness}
          map={finish.map}
          roughnessMap={finish.roughnessMap}
          bumpMap={finish.bumpMap}
          bumpScale={finish.bumpScale}
          transparent={baseOpacity < 1 || dimmed || leaving}
          opacity={baseOpacity}
          depthWrite={!dimmed}
        />
      ) : (
        <meshStandardMaterial
          ref={mat as React.RefObject<THREE.MeshStandardMaterial>}
          color={baseColor}
          roughness={0.82}
          metalness={0.02}
          transparent={baseOpacity < 1 || dimmed || leaving}
          opacity={baseOpacity}
          depthWrite={!dimmed}
        />
      )}
      {(blue || highlighted) && outlined && (
        <Edges
          threshold={20}
          color={leaving ? REMOVED : highlighted ? accent : part.context ? "#8fb3f2" : "#eef4ff"}
          lineWidth={highlighted ? 1.6 : 1.1}
          transparent
          opacity={part.context ? 0.4 : dimmed ? 0.25 : 1}
        />
      )}
    </mesh>
  );
}

function Grass({ grass, shared, mode, epoch }: { grass: NonNullable<Build["grass"]>; shared: Shared; mode: ViewMode; epoch: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const zoneKey = (z: { x: number; z: number; w: number; d: number }) => `${z.x.toFixed(2)},${z.z.toFixed(2)},${z.w.toFixed(2)},${z.d.toFixed(2)}`;
  const data = useMemo(() => {
    const total = grass.zones.reduce((s, z) => s + z.w * z.d, 0) || 1;
    const minX = Math.min(...grass.zones.map((z) => z.x));
    const spanX = Math.max(...grass.zones.map((z) => z.x + z.w)) - minX || 1;
    return grass.zones.flatMap((zone, zi) => {
      const rnd = mulberry32(42 + zi * 7919);
      const n = Math.round((grass.count * zone.w * zone.d) / total);
      return Array.from({ length: n }, () => {
        const x = zone.x + rnd() * zone.w;
        const z = zone.z + rnd() * zone.d;
        return {
          key: zoneKey(zone),
          x,
          z,
          h: 0.06 + rnd() * 0.09,
          widthJ: 0.8 + rnd() * 0.7,
          r: rnd() * Math.PI,
          lean: (rnd() - 0.5) * 0.45,
          wave: ((x - minX) / spanX) * 1.6 + rnd() * 0.3,
          // Several greens, not one flat tint: a wide hue/lightness jitter per blade.
          hueJ: (rnd() - 0.5) * 0.09,
          lightJ: (rnd() - 0.5) * 0.3,
        };
      });
    });
  }, [grass]);
  // Zones that were already grown keep their grass through an edit; new zones sprout.
  const grown = useRef({ epoch: -1, starts: new Map<string, number>(), explode: 0 });
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);
  const settled = useRef(0);
  useEffect(() => {
    settled.current = 0;
  }, [data]);
  const blue = mode !== "real";
  const material = useMemo(
    () => patched(new THREE.MeshStandardMaterial({ color: "#5fa04a", roughness: 0.9, side: THREE.DoubleSide, vertexColors: true }), "grass-wind", windSway(shared.wind), turfNormals),
    [shared.wind],
  );
  useEffect(() => {
    // REAL: the per-blade instance colours carry the green on their own (multiplying the same
    // green in twice made near-black, game-green strokes).
    material.color.set(blue ? "#9fd3a0" : "#ffffff");
  }, [material, blue]);
  // Per-blade hue/lightness jitter — several greens, not one flat tint — set once per data/mode
  // change (it never animates, so it doesn't belong in the per-frame loop below).
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const base = new THREE.Color(blue ? "#9fd3a0" : "#6f9444");
    for (let i = 0; i < data.length; i++) {
      const b = data[i];
      // REAL: a quieter jitter — at a few metres the blades are sub-pixel and strong contrast reads as speckle.
      tmpColor.copy(base).offsetHSL(blue ? b.hueJ : b.hueJ * 0.5, 0, blue ? b.lightJ : b.lightJ * 0.35);
      mesh.setColorAt(i, tmpColor);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [data, blue, tmpColor]);
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const now = shared.clock.current;
    const g = grown.current;
    const fullBuild = g.epoch !== epoch;
    if (fullBuild) {
      g.epoch = epoch;
      g.starts = new Map();
    }
    for (const z of grass.zones) {
      const k = zoneKey(z);
      if (!g.starts.has(k)) g.starts.set(k, now + (fullBuild ? grass.delay : 0.2));
    }
    if (Math.abs(shared.explode.current - g.explode) > 1e-4) settled.current = 0;
    g.explode = shared.explode.current;
    if (settled.current > 30) return;
    let allDone = true;
    for (let i = 0; i < data.length; i++) {
      const b = data[i];
      const t = shared.reduced ? 1 : clamp01((now - (g.starts.get(b.key) ?? now) - b.wave) / 0.7);
      if (t < 1) allDone = false;
      const s = Math.max(easeOutCubic(t), 0.0001);
      // The blade's own geometry runs from the ground (y 0) to its tip (y 1): its *height* is
      // the growth scale, not its position — a box centred on itself needed the old half-height
      // offset, a blade rooted at its own base doesn't.
      tmp.position.set(b.x, 0.012 + shared.explode.current * 2 * EXPLODE_GAP, b.z);
      tmp.rotation.set(b.lean, b.r, 0);
      tmp.scale.set(b.widthJ, Math.max(b.h * s, 1e-4), b.widthJ);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    settled.current = allDone ? settled.current + 1 : 0;
  });
  return (
    <instancedMesh key={data.length} ref={ref} args={[UNIT_BLADE, material, data.length]} frustumCulled={false}>
      {/* height/width are applied through instance scale — see the geometry's own doc. Vertex
          colours (baked into the blade geometry) lighten the tip; instance colours (above) vary
          the hue/lightness blade to blade — three.js multiplies both into the base colour; the
          material sways them in the wind (see surroundings/materials.ts's `windSway`). */}
    </instancedMesh>
  );
}

/**
 * A soft patch of garden/floor under the model, fading out at its edges (see groundHalo.ts) —
 * grounds the REAL-mode result instead of it sitting on the blueprint grid with a shadow and
 * nothing else. Stays mounted the whole time (even in PLAN/EXPLODED, at zero opacity) so flipping
 * modes is a fade, never a mount/unmount pop — its own opacity rides `shared.realT`, eased by
 * `Driver` in lock-step with the hero's "plan → reality" backdrop transition (see Hero.tsx).
 */
function GroundHalo({ build, shared }: { build: Build; shared: Shared }) {
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const texture = useMemo(() => groundHaloTexture(), []);
  const radius = Math.max(build.extent[0], build.extent[2]) * 1.25 + 2;
  // Muted, lit and shadowed like real ground (an unlit saturated green read as a neon glow).
  const tint = build.interior ? "#d6cdbd" : "#97ab84";
  useFrame(() => {
    if (mat.current) mat.current.opacity = shared.realT.current * 0.75;
  });
  return (
    <mesh position={[0, -0.006, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-10} receiveShadow raycast={() => null} userData={{ [EXCLUDE_FROM_CAPTURE]: true }}>
      <circleGeometry args={[radius, 64]} />
      <meshStandardMaterial ref={mat} alphaMap={texture} color={tint} roughness={1} metalness={0} transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

/**
 * Screw heads at every deck board × joist crossing (see detail/deckScrews.ts) — REAL view,
 * desktop only (see `Scene`'s own `lite`): one instanced draw call regardless of how many there
 * are, so even a big deck stays cheap. Each one pops in shortly after its own board settles.
 */
function DeckScrews({ parts, shared, show }: { parts: Part[]; shared: Shared; show: boolean }) {
  const points = useMemo(() => (show ? deckScrewInstances(parts) : []), [parts, show]);
  const ref = useRef<THREE.InstancedMesh>(null);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh || !points.length) return;
    const now = shared.clock.current;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const t = shared.reduced ? 1 : clamp01((now - p.delay - PART_DUR - 0.15) / 0.3);
      const s = Math.max(easeOutBack(t), 0.0001) * 0.0032;
      tmp.position.set(p.pos[0], p.pos[1] + shared.explode.current * EXPLODE_GAP, p.pos[2]);
      tmp.scale.set(s, s * 0.5, s);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  if (!points.length) return null;
  return (
    <instancedMesh key={points.length} ref={ref} args={[undefined, undefined, points.length]} frustumCulled={false}>
      <cylinderGeometry args={[0.5, 0.5, 1, 8, 1]} />
      <meshStandardMaterial color="#2b2b2b" roughness={0.35} metalness={0.85} />
    </instancedMesh>
  );
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIM_REVEAL_AT = 0.68; // fraction of the build's own duration before dimension lines start drawing in
const DIM_REVEAL_DUR = 0.9;

function DimLines({ build, mode, shared, epoch }: { build: Build; mode: ViewMode; shared: Shared; epoch: number }) {
  const color = mode === "real" ? "#141311" : "#e6efff";
  return (
    <group>
      {build.dims.map((dl, i) => (
        <DimLine key={i} dl={dl} color={color} index={i} total={build.dims.length} duration={build.duration} shared={shared} epoch={epoch} />
      ))}
    </group>
  );
}

function DimLine({
  dl,
  color,
  index,
  total,
  duration,
  shared,
  epoch,
}: {
  dl: DimLineSpec;
  color: string;
  index: number;
  total: number;
  duration: number;
  shared: Shared;
  /** A full (re)build restarts the draw-in; an edit (same epoch) keeps the lines fully shown. */
  epoch: number;
}) {
  const main = useRef<Line2 | LineSegments2>(null);
  const tickA = useRef<Line2 | LineSegments2>(null);
  const tickB = useRef<Line2 | LineSegments2>(null);
  const state = useRef({ epoch: -1, start: 0 });
  const { a, b, perp } = useMemo(() => {
    const dir = new THREE.Vector3(...dl.to).sub(new THREE.Vector3(...dl.from)).normalize();
    const p = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(0.08, 0, 0) : new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(0.08);
    return { a: new THREE.Vector3(...dl.from), b: new THREE.Vector3(...dl.to), perp: p };
  }, [dl]);
  useFrame(() => {
    const now = shared.clock.current;
    const st = state.current;
    if (st.epoch !== epoch) {
      st.epoch = epoch;
      st.start = now + duration * DIM_REVEAL_AT;
    }
    const stagger = total > 1 ? (index / total) * 0.3 : 0;
    const t = shared.reduced ? 1 : clamp01((now - st.start - stagger) / DIM_REVEAL_DUR);
    const o = easeOutCubic(t);
    if (main.current) main.current.material.opacity = 0.9 * o;
    if (tickA.current) tickA.current.material.opacity = o;
    if (tickB.current) tickB.current.material.opacity = o;
  });
  return (
    <group>
      <Line ref={main} points={[dl.from, dl.to]} color={color} lineWidth={1.2} transparent opacity={0} />
      <Line ref={tickA} points={[a.clone().add(perp).toArray(), a.clone().sub(perp).toArray()]} color={color} lineWidth={1.2} transparent opacity={0} />
      <Line ref={tickB} points={[b.clone().add(perp).toArray(), b.clone().sub(perp).toArray()]} color={color} lineWidth={1.2} transparent opacity={0} />
    </group>
  );
}

interface OverlayLabel {
  key: string;
  kind: "dim" | "layer";
  text: string;
  /** dim: fixed world position. layer: x offset + layer index (y follows the explode factor). */
  pos: THREE.Vector3;
  index: number;
}

function overlayLabels(build: Build): OverlayLabel[] {
  const dims = build.dims.map((d, i) => ({
    key: `d${i}`,
    kind: "dim" as const,
    text: d.label,
    pos: new THREE.Vector3(...d.from).add(new THREE.Vector3(...d.to)).multiplyScalar(0.5),
    index: i,
  }));
  const layers = build.layers.map((l, i) => ({
    key: `l${i}`,
    kind: "layer" as const,
    text: `${String(i + 1).padStart(2, "0")} ${l.label}`,
    pos: new THREE.Vector3((build.center?.[0] ?? 0) + build.extent[0] / 2 + 0.35, 0, build.center?.[1] ?? 0),
    index: i,
  }));
  return [...dims, ...layers];
}

/**
 * Projects label anchors to screen space every frame and moves plain DOM nodes
 * (rendered next to the canvas) — no per-label React roots, so no unmount races.
 */
function LabelProjector({ labels, els, shared }: { labels: OverlayLabel[]; els: React.RefObject<Map<string, HTMLDivElement>>; shared: Shared }) {
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  const since = useRef<{ labels: OverlayLabel[] | null; at: number }>({ labels: null, at: 0 });
  useFrame(() => {
    const explode = shared.explode.current;
    if (since.current.labels !== labels) since.current = { labels, at: shared.clock.current };
    const shown = shared.clock.current - since.current.at > 0.4;
    for (const l of labels) {
      const el = els.current.get(l.key);
      if (!el) continue;
      v.copy(l.pos).add(shared.offset);
      let visible: boolean;
      if (l.kind === "layer") {
        v.y = (l.index + 1) * EXPLODE_GAP * explode + 0.05;
        visible = explode > 0.15;
      } else {
        visible = shown;
      }
      v.project(camera);
      if (v.z > 1) visible = false;
      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;
      el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(${l.kind === "dim" ? "-50%" : "0"}, -50%)`;
      el.style.opacity = visible ? "1" : "0";
    }
  });
  return null;
}

function CameraRig({
  build,
  compact,
  epoch,
  focusLeft,
  preset,
  presetSeq,
  reduced,
  anim,
  onTourEnd,
  frame,
  tourArc,
}: {
  build: Build;
  compact: boolean;
  epoch: number;
  focusLeft: boolean;
  preset: CameraPreset;
  /** Bumped on every explicit preset pick (even picking the same one again) so a grab from an earlier tour lets go. */
  presetSeq: number;
  reduced: boolean;
  /** Shared with the canvas' OrbitControls: grabbing the camera stops a tour (and any in-flight glide) in its tracks. */
  anim: { current: { grabbed: boolean } };
  /** The cinematic tour finished its lap on its own (not interrupted) — let the toolbar settle back on "iso". */
  onTourEnd?: () => void;
  /** An opt-in direct framing (see cameraPresets.ts's `FrameFit`) — only the hero passes this. */
  frame?: FrameFit;
  /** An opt-in restricted sweep for `tour` (see cameraPresets.ts's `tourArcFor`) — undefined keeps
   *  the workspace's own "tour" camera a full revolution, exactly as before; only the hero (which
   *  always tours) passes one, picked from its own build's shape. */
  tourArc?: TourArc;
}) {
  const { camera, controls, size } = useThree() as unknown as {
    camera: THREE.PerspectiveCamera;
    controls: { target: THREE.Vector3; minPolarAngle: number; update: () => void } | null;
    size: { width: number; height: number };
  };
  const framed = useRef<{ epoch: number; compact: boolean } | null>(null);
  const lastSeq = useRef<number | undefined>(undefined);
  /** A one-shot ease between two frames (a new preset, an edit's re-fit, a resize…). */
  const glide = useRef<{ from: THREE.Vector3; to: THREE.Vector3; fromTarget: THREE.Vector3; toTarget: THREE.Vector3; fromFov: number; toFov: number; elapsed: number } | null>(null);
  /** The tour's own clock (0–1, one lap), independent of the glide above. */
  const tour = useRef<number | null>(null);

  /** The screen framing for one preset: the pure math, scaled for the compact layout and the plan editor's title block. */
  const frameFor = (p: CameraPreset) => {
    // While the plan editor covers the right side, the model has ~55% of the width.
    const aspect = (size.width / Math.max(1, size.height)) * (focusLeft ? 0.54 : 1);
    const f = cameraFor(p, { extent: build.extent }, aspect, frame, p === "tour" ? tourArc : undefined);
    const target = new THREE.Vector3(...f.target);
    const position = new THREE.Vector3(...f.position).sub(target).multiplyScalar(compact ? 1.05 : 0.95).add(target);
    return { position, target, fov: f.fov };
  };
  const tourFrameAt = (phase: number) => {
    const aspect = (size.width / Math.max(1, size.height)) * (focusLeft ? 0.54 : 1);
    const f = tourFrame({ extent: build.extent }, aspect, phase, tourArc, frame);
    const target = new THREE.Vector3(...f.target);
    const position = new THREE.Vector3(...f.position).sub(target).multiplyScalar(compact ? 1.05 : 0.95).add(target);
    return { position, target, fov: f.fov };
  };

  useLayoutEffect(() => {
    // A hidden canvas (a phone tab in the background) measures 0 × 0: keep the current framing.
    if (size.width < 10 || size.height < 10) return;
    const [L, H, W] = build.extent;
    camera.near = 0.05;
    camera.far = Math.max(400, (0.5 * Math.sqrt(L * L + H * H + W * W) + 0.4) * 20);
    // On the board the title block sits top-left: shift the projection (not the orbit pivot)
    // so the model renders lower-right and still spins around its own centre; when editing,
    // shift it left of the plan editor instead.
    if (compact) camera.clearViewOffset();
    else camera.setViewOffset(size.width, size.height, focusLeft ? size.width * 0.235 : -size.width * 0.09, -size.height * 0.07, size.width, size.height);
    // `top` needs to go almost all the way to the pole; everything else keeps the old floor
    // (so a free orbit never flips past vertical by accident).
    if (controls) controls.minPolarAngle = preset === "top" ? 0.02 : 0.2;

    const next = frameFor(preset);
    const f = framed.current;
    const same = Boolean(f && f.epoch === epoch && f.compact === compact);
    framed.current = { epoch, compact };

    if (same && controls && !reduced) {
      glide.current = { from: camera.position.clone(), to: next.position, fromTarget: controls.target.clone(), toTarget: next.target, fromFov: camera.fov, toFov: next.fov, elapsed: 0 };
      return;
    }
    glide.current = null;
    tour.current = null;
    camera.position.copy(next.position);
    camera.fov = next.fov;
    camera.updateProjectionMatrix();
    if (controls) {
      controls.target.copy(next.target);
      controls.update();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [build, camera, controls, compact, epoch, focusLeft, preset, reduced, size.width, size.height]);

  // Re-picking a preset (even the one already active) lets go of an earlier grab, so the tour
  // (or a fresh glide) can run again.
  useLayoutEffect(() => {
    if (presetSeq === lastSeq.current) return;
    lastSeq.current = presetSeq;
    anim.current.grabbed = false;
  }, [presetSeq, anim]);

  useFrame((_, delta) => {
    const g = glide.current;
    if (g) {
      g.elapsed += delta;
      const t = Math.min(1, g.elapsed / PRESET_GLIDE_S);
      const e = easeInOut(t);
      camera.position.copy(g.from).lerp(g.to, e);
      camera.fov = lerp(g.fromFov, g.toFov, e);
      camera.updateProjectionMatrix();
      if (controls) controls.target.copy(g.fromTarget).lerp(g.toTarget, e);
      if (t >= 1) glide.current = null;
      return;
    }
    if (preset !== "tour" || reduced || anim.current.grabbed) return;
    const phase = Math.min(1, (tour.current ?? 0) + delta / TOUR_LAP_SECONDS);
    tour.current = phase;
    if (phase >= 1) {
      tour.current = null;
      onTourEnd?.();
      return;
    }
    const f = tourFrameAt(phase);
    camera.position.copy(f.position);
    camera.fov = f.fov;
    camera.updateProjectionMatrix();
    if (controls) controls.target.copy(f.target);
  });
  return null;
}

/**
 * Bridges the live `gl`/`scene`/`camera` (only reachable with `useThree`, inside the Canvas) out
 * to BlueprintPanel's "Randare foto" button, which lives outside it — see PhotoRender.tsx. Mounts
 * once per canvas, so `onCaptureReady` is only called when the renderer itself actually changes
 * (device quality flips), not on every render.
 */
function CaptureBridge({ lightRef, extent, onCaptureReady }: { lightRef: React.RefObject<THREE.DirectionalLight | null>; extent: Vec3; onCaptureReady?: (fn: CaptureFn) => void }) {
  const { gl, scene, camera } = useThree();
  const capture = useCallback<CaptureFn>(
    (maxWidth) => {
      if (gl.domElement.clientWidth < 10 || gl.domElement.clientHeight < 10) return null;
      const { width, height } = computeCaptureSize(gl.domElement.clientWidth, gl.domElement.clientHeight, gl.getPixelRatio(), maxWidth);
      const mapSize = shadowBoundsFor(extent, { capture: true }).mapSize;
      return captureHighRes({ gl, scene, camera: camera as THREE.PerspectiveCamera, light: lightRef.current, width, height, mapSize });
    },
    [gl, scene, camera, lightRef, extent],
  );
  useEffect(() => {
    onCaptureReady?.(capture);
  }, [onCaptureReady, capture]);
  return null;
}

/**
 * A cheap frame grab for crossfades (the start screen's hero): right after a frame is drawn —
 * effects included — its pixels are copied GPU-to-GPU into a 2D canvas. No resize, no shadow-map
 * reallocation and no PNG encode, unlike the photo export (`CaptureBridge`), which made every
 * hero transition stall for 100–180 ms.
 */
function SnapshotBridge({ onSnapshotReady }: { onSnapshotReady?: (fn: SnapshotFn) => void }) {
  const gl = useThree((s) => s.gl);
  const pending = useRef<{ target: HTMLCanvasElement; resolve: (ok: boolean) => void } | null>(null);
  useEffect(() => {
    // After the frame is rendered and before it's presented, the drawing buffer still holds it.
    const unsubscribe = addAfterEffect(() => {
      const p = pending.current;
      if (!p) return;
      pending.current = null;
      try {
        const src = gl.domElement;
        p.target.width = src.width;
        p.target.height = src.height;
        const ctx = p.target.getContext("2d");
        if (!ctx) return p.resolve(false);
        ctx.drawImage(src, 0, 0);
        p.resolve(true);
      } catch {
        p.resolve(false);
      }
    });
    return () => {
      unsubscribe();
      pending.current?.resolve(false);
      pending.current = null;
    };
  }, [gl]);
  const snapshot = useCallback<SnapshotFn>(
    (target) =>
      new Promise((resolve) => {
        pending.current?.resolve(false);
        let done = false;
        const finish = (ok: boolean) => {
          if (done) return;
          done = true;
          resolve(ok);
        };
        pending.current = { target, resolve: finish };
        // No frame coming (a paused canvas): give up rather than wait forever.
        setTimeout(() => finish(false), 400);
      }),
    [],
  );
  useEffect(() => {
    onSnapshotReady?.(snapshot);
  }, [onSnapshotReady, snapshot]);
  return null;
}

export interface SceneProps {
  build: Build;
  mode: ViewMode;
  highlightLayer?: string | null;
  autoRotate?: boolean;
  replayKey?: number | string;
  accent?: string;
  compact?: boolean;
  interactive?: boolean;
  /** Called after an edit with how many parts were added, changed and removed. */
  onDiff?: (d: { added: number; changed: number; removed: number }) => void;
  /** Keep the model left of an overlay on the right (plan editor). */
  focusLeft?: boolean;
  /**
   * Phones / low-end devices: pixel ratio capped at 1.5 (1 for "low"), no antialiasing,
   * no shadows, edge overlays only on the products (and only the larger ones in big builds).
   */
  lite?: boolean | "low";
  /**
   * Ambient occlusion + anti-aliasing post-processing (REAL mode, desktop only — see
   * `realNow`): on by default. The hero turns this off — a scene that rebuilds every few
   * seconds churns through enough new geometry/shaders that the post-processing pass's own
   * periodic housekeeping shows up as an occasional frame hitch; a single settled workspace
   * project never does and holds a clean 60 fps with it on.
   */
  effects?: boolean;
  /**
   * Extra things drawn in plan coordinates inside the world group (e.g. the customer's own
   * model, a plan on the ground): they move with the drawing but never explode, aren't part
   * of the edit animation and don't change the camera fit.
   */
  extra?: React.ReactNode;
  /** Kept mounted but not visible (phone tabs): stop rendering, keep the state. */
  paused?: boolean;
  /** Which framing the camera eases to ("iso" — today's 3/4 view — by default). */
  preset?: CameraPreset;
  /** Bump to re-apply `preset` even when it's unchanged (e.g. picking "tour" again after grabbing the camera). */
  presetSeq?: number;
  /** The cinematic tour finished its lap on its own — switch the toolbar's selection back to "iso". */
  onTourEnd?: () => void;
  /** Called once the live renderer is ready with a `CaptureFn` for "Randare foto" (PhotoRender.tsx). */
  onCaptureReady?: (fn: CaptureFn) => void;
  /** A cheap copy of the next frame, for crossfades (see `SnapshotBridge`). */
  onSnapshotReady?: (fn: SnapshotFn) => void;
  /** The "Simulare" sun/time-of-day scrubber's current look (REAL mode only; null is today's fixed sun). */
  sun?: SunLight | null;
  /** The "Simulează montajul" scrubber's current `build.layers` index: later layers dim to a ghost
   *  (reusing the same highlight/dim path as `highlightLayer`), the current one lights up. */
  buildSimLayer?: number | null;
  /** An opt-in direct framing for "iso"/"tour" (see cameraPresets.ts's `FrameFit`) — only the hero
   *  passes this; everyone else keeps the plain bounding-sphere fit. */
  frame?: FrameFit;
  /** An opt-in restricted sweep for "tour" (see cameraPresets.ts's `tourArcFor`) — only the hero
   *  passes this; the workspace's own "tour" camera stays a full revolution. */
  tourArc?: TourArc;
  /** REAL-view surroundings (surroundings/plan.ts): "full" (default), "garden" — lawn and low
   *  planting only, no house or trees, for the hero's tight framing — or "off". */
  surroundings?: "full" | "garden" | "off";
}

export default function Scene({
  build,
  mode,
  highlightLayer,
  autoRotate = true,
  replayKey,
  accent = "#ff5b1f",
  compact = false,
  interactive = true,
  onDiff,
  focusLeft = false,
  lite = false,
  effects = true,
  extra,
  paused = false,
  preset = "iso",
  presetSeq = 0,
  onTourEnd,
  onCaptureReady,
  onSnapshotReady,
  sun = null,
  buildSimLayer = null,
  frame,
  tourArc,
  surroundings = "full",
}: SceneProps) {
  const clock = useRef(0);
  const explode = useRef(0);
  const realT = useRef(mode === "real" ? 1 : 0);
  const reduced = typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const wind = useMemo<WindUniforms>(() => ({ uTime: { value: 0 }, uWind: { value: reduced ? 0 : 1 } }), [reduced]);
  const shared = useMemo(() => ({ clock, explode, realT, reduced, offset: new THREE.Vector3(), wind }), [reduced, wind]);
  /** Shared with the canvas' OrbitControls: grabbing the camera stops a tour (and any in-flight glide). */
  const camAnim = useRef({ grabbed: false });

  // Diff the new build against the previous one (React's "adjust state on prop change" pattern).
  const [track, setTrack] = useState<Track>(() => fullTrack(build, replayKey, 0));
  let current = track;
  if (track.build !== build || track.replayKey !== replayKey) {
    current = nextTrack(track, build, replayKey);
    setTrack(current);
  }
  const ghosts = current.ghosts;
  useEffect(() => {
    if (!ghosts.length) return;
    const t = setTimeout(() => setTrack((tr) => (tr.ghosts === ghosts ? { ...tr, ghosts: [] } : tr)), 1400);
    return () => clearTimeout(t);
  }, [ghosts]);
  const diff = current.diff;
  useEffect(() => {
    if (diff) onDiff?.(diff);
  }, [diff, onDiff]);

  const layerIndex = useMemo(() => new Map(build.layers.map((l, i) => [l.id, i])), [build]);
  const labels = useMemo(() => overlayLabels(build), [build]);
  const labelEls = useRef<Map<string, HTMLDivElement>>(new Map());
  const shadowSize = Math.max(build.extent[0], build.extent[2]) * 1.6 + 2;
  const noAnim: Anim = { kind: "still", offset: 0, start: -Infinity };
  const edges: EdgeBudget = !lite ? "all" : build.parts.length > MANY_PARTS ? "major" : "products";
  // The garden/house/room dressing around the build (never part of `build.parts`: see surroundings/plan.ts).
  const [surroundingsPref] = useSurroundings();
  const plan = useMemo(() => {
    const p = lite || surroundings === "off" ? null : planSurroundings(build);
    return p && surroundings === "garden" ? { ...p, house: null, trees: [] } : p;
  }, [build, lite, surroundings]);
  const sOn = surroundingsPref && plan !== null;
  // A patio's layers are inspected through its cut-away: the lawn steps aside while one is highlighted.
  const section = Boolean(highlightLayer) || buildSimLayer != null;
  const lawnShown = sOn && !(plan?.kind === "paving" && section);
  // Shadows must reach what stands around the build (the house wall, shrubs), not just the build itself.
  const shadowExtent = useMemo<Vec3>(() => (sOn ? [build.extent[0] + 2.6, Math.max(build.extent[1], plan?.house ? 3.3 : 2.2), build.extent[2] + 2.6] : build.extent), [build.extent, sOn, plan?.house]);
  const shadowBounds = useMemo(() => shadowBoundsFor(shadowExtent), [shadowExtent]);
  const dl = useMemo(() => daylightFor(sun ?? null, Boolean(build.interior)), [sun, build.interior]);
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const realNow = mode === "real" && !lite;

  // `isolate`: without a local stacking context the backdrop tint below would paint behind the
  // sheet's own background instead of just behind the (transparent) canvas.
  return (
    <div className="relative isolate h-full w-full">
    {mode === "real" && sun?.bg && (
      <div className="pointer-events-none absolute inset-0 -z-10 transition-colors duration-700" style={{ background: sun.bg }} />
    )}
    <Canvas
      // Antialiasing is fixed when the context is created: a new quality level gets a new canvas.
      key={String(lite)}
      dpr={lite === "low" ? 1 : lite ? [1, 1.5] : [1, 2]}
      camera={{ fov: 32, position: [6, 5, 6] }}
      gl={{ antialias: !lite, alpha: true, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      // Stays tied to the DEVICE, not the view: switching PLAN ↔ REAL used to toggle this and
      // reconfigure the renderer (a visible flash) — now only each mesh's castShadow/receiveShadow
      // (and the light's own castShadow, below) change with the mode.
      shadows={!lite ? DESKTOP_SHADOWS : false}
      frameloop={paused ? "never" : "always"}
      style={{ touchAction: interactive ? "none" : "auto" }}
    >
      <Driver shared={shared} mode={mode} />
      <Lighting mode={mode} lite={lite} sun={sun} shadowBounds={shadowBounds} lightRef={lightRef} interior={build.interior} />
      <CaptureBridge lightRef={lightRef} extent={shadowExtent} onCaptureReady={onCaptureReady} />
      {onSnapshotReady && <SnapshotBridge onSnapshotReady={onSnapshotReady} />}

      <World build={build} epoch={current.epoch} shared={shared}>
      {!lite && (!sOn || plan?.kind === "room" || !lawnShown) && <GroundHalo build={build} shared={shared} />}
      {build.parts.map((p) => {
        const li = layerIndex.get(p.layer);
        const simGhost = buildSimLayer != null && !p.context && li !== undefined && li > buildSimLayer;
        const simCurrent = buildSimLayer != null && !p.context && li !== undefined && li === buildSimLayer;
        return (
          <PartMesh
            key={`${current.epoch}:${p.id}`}
            part={p}
            anim={current.anims.get(p.id) ?? noAnim}
            mode={mode}
            highlighted={(Boolean(highlightLayer) && p.layer === highlightLayer) || simCurrent}
            dimmed={(Boolean(highlightLayer) && p.layer !== highlightLayer && !p.context) || simGhost}
            layerIndex={li ?? 0}
            shared={shared}
            accent={accent}
            edges={edges}
            lite={lite}
            hidden={lawnShown && plan !== null && groundPartRole(p, plan.kind) === "hide"}
          />
        );
      })}
      {ghosts.map((p) => (
        <PartMesh
          key={`ghost:${current.epoch}:${p.id}`}
          part={p}
          anim={current.anims.get(`ghost:${p.id}`) ?? noAnim}
          mode={mode}
          highlighted={false}
          dimmed={false}
          layerIndex={layerIndex.get(p.layer) ?? 0}
          shared={shared}
          accent={accent}
          edges={edges}
          lite={lite}
        />
      ))}
      {build.grass && <Grass grass={build.grass} shared={shared} mode={mode} epoch={current.epoch} />}
      {plan && sOn && <Surroundings plan={plan} realT={realT} active={lawnShown} reduced={reduced} day={dl.day} night={sun?.nightFactor ?? 0} />}
      <DeckScrews parts={build.parts} shared={shared} show={realNow} />
      <DimLines build={build} mode={mode} shared={shared} epoch={current.epoch} />
      {extra}
      </World>
      <LabelProjector labels={labels} els={labelEls} shared={shared} />

      {/* Desktop: the ground (GroundHalo) takes the sun's real shadow. Its square plane read as a
          dark sheet under the model there, so contact shadows only ground phones, which have no shadow map. */}
      {realNow && lite && <ContactShadows position={[0, -0.001, 0]} scale={shadowSize} opacity={0.4} blur={2} far={shadowBounds.far * 0.3} resolution={512} />}
      {/* Stays mounted across PLAN/REAL/EXPLODED (and across the hero's own projects): see
          Effects.tsx's own doc on why toggling `aoEnabled` beats remounting the whole composer. */}
      {!lite && effects && <Effects aoEnabled={realNow} night={Boolean(sun?.isNight)} />}
      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom={interactive}
        enableRotate={interactive}
        autoRotate={autoRotate}
        autoRotateSpeed={0.6}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2.05}
        minDistance={1.5}
        maxDistance={120}
        onStart={() => {
          camAnim.current.grabbed = true;
        }}
      />
      <CameraRig
        build={build}
        compact={compact}
        epoch={current.epoch}
        focusLeft={focusLeft && !compact}
        preset={preset}
        presetSeq={presetSeq}
        reduced={reduced}
        anim={camAnim}
        onTourEnd={onTourEnd}
        frame={frame}
        tourArc={tourArc}
      />
    </Canvas>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {labels.map((l) => (
          <div
            key={l.key}
            ref={(el) => {
              if (el) labelEls.current.set(l.key, el);
              else labelEls.current.delete(l.key);
            }}
            className="absolute left-0 top-0 opacity-0 transition-opacity duration-300 will-change-transform"
          >
            {l.kind === "dim" ? (
              <div
                className={`whitespace-nowrap rounded-[4px] px-1.5 py-0.5 font-mono text-[10.5px] font-medium tracking-wide ${
                  mode === "real" ? "bg-ink text-paper" : "bg-[#0a1f47]/85 text-[#e6efff] ring-1 ring-[#dce9ff]/40"
                }`}
              >
                {l.text}
              </div>
            ) : (
              <div className={`flex items-center gap-1.5 whitespace-nowrap font-mono text-[10px] uppercase tracking-wider ${mode === "real" ? "text-ink" : "text-[#e6efff]"}`}>
                <span className={`h-px w-5 ${mode === "real" ? "bg-ink/60" : "bg-[#e6efff]/70"}`} />
                <span className={`rounded-sm px-1 py-px ${mode === "real" ? "bg-white/80" : "bg-[#0a1f47]/80"}`}>{l.text}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
