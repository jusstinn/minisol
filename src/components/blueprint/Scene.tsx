"use client";

import { ContactShadows, Edges, Html, Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Build, Part } from "./builders";

export type ViewMode = "blueprint" | "real" | "exploded";

const PART_DUR = 0.55;
const EXPLODE_GAP = 0.55;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

interface Shared {
  clock: React.RefObject<number>;
  explode: React.RefObject<number>;
}

function Driver({ shared, mode, reduced }: { shared: Shared; mode: ViewMode; reduced: boolean }) {
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    shared.clock.current = reduced ? 999 : shared.clock.current + dt;
    const target = mode === "exploded" ? 1 : 0;
    shared.explode.current += (target - shared.explode.current) * Math.min(1, dt * 5);
  });
  return null;
}

function PartMesh({
  part,
  mode,
  highlighted,
  dimmed,
  layerIndex,
  shared,
  accent,
}: {
  part: Part;
  mode: ViewMode;
  highlighted: boolean;
  dimmed: boolean;
  layerIndex: number;
  shared: Shared;
  accent: string;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const [w, h, d] = part.size;
  const slideAxis = w >= d ? "x" : "z";

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = clamp01((shared.clock.current - part.delay) / PART_DUR);
    mesh.visible = t > 0.001;
    if (!mesh.visible) return;
    const e = easeOutCubic(t);
    let [x, y, z] = part.pos;
    let sx = 1,
      sy = 1,
      sz = 1;
    switch (part.grow) {
      case "drop":
        y += (1 - e) * 0.9;
        break;
      case "rise": {
        sy = Math.max(e, 0.001);
        y = part.pos[1] - h / 2 + (h * sy) / 2;
        break;
      }
      case "pop": {
        const s = Math.max(easeOutBack(t), 0.001);
        sx = sy = sz = s;
        break;
      }
      case "slide": {
        if (slideAxis === "x") {
          sx = Math.max(e, 0.001);
          x = part.pos[0] - w / 2 + (w * sx) / 2;
        } else {
          sz = Math.max(e, 0.001);
          z = part.pos[2] - d / 2 + (d * sz) / 2;
        }
        break;
      }
      case "fade":
        sx = sz = 0.96 + 0.04 * e;
        break;
    }
    if (!part.context) y += shared.explode.current * (layerIndex + 1) * EXPLODE_GAP;
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
  });

  const blue = mode !== "real";
  const baseOpacity = part.opacity ?? 1;
  return (
    <mesh ref={ref} visible={false} castShadow={!blue && !part.context} receiveShadow>
      <boxGeometry args={[w, h, d]} />
      {blue ? (
        <meshBasicMaterial
          color={highlighted ? accent : part.context ? "#3b6fd8" : "#2e63d0"}
          transparent
          opacity={highlighted ? 0.55 : part.context ? 0.05 : dimmed ? 0.06 : 0.2}
          depthWrite={false}
        />
      ) : (
        <meshStandardMaterial
          color={highlighted ? accent : part.color}
          roughness={0.82}
          metalness={0.02}
          transparent={baseOpacity < 1 || dimmed}
          opacity={dimmed ? 0.25 : baseOpacity}
          emissive={highlighted ? accent : "#000000"}
          emissiveIntensity={highlighted ? 0.35 : 0}
        />
      )}
      {(blue || highlighted) && (
        <Edges
          threshold={20}
          color={highlighted ? accent : part.context ? "#7fa6ec" : "#dce9ff"}
          transparent
          opacity={part.context ? 0.35 : dimmed ? 0.25 : 0.95}
        />
      )}
    </mesh>
  );
}

function Grass({ grass, shared, mode }: { grass: NonNullable<Build["grass"]>; shared: Shared; mode: ViewMode }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const data = useMemo(() => {
    const rnd = mulberry32(42);
    return Array.from({ length: grass.count }, () => {
      const x = (rnd() - 0.5) * grass.w;
      const z = (rnd() - 0.5) * grass.d;
      return { x, z, h: 0.05 + rnd() * 0.07, r: rnd() * Math.PI, lean: (rnd() - 0.5) * 0.4, wave: (x / grass.w + 0.5) * 1.6 + rnd() * 0.3 };
    });
  }, [grass]);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const done = useRef(false);
  useEffect(() => {
    done.current = false;
  }, [grass]);
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh || done.current) return;
    let allDone = true;
    for (let i = 0; i < data.length; i++) {
      const b = data[i];
      const t = clamp01((shared.clock.current - grass.delay - b.wave) / 0.7);
      if (t < 1) allDone = false;
      const s = Math.max(easeOutCubic(t), 0.0001);
      tmp.position.set(b.x, 0.02 + (b.h * s) / 2 + shared.explode.current * 2 * EXPLODE_GAP, b.z);
      tmp.rotation.set(b.lean, b.r, 0);
      tmp.scale.set(1, s, 1);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (allDone && shared.clock.current > 20) done.current = true;
  });
  const blue = mode !== "real";
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, data.length]} frustumCulled={false}>
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

