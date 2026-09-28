"use client";
/* three.js objects (camera, refs shared with useFrame) are mutated imperatively every frame by design. */
/* eslint-disable react-hooks/immutability */

import { ContactShadows, Edges, Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Build, Part, Vec3 } from "./builders";

export type ViewMode = "blueprint" | "real" | "exploded";

const PART_DUR = 0.55;
const MORPH_DUR = 0.7;
const GLOW_DUR = 1.8;
const EXPLODE_GAP = 0.55;
const REMOVED = "#ff5a4f";
/** Every part is a scaled unit box, so an edit can morph a part's size smoothly. */
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

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
  reduced: boolean;
  /** Current world offset of the drawing (it is recentred on its plan centre). */
  offset: THREE.Vector3;
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
    const dt = Math.min(delta, 0.05);
    shared.clock.current += dt;
    const target = mode === "exploded" ? 1 : 0;
    shared.explode.current += (target - shared.explode.current) * Math.min(1, dt * 5);
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
}: {
  part: Part;
  anim: Anim;
  mode: ViewMode;
  highlighted: boolean;
  dimmed: boolean;
  layerIndex: number;
  shared: Shared;
  accent: string;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial | THREE.MeshStandardMaterial>(null);
  const glow = useMemo(() => new THREE.Color(anim.kind === "leave" ? REMOVED : accent), [anim.kind, accent]);
  const leaving = anim.kind === "leave";
  const blue = mode !== "real";
  const baseColor = highlighted ? accent : blue ? (part.context ? "#4f82ea" : "#5b8cf0") : part.color;
  const baseOpacity = blue ? (highlighted ? 0.6 : part.context || dimmed ? 0.06 : 0.28) : dimmed ? 0.25 : (part.opacity ?? 1);
  const slideAxis = part.size[0] >= part.size[2] ? "x" : "z";

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const now = shared.clock.current;
    if (anim.start === undefined) anim.start = now + anim.offset;
    const age = now - anim.start;
    const t = shared.reduced ? (leaving ? 1 : 1) : clamp01(age / (anim.kind === "changed" ? MORPH_DUR : PART_DUR));
    mesh.visible = leaving ? t < 0.999 : t > 0.001;
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
    mesh.scale.set(Math.max(w * sx, 1e-4), Math.max(h * sy, 1e-4), Math.max(d * sz, 1e-4));

    // Diff glow: edited parts light up in the accent colour, removed ones in red, then settle.
    const mtl = mat.current;
    if (!mtl) return;
    const g = leaving ? 1 : anim.kind === "new" || anim.kind === "changed" ? 1 - clamp01((age - PART_DUR * 0.5) / GLOW_DUR) : 0;
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
    <mesh ref={ref} geometry={UNIT_BOX} visible={false} castShadow={!blue && !part.context && !leaving} receiveShadow>
      {blue ? (
        <meshBasicMaterial ref={mat as React.RefObject<THREE.MeshBasicMaterial>} color={baseColor} transparent opacity={baseOpacity} depthWrite={false} />
      ) : (
        <meshStandardMaterial
          ref={mat as React.RefObject<THREE.MeshStandardMaterial>}
          color={baseColor}
          roughness={0.82}
          metalness={0.02}
          transparent={baseOpacity < 1 || dimmed || leaving}
          opacity={baseOpacity}
        />
      )}
      {(blue || highlighted) && (
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
        return { key: zoneKey(zone), x, z, h: 0.05 + rnd() * 0.07, r: rnd() * Math.PI, lean: (rnd() - 0.5) * 0.4, wave: ((x - minX) / spanX) * 1.6 + rnd() * 0.3 };
      });
    });
  }, [grass]);
  // Zones that were already grown keep their grass through an edit; new zones sprout.
  const grown = useRef({ epoch: -1, starts: new Map<string, number>(), explode: 0 });
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const settled = useRef(0);
  useEffect(() => {
    settled.current = 0;
  }, [data]);
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
      tmp.position.set(b.x, 0.02 + (b.h * s) / 2 + shared.explode.current * 2 * EXPLODE_GAP, b.z);
      tmp.rotation.set(b.lean, b.r, 0);
      tmp.scale.set(1, s, 1);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    settled.current = allDone ? settled.current + 1 : 0;
  });
  const blue = mode !== "real";
  return (
    <instancedMesh key={data.length} ref={ref} args={[undefined, undefined, data.length]} frustumCulled={false}>
      <boxGeometry args={[0.012, 1, 0.012]} />
      {/* height is applied through instance scale → geometry is unit-tall */}
      <meshStandardMaterial color={blue ? "#9fd3a0" : "#5fa04a"} roughness={0.9} />
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

function DimLines({ build, mode }: { build: Build; mode: ViewMode }) {
  const color = mode === "real" ? "#141311" : "#e6efff";
  return (
    <group>
      {build.dims.map((dl, i) => {
        const dir = new THREE.Vector3(...dl.to).sub(new THREE.Vector3(...dl.from)).normalize();
        const perp = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(0.08, 0, 0) : new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(0.08);
        const a = new THREE.Vector3(...dl.from);
        const b = new THREE.Vector3(...dl.to);
        return (
          <group key={i}>
            <Line points={[dl.from, dl.to]} color={color} lineWidth={1.2} transparent opacity={0.9} />
            <Line points={[a.clone().add(perp).toArray(), a.clone().sub(perp).toArray()]} color={color} lineWidth={1.2} />
            <Line points={[b.clone().add(perp).toArray(), b.clone().sub(perp).toArray()]} color={color} lineWidth={1.2} />
          </group>
        );
      })}
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

function CameraRig({ build, compact, epoch }: { build: Build; compact: boolean; epoch: number }) {
  const { camera, controls, size } = useThree() as unknown as {
    camera: THREE.PerspectiveCamera;
    controls: { target: THREE.Vector3; update: () => void } | null;
    size: { width: number; height: number };
  };
  const framed = useRef<{ epoch: number; w: number; h: number; compact: boolean } | null>(null);
  /** After an edit the camera eases to the new framing instead of jumping (and keeps the user's angle). */
  const glide = useRef<{ dist: number; target: THREE.Vector3 } | null>(null);

  useLayoutEffect(() => {
    const [L, H, W] = build.extent;
    // Fit the bounding sphere into both the vertical and the horizontal field of view.
    const radius = 0.5 * Math.sqrt(L * L + H * H + W * W) + 0.4;
    const aspect = size.width / Math.max(1, size.height);
    const vfov = (camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const dist = (radius / Math.sin(Math.min(vfov, hfov) / 2)) * (compact ? 1.05 : 0.95);
    const target = new THREE.Vector3(0, H * 0.25, 0);
    camera.near = 0.05;
    camera.far = Math.max(400, dist * 4);
    const f = framed.current;
    const edit = f && f.epoch === epoch && f.w === size.width && f.h === size.height && f.compact === compact;
    framed.current = { epoch, w: size.width, h: size.height, compact };
    if (edit && controls) {
      glide.current = { dist, target };
      camera.updateProjectionMatrix();
      return;
    }
    glide.current = null;
    const dir = new THREE.Vector3(0.9, 0.75, 1).normalize();
    camera.position.copy(dir.multiplyScalar(dist)).add(target);
    // On the board the title block sits top-left: shift the projection (not the orbit pivot)
    // so the model renders lower-right and still spins around its own centre.
    if (compact) camera.clearViewOffset();
    else camera.setViewOffset(size.width, size.height, -size.width * 0.09, -size.height * 0.07, size.width, size.height);
    camera.updateProjectionMatrix();
    if (controls) {
      controls.target.copy(target);
      controls.update();
    }
  }, [build, camera, controls, compact, epoch, size.width, size.height]);

  const off = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, delta) => {
    const g = glide.current;
    if (!g || !controls) return;
    const k = Math.min(1, delta * 2.6);
    controls.target.lerp(g.target, k);
    off.copy(camera.position).sub(controls.target);
    const cur = off.length();
    const next = cur + (g.dist - cur) * k;
    camera.position.copy(controls.target).add(off.setLength(next));
    if (Math.abs(next - g.dist) < 0.01 && controls.target.distanceTo(g.target) < 0.005) glide.current = null;
  });
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
}

export default function Scene({ build, mode, highlightLayer, autoRotate = true, replayKey, accent = "#ff5b1f", compact = false, interactive = true, onDiff }: SceneProps) {
  const clock = useRef(0);
  const explode = useRef(0);
  const reduced = typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const shared = useMemo(() => ({ clock, explode, reduced, offset: new THREE.Vector3() }), [reduced]);

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

  return (
    <div className="relative h-full w-full">
    <Canvas
      dpr={[1, 2]}
      camera={{ fov: 32, position: [6, 5, 6] }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      shadows={mode === "real"}
      style={{ touchAction: interactive ? "none" : "auto" }}
    >
      <Driver shared={shared} mode={mode} />
      <ambientLight intensity={mode === "real" ? 0.75 : 1} />
      <directionalLight position={[6, 10, 4]} intensity={mode === "real" ? 1.6 : 0.4} castShadow shadow-mapSize={[2048, 2048]}>
        <orthographicCamera attach="shadow-camera" args={[-12, 12, 12, -12, 0.1, 50]} />
      </directionalLight>
      <hemisphereLight args={["#fff6e8", "#8a7a66", mode === "real" ? 0.5 : 0.2]} />

      <World build={build} epoch={current.epoch} shared={shared}>
      {build.parts.map((p) => (
        <PartMesh
          key={`${current.epoch}:${p.id}`}
          part={p}
          anim={current.anims.get(p.id) ?? noAnim}
          mode={mode}
          highlighted={Boolean(highlightLayer) && p.layer === highlightLayer}
          dimmed={Boolean(highlightLayer) && p.layer !== highlightLayer && !p.context}
          layerIndex={layerIndex.get(p.layer) ?? 0}
          shared={shared}
          accent={accent}
        />
      ))}
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
        />
      ))}
      {build.grass && <Grass grass={build.grass} shared={shared} mode={mode} epoch={current.epoch} />}
      <DimLines build={build} mode={mode} />
      </World>
      <LabelProjector labels={labels} els={labelEls} shared={shared} />

      {mode === "real" && <ContactShadows position={[0, -0.001, 0]} scale={shadowSize} opacity={0.35} blur={2.4} far={4} />}
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
      />
      <CameraRig build={build} compact={compact} epoch={current.epoch} />
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
