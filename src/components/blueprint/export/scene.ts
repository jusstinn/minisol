import * as THREE from "three";
import type { Build, Vec3 } from "../builders";
import { finishTextures } from "../textures";
import { bakeFinish } from "./bake";
import { bladeGeometry, deckScrewPoints, grassBlades, screwGeometry } from "./decor";
import { mergeAll, partGeometry } from "./geometry";
import { groupByMaterial } from "./grouping";
import type { MaterialSpec } from "./grouping";
import { exportOrigin, placeParts } from "./placement";
import type { ExportOptions, PlacedPart } from "./placement";

/**
 * The exportable model: a plain THREE scene graph built from a `Build` alone — not from the live
 * renderer, so it needs no Scene.tsx, no WebGL and no mounted canvas. Metres, y up, origin at the
 * project's centre on the ground (see placement.ts).
 *
 * One mesh per material (parts of the same finish, colour and opacity merged), PBR materials from
 * the REAL view's own `finishTextures` with each procedural canvas baked into a power-of-two image
 * (see bake.ts), real-size detail geometry (see geometry.ts), and the deck screws and lawn blades
 * written out as triangles (see decor.ts).
 */

export type ExportFormat = "glb" | "usdz";

export interface SceneOptions extends ExportOptions {
  /** The target file format (decides caps and what the format can't express, e.g. double-sided). */
  format?: ExportFormat;
  /** Largest edge of a baked texture, px (power of two; default 256). */
  maxTextureSize?: number;
  /** Lawn blades kept at most (USDZ is a text format, so it gets fewer by default). */
  maxBlades?: number;
  /** Deck screw heads kept at most. */
  maxScrews?: number;
}

export interface ModelStats {
  /** Parts of the build that went in. */
  parts: number;
  meshes: number;
  materials: number;
  textures: number;
  vertices: number;
  triangles: number;
  /** Bounds of the whole model (null when empty). */
  bounds: { min: Vec3; max: Vec3 } | null;
}

export interface ExportModel {
  root: THREE.Group;
  stats: ModelStats;
}

const DEFAULTS = {
  glb: { maxBlades: 3500, maxScrews: 1600 },
  usdz: { maxBlades: 1200, maxScrews: 600 },
};

/** Plain colour for parts with no procedural finish — the REAL view's own numbers. */
const FLAT = { roughness: 0.82, metalness: 0.02 };
const SCREW_COLOR = "#2b2b2b";
const GRASS_COLOR = "#5fa04a";

function finishMaterial(spec: MaterialSpec, sample: PlacedPart, maxTexture: number): THREE.MeshStandardMaterial {
  const common = { name: spec.kind ? `${spec.kind} ${spec.color}` : `paint ${spec.color}`, color: new THREE.Color(spec.color), transparent: spec.opacity < 1, opacity: spec.opacity };
  const finish = sample.part.finish;
  if (!spec.kind || !finish) return new THREE.MeshStandardMaterial({ ...common, ...FLAT });
  const set = finishTextures(finish, sample.size);
  const baked = bakeFinish(set, maxTexture);
  const pbr = {
    ...common,
    roughness: set.roughness,
    metalness: set.metalness,
    map: baked.map,
    roughnessMap: baked.metalRough,
    metalnessMap: baked.metalRough,
    normalMap: baked.normal,
    // glTF-style maps (see bake.ts): the green channel runs the other way for geometry without tangents.
    normalScale: new THREE.Vector2(1, -1),
  };
  // Glazed ceramic keeps its lacquer layer (KHR_materials_clearcoat in glTF, clearcoat in USD).
  return set.clearcoat ? new THREE.MeshPhysicalMaterial({ ...pbr, clearcoat: set.clearcoat, clearcoatRoughness: set.clearcoatRoughness ?? 0 }) : new THREE.MeshStandardMaterial(pbr);
}

function repeatOf(p: PlacedPart): [number, number] | undefined {
  if (!p.part.finish) return undefined;
  const { repeat } = finishTextures(p.part.finish, p.size).map;
  return [repeat.x, repeat.y];
}

function meshOf(geometry: THREE.BufferGeometry, material: THREE.Material, name: string, layers?: string[]): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  if (layers?.length) mesh.userData = { layers };
  return mesh;
}

