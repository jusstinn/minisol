"use client";
/* The scene, renderer and cube-map rig are three.js objects owned by the canvas: they are mutated imperatively by design. */
/* eslint-disable react-hooks/immutability */

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { skyKey } from "./daylight";
import type { Daylight } from "./daylight";

/**
 * The REAL view's image-based light on desktop: a procedural Preetham sky (three's own `Sky`
 * shader — no HDRI, nothing fetched, CSP-safe and offline) plus a lawn-green "ground bounce"
 * hemisphere, rendered once into a small HalfFloat cube map and prefiltered (PMREM) into
 * `scene.environment`. Indoor rooms swap the sky for a soft window-light box instead: a bright
 * window on the north wall and a smaller one on the west wall, warm bounce from the floor, a
 * pale ceiling.
 *
 * It is *not* redrawn per frame: the image only depends on the sun's altitude/azimuth (quantised
 * to half a degree, see `skyKey`) and whether the scene is indoors, so it re-renders when that
 * key changes — throttled to ~12 Hz so a scrubbing sun simulation stays smooth — and never
 * otherwise. The sun disc itself is left out of the image (the directional light *is* the sun;
 * having both would count it twice).
 */

const CUBE_SIZE = 128;
const MIN_GAP_MS = 80;
/** Overall gain of the image against `Daylight.envIntensity` — tuned against the sun's own intensity. */
const ENV_GAIN = 0.42;

interface Rig {
  scene: THREE.Scene;
  sky: Sky;
  ground: THREE.Mesh;
  room: THREE.Group;
  windowMats: THREE.MeshBasicMaterial[];
  cube: THREE.WebGLCubeRenderTarget;
  camera: THREE.CubeCamera;
  pmrem: THREE.PMREMGenerator;
  target: THREE.WebGLRenderTarget | null;
  dispose: () => void;
}

const basic = (r: number, g: number, b: number, side: THREE.Side = THREE.FrontSide) => {
  const m = new THREE.MeshBasicMaterial({ side, toneMapped: false, fog: false });
  m.color.setRGB(r, g, b, THREE.LinearSRGBColorSpace);
  return m;
};

function createRig(gl: THREE.WebGLRenderer): Rig {
  const scene = new THREE.Scene();

  const sky = new Sky();
  sky.scale.setScalar(900);
  const su = sky.material.uniforms;
  su.cloudCoverage.value = 0;
  su.showSunDisc.value = 0;
  // The raw Preetham sky is a deep, very saturated blue (blue channel ~3 against red ~0.4): as an
  // ambient light it would paint every shadow cyan. Pull it toward its luminance — still a
  // bluish sky, the way a real shadow is, not a swimming pool.
  sky.material.fragmentShader = sky.material.fragmentShader.replace(
    "gl_FragColor = vec4( texColor, 1.0 );",
    "float skyLum = dot( texColor, vec3( 0.2126, 0.7152, 0.0722 ) ); texColor = mix( vec3( skyLum ), texColor, 0.55 ); gl_FragColor = vec4( texColor, 1.0 );",
  );
  scene.add(sky);

  const groundMat = basic(0.1, 0.14, 0.07, THREE.BackSide);
  const ground = new THREE.Mesh(new THREE.SphereGeometry(430, 24, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), groundMat);
  scene.add(ground);

  // Indoors: a 14 × 6 × 14 m box seen from inside. Face order: +x, -x, +y, -y, +z, -z.
  const room = new THREE.Group();
  const wall = (v: number) => basic(v, v * 0.97, v * 0.9, THREE.BackSide);
  const shellMats = [wall(0.34), wall(0.32), wall(0.55), basic(0.26, 0.2, 0.15, THREE.BackSide), wall(0.3), wall(0.3)];
  room.add(new THREE.Mesh(new THREE.BoxGeometry(14, 6, 14), shellMats));
  // The windows: bright, slightly blue-white emitters in front of the wall (HDR: well above 1).
  const win1 = basic(5.2, 5.3, 5.5, THREE.DoubleSide);
  const winBack = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.6), win1);
  winBack.position.set(0.5, 0.8, -6.9);
  const win2 = basic(3.2, 3.25, 3.4, THREE.DoubleSide);
  const winSide = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 3), win2);
  winSide.rotation.y = Math.PI / 2;
  winSide.position.set(-6.9, 0.9, 1.5);
  room.add(winBack, winSide);
  scene.add(room);

  const cube = new THREE.WebGLCubeRenderTarget(CUBE_SIZE, { type: THREE.HalfFloatType, generateMipmaps: false });
  const camera = new THREE.CubeCamera(0.1, 2000, cube);
  scene.add(camera);
  const pmrem = new THREE.PMREMGenerator(gl);

  const rig: Rig = {
    scene,
    sky,
    ground,
    room,
    windowMats: [win1, win2],
    cube,
    camera,
    pmrem,
    target: null,
    dispose: () => {
      rig.target?.dispose();
      cube.dispose();
      pmrem.dispose();
      sky.geometry.dispose();
      sky.material.dispose();
      ground.geometry.dispose();
      groundMat.dispose();
      room.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        }
      });
    },
  };
  return rig;
}

