"use client";

import * as THREE from "three";
import { checkGltf, checkTriangles, describeError, estimateObjTriangles, readGltfJson } from "./files";
import type { Checked, ModelFormat } from "./files";

/**
 * Parse the customer's model in the browser with three.js' own loaders (nothing is uploaded).
 * External resources were refused before we get here; on top of that the loading manager
 * rewrites any URL that isn't data:/blob: to an empty data URL, so parsing can never
 * reach the network. Lights and cameras in the file are dropped (the sketch has its own).
 */

export interface LoadedModel {
  root: THREE.Object3D;
  triangles: number;
  meshes: number;
  /** Bounding box in file units. */
  min: [number, number, number];
  max: [number, number, number];
}

export const modelSize = (m: Pick<LoadedModel, "min" | "max">): [number, number, number] => [m.max[0] - m.min[0], m.max[1] - m.min[1], m.max[2] - m.min[2]];

function localOnly(): THREE.LoadingManager {
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => (/^(data|blob):/i.test(url.trim()) ? url : "data:,"));
  return manager;
}

export function countTriangles(root: THREE.Object3D): { triangles: number; meshes: number } {
  let triangles = 0;
  let meshes = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    meshes++;
    const g = mesh.geometry;
    const n = g.index ? g.index.count : (g.getAttribute("position")?.count ?? 0);
    const copies = (mesh as unknown as THREE.InstancedMesh).isInstancedMesh ? (mesh as unknown as THREE.InstancedMesh).count : 1;
    triangles += Math.floor(n / 3) * copies;
  });
  return { triangles, meshes };
}

export function disposeObject(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose?.();
    // The file's own materials (UserModel keeps them in userData while the blueprint look is on).
    const own = (mesh.userData?.__own as { material?: THREE.Material | THREE.Material[] } | undefined)?.material ?? mesh.material;
    const mats = Array.isArray(own) ? own : own ? [own] : [];
    for (const m of mats) {
      for (const v of Object.values(m)) if (v && (v as THREE.Texture).isTexture) (v as THREE.Texture).dispose();
      m.dispose();
    }
  });
}

async function parseGltf(data: ArrayBuffer, format: "glb" | "gltf", name: string): Promise<Checked<THREE.Object3D>> {
  const json = readGltfJson(data, format);
  if (!json.ok) return json;
  const checked = checkGltf(json.value, name);
  if (!checked.ok) return checked;
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const loader = new GLTFLoader(localOnly());
  if ((json.value.extensionsUsed ?? []).includes("EXT_meshopt_compression")) {
    const { MeshoptDecoder } = await import("three/examples/jsm/libs/meshopt_decoder.module.js");
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  const gltf = await loader.parseAsync(data, "");
  return { ok: true, value: gltf.scene ?? gltf.scenes?.[0] ?? new THREE.Group() };
}

async function parseObj(data: ArrayBuffer): Promise<Checked<THREE.Object3D>> {
  const text = new TextDecoder().decode(data);
  const est = checkTriangles(estimateObjTriangles(text));
  if (!est.ok) return est;
  const { OBJLoader } = await import("three/examples/jsm/loaders/OBJLoader.js");
  // mtllib lines are only recorded, never fetched: the model gets plain materials.
  return { ok: true, value: new OBJLoader().parse(text) };
}

export async function parseModel(data: ArrayBuffer, format: ModelFormat, name: string): Promise<Checked<LoadedModel>> {
  let root: THREE.Object3D;
  try {
    const r = format === "obj" ? await parseObj(data) : await parseGltf(data, format, name);
    if (!r.ok) return r;
    root = r.value;
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }

  const drop: THREE.Object3D[] = [];
  root.traverse((o) => {
    if ((o as THREE.Light).isLight || (o as THREE.Camera).isCamera) drop.push(o);
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  drop.forEach((o) => o.removeFromParent());

  const { triangles, meshes } = countTriangles(root);
  const tooMany = checkTriangles(triangles);
  if (!tooMany.ok) {
    disposeObject(root);
    return tooMany;
  }
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const finite = [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].every(Number.isFinite);
  if (!meshes || box.isEmpty() || !finite) {
    disposeObject(root);
    return { ok: false, error: { ro: "Modelul nu conține nicio suprafață de afișat.", en: "The model has no surfaces to show." } };
  }
  return { ok: true, value: { root, triangles, meshes, min: box.min.toArray(), max: box.max.toArray() } };
}

const edgeCache = new WeakMap<THREE.Object3D, THREE.BufferGeometry | null>();

/**
 * All the model's feature edges merged into ONE line geometry (in the root's space) — a light
 * "blueprint" outline in a single draw call, however many meshes the file has. Skipped
 * (null) above `budget` triangles; the translucent fill alone is shown then.
 */
export function mergedEdges(root: THREE.Object3D, triangles: number, budget: number): THREE.BufferGeometry | null {
  if (triangles > budget) return null;
  if (edgeCache.has(root)) return edgeCache.get(root) ?? null;
  const parts: Float32Array[] = [];
  let total = 0;
  // In the root's own space (the lines are drawn as a child of the root), wherever it is placed.
  root.updateWorldMatrix(true, true);
  const inv = root.matrixWorld.clone().invert();
  const rel = new THREE.Matrix4();
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.getAttribute("position")) return;
    const eg = new THREE.EdgesGeometry(mesh.geometry, 25);
    const pos = eg.getAttribute("position");
    const out = new Float32Array(pos.count * 3);
    rel.multiplyMatrices(inv, mesh.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(rel);
      out[i * 3] = v.x;
      out[i * 3 + 1] = v.y;
      out[i * 3 + 2] = v.z;
    }
    eg.dispose();
    parts.push(out);
    total += out.length;
  });
  const all = new Float32Array(total);
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(all, 3));
  edgeCache.set(root, g);
  return g;
}

export function forgetEdges(root: THREE.Object3D) {
  edgeCache.get(root)?.dispose();
  edgeCache.delete(root);
}