export function buildExportScene(build: Build, opts: SceneOptions = {}): ExportModel {
  const format = opts.format ?? "glb";
  const maxTexture = opts.maxTextureSize ?? 256;
  const caps = { ...DEFAULTS[format], ...(opts.maxBlades !== undefined ? { maxBlades: opts.maxBlades } : {}), ...(opts.maxScrews !== undefined ? { maxScrews: opts.maxScrews } : {}) };
  const origin = exportOrigin(build);

  const root = new THREE.Group();
  root.name = "Blueprint";
  root.userData = { generator: "Blueprint", units: "metre", note: "Indicative model, not a technical drawing" };

  const placed = placeParts(build, opts);
  const opaque: THREE.Mesh[] = [];
  const clear: THREE.Mesh[] = [];

  for (const group of groupByMaterial(placed)) {
    const geometry = mergeAll(group.parts.map((p) => partGeometry(p, repeatOf(p))));
    if (!geometry) continue;
    const material = finishMaterial(group.spec, group.parts[0], maxTexture);
    const layers = [...new Set(group.parts.map((p) => p.part.layer))];
    (group.spec.opacity < 1 ? clear : opaque).push(meshOf(geometry, material, material.name, layers));
  }

  // The extras follow the parts: a build with nothing to show has no screws or blades either.
  const decorate = placed.length > 0;

  // Deck screw heads.
  const screws = decorate ? screwGeometry(deckScrewPoints(placed.map((p) => p.part), origin, caps.maxScrews)) : null;
  if (screws) opaque.push(meshOf(screws, new THREE.MeshStandardMaterial({ name: "screws", color: SCREW_COLOR, roughness: 0.4, metalness: 0.6 }), "screws", ["deck_board"]));

  // Lawn blades, in three shades of green so a lawn isn't one flat tint.
  if (decorate && build.grass) {
    const blades = grassBlades(build.grass, origin, caps.maxBlades);
    const colors = format === "glb";
    const shades = [-0.12, 0, 0.12].map((l) => new THREE.Color(GRASS_COLOR).offsetHSL(0, 0, l));
    shades.forEach((shade, k) => {
      const mine = blades.filter((b) => (b.tone < -0.33 ? 0 : b.tone > 0.33 ? 2 : 1) === k);
      const geometry = bladeGeometry(mine, { backfaces: format === "usdz", colors });
      if (!geometry) return;
      // Vertex colours darken the base of each blade (glTF only: USD's preview surface ignores them),
      // so the material is a touch lighter to make up for it.
      const tint = colors ? shade.clone().multiplyScalar(1.15) : shade.clone().multiplyScalar(0.9);
      const material = new THREE.MeshStandardMaterial({ name: `grass ${k}`, color: tint, roughness: 0.9, metalness: 0, vertexColors: colors, side: format === "glb" ? THREE.DoubleSide : THREE.FrontSide });
      opaque.push(meshOf(geometry, material, `grass blades ${k}`, ["grass_seed"]));
    });
  }

  for (const m of [...opaque, ...clear]) root.add(m);
  return { root, stats: statsOf(root, placed) };
}

export function statsOf(root: THREE.Object3D, placed: readonly PlacedPart[]): ModelStats {
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  let meshes = 0;
  let vertices = 0;
  let triangles = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    meshes++;
    const g = mesh.geometry;
    vertices += g.getAttribute("position").count;
    triangles += (g.index ? g.index.count : g.getAttribute("position").count) / 3;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    materials.add(mat);
    for (const t of [mat.map, mat.roughnessMap, mat.metalnessMap, mat.normalMap]) if (t) textures.add(t);
  });
  const box = new THREE.Box3().setFromObject(root);
  const bounds = box.isEmpty() ? null : { min: box.min.toArray() as Vec3, max: box.max.toArray() as Vec3 };
  return { parts: placed.length, meshes, materials: materials.size, textures: textures.size, vertices, triangles, bounds };
}

/** Free the geometry (textures are shared per finish and cached, so they stay). */
export function disposeModel(model: ExportModel): void {
  model.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  });
}