function render(rig: Rig, gl: THREE.WebGLRenderer, d: Daylight, interior: boolean) {
  rig.sky.visible = !interior;
  rig.ground.visible = !interior;
  rig.room.visible = interior;
  if (interior) {
    // Window brightness follows the day: bright at noon, a dim blue glow at night.
    const k = 0.12 + 0.88 * d.day;
    rig.windowMats[0].color.setRGB(5.2 * k, 5.3 * k, 5.5 * k * (1 + (1 - d.day) * 0.4), THREE.LinearSRGBColorSpace);
    rig.windowMats[1].color.setRGB(3.2 * k, 3.25 * k, 3.4 * k, THREE.LinearSRGBColorSpace);
  } else {
    const u = rig.sky.material.uniforms;
    u.sunPosition.value.set(d.sunDir[0], d.sunDir[1], d.sunDir[2]);
    u.turbidity.value = d.sky.turbidity;
    u.rayleigh.value = d.sky.rayleigh;
    u.mieCoefficient.value = d.sky.mieCoefficient;
    u.mieDirectionalG.value = d.sky.mieDirectionalG;
    // `groundBounce` is the radiance the lawn should return; the scene multiplies the whole image by ENV_GAIN.
    (rig.ground.material as THREE.MeshBasicMaterial).color.setRGB(d.groundBounce[0] / ENV_GAIN, d.groundBounce[1] / ENV_GAIN, d.groundBounce[2] / ENV_GAIN, THREE.LinearSRGBColorSpace);
  }
  rig.camera.update(gl, rig.scene);
  rig.target = rig.pmrem.fromCubemap(rig.cube.texture, rig.target);
}

/**
 * Mount inside the Canvas (desktop only; see Lighting.tsx). Sets `scene.environment` and
 * `scene.environmentIntensity`, and clears them again on unmount.
 */
export default function SkyEnvironment({ daylight, interior }: { daylight: Daylight; interior: boolean }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const rigRef = useRef<Rig | null>(null);
  const rendered = useRef<string | null>(null);
  const lastAt = useRef(0);
  const want = useRef({ daylight, interior });

  // The latest request, readable from the frame loop (a ref write belongs in an effect, not render).
  useLayoutEffect(() => {
    want.current = { daylight, interior };
  });

  // One rig per renderer; the first image is made right away so the first lit frame is already right.
  useLayoutEffect(() => {
    const rig = createRig(gl);
    rigRef.current = rig;
    const w = want.current;
    render(rig, gl, w.daylight, w.interior);
    rendered.current = skyKey(w.daylight, w.interior);
    lastAt.current = performance.now();
    scene.environment = rig.target?.texture ?? null;
    return () => {
      if (scene.environment === rig.target?.texture) scene.environment = null;
      rig.dispose();
      rigRef.current = null;
      rendered.current = null;
    };
  }, [gl, scene]);

  // Intensity is a plain scene property: cheap, follows every change immediately.
  useLayoutEffect(() => {
    scene.environmentIntensity = daylight.envIntensity * ENV_GAIN;
  }, [scene, daylight.envIntensity]);
  useEffect(
    () => () => {
      scene.environmentIntensity = 1;
    },
    [scene],
  );

  useFrame(() => {
    const rig = rigRef.current;
    if (!rig) return;
    const w = want.current;
    const k = skyKey(w.daylight, w.interior);
    if (k === rendered.current) return;
    const now = performance.now();
    if (now - lastAt.current < MIN_GAP_MS) return;
    lastAt.current = now;
    rendered.current = k;
    render(rig, gl, w.daylight, w.interior);
    scene.environment = rig.target?.texture ?? null;
  });
  return null;
}