function Dims({ build, mode, shared }: { build: Build; mode: ViewMode; shared: Shared }) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    if (group.current) {
      const t = clamp01((shared.clock.current - 0.2) / 0.8);
      group.current.visible = t > 0;
    }
  });
  const color = mode === "real" ? "#141311" : "#e6efff";
  return (
    <group ref={group}>
      {build.dims.map((dl, i) => {
        const dir = new THREE.Vector3(...dl.to).sub(new THREE.Vector3(...dl.from)).normalize();
        const perp = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(0.08, 0, 0) : new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(0.08);
        const a = new THREE.Vector3(...dl.from);
        const b = new THREE.Vector3(...dl.to);
        const mid = a.clone().add(b).multiplyScalar(0.5);
        return (
          <group key={i}>
            <Line points={[dl.from, dl.to]} color={color} lineWidth={1.2} transparent opacity={0.9} />
            <Line points={[a.clone().add(perp).toArray(), a.clone().sub(perp).toArray()]} color={color} lineWidth={1.2} />
            <Line points={[b.clone().add(perp).toArray(), b.clone().sub(perp).toArray()]} color={color} lineWidth={1.2} />
            <Html position={mid.toArray()} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
              <div
                className={`whitespace-nowrap rounded-[4px] px-1.5 py-0.5 font-mono text-[10.5px] font-medium tracking-wide ${
                  mode === "real" ? "bg-ink text-paper" : "bg-[#0a1f47]/85 text-[#e6efff] ring-1 ring-[#dce9ff]/40"
                }`}
              >
                {dl.label}
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

function LayerLabels({ build, shared }: { build: Build; shared: Shared }) {
  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame(() => {
    const e = shared.explode.current;
    refs.current.forEach((g, i) => {
      if (!g) return;
      g.visible = e > 0.15;
      g.position.y = (i + 1) * EXPLODE_GAP * e + 0.05;
    });
  });
  const x = build.extent[0] / 2 + 0.35;
  return (
    <>
      {build.layers.map((l, i) => (
        <group key={l.id} ref={(g) => { refs.current[i] = g; }} position={[x, 0, 0]}>
          <Html zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
            <div className="flex items-center gap-1.5 whitespace-nowrap font-mono text-[10px] uppercase tracking-wider text-[#e6efff]">
              <span className="h-px w-5 bg-[#e6efff]/70" />
              <span className="rounded-sm bg-[#0a1f47]/80 px-1 py-px">{String(i + 1).padStart(2, "0")} {l.label}</span>
            </div>
          </Html>
        </group>
      ))}
    </>
  );
}

function CameraRig({ build, compact }: { build: Build; compact: boolean }) {
  const { camera, controls } = useThree() as unknown as { camera: THREE.PerspectiveCamera; controls: { target: THREE.Vector3; update: () => void } | null };
  useLayoutEffect(() => {
    const [L, H, W] = build.extent;
    const r = Math.max(L, W, H * 1.3, 2.2);
    const k = compact ? 1.25 : 1.05;
    camera.position.set(r * 0.95 * k, (r * 0.62 + H * 0.35) * k, r * 1.05 * k);
    camera.near = 0.05;
    camera.far = 400;
    camera.updateProjectionMatrix();
    if (controls) {
      controls.target.set(0, H * 0.28, 0);
      controls.update();
    }
  }, [build, camera, controls, compact]);
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
}

export default function Scene({ build, mode, highlightLayer, autoRotate = true, replayKey, accent = "#ff5b1f", compact = false, interactive = true }: SceneProps) {
  const clock = useRef(0);
  const explode = useRef(0);
  const shared = useMemo(() => ({ clock, explode }), []);
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    clock.current = 0;
  }, [build, replayKey]);

  const layerIndex = useMemo(() => new Map(build.layers.map((l, i) => [l.id, i])), [build]);
  const shadowSize = Math.max(build.extent[0], build.extent[2]) * 1.6 + 2;

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ fov: 32, position: [6, 5, 6] }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      shadows={mode === "real"}
      style={{ touchAction: interactive ? "none" : "auto" }}
    >
      <Driver shared={shared} mode={mode} reduced={Boolean(reduced)} />
      <ambientLight intensity={mode === "real" ? 0.75 : 1} />
      <directionalLight position={[6, 10, 4]} intensity={mode === "real" ? 1.6 : 0.4} castShadow shadow-mapSize={[2048, 2048]}>
        <orthographicCamera attach="shadow-camera" args={[-12, 12, 12, -12, 0.1, 50]} />
      </directionalLight>
      <hemisphereLight args={["#fff6e8", "#8a7a66", mode === "real" ? 0.5 : 0.2]} />

      {build.parts.map((p) => (
        <PartMesh
          key={p.id}
          part={p}
          mode={mode}
          highlighted={Boolean(highlightLayer) && p.layer === highlightLayer}
          dimmed={Boolean(highlightLayer) && p.layer !== highlightLayer && !p.context}
          layerIndex={layerIndex.get(p.layer) ?? 0}
          shared={shared}
          accent={accent}
        />
      ))}
      {build.grass && <Grass grass={build.grass} shared={shared} mode={mode} />}
      <Dims build={build} mode={mode} shared={shared} />
      <LayerLabels build={build} shared={shared} />

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
      <CameraRig build={build} compact={compact} />
    </Canvas>
  );
}
