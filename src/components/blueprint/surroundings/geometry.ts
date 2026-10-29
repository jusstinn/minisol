import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import type { Rect } from "./plan";

/** Shared geometries for the surroundings — built once, instanced everywhere. */

function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
/** Smooth 3-D value noise in [0, 1]. */
function vnoise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  const c = (a: number, b: number, d: number) => hash3(ix + a, iy + b, iz + d);
  const l = (p: number, q: number, t: number) => p + (q - p) * t;
  return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v), l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w);
}

let blob: THREE.BufferGeometry | null = null;
/**
 * A lumpy unit mound of foliage: a subdivided icosahedron, welded, pushed in and out by two noise
 * octaves (so no two lobes line up), with a baked vertex-colour gradient — dark in the crown's
 * own shade underneath, bright where the sun reaches the top. Instances scale it per plant.
 */
export function blobGeometry(): THREE.BufferGeometry {
  if (blob) return blob;
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 2);
  g.deleteAttribute("uv");
  g.deleteAttribute("normal");
  g = mergeVertices(g, 1e-4);
  const pos = g.getAttribute("position");
  const col = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const n = vnoise3(v.x * 2.4 + 5, v.y * 2.4 + 5, v.z * 2.4 + 5) * 0.65 + vnoise3(v.x * 5.5, v.y * 5.5, v.z * 5.5) * 0.35;
    const d = 0.86 + n * 0.3;
    pos.setXYZ(i, v.x * d, v.y * d * 0.96, v.z * d);
    const lit = 0.55 + 0.6 * (v.y * 0.5 + 0.5) + (n - 0.5) * 0.2;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = lit;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  blob = g;
  return g;
}

let trunk: THREE.BufferGeometry | null = null;
/** A tapering trunk: unit height, base radius 1.3 → top radius 1, rooted at y = 0. */
export function trunkGeometry(): THREE.BufferGeometry {
  if (trunk) return trunk;
  const g = new THREE.CylinderGeometry(0.72, 1, 1, 7, 3);
  g.translate(0, 0.5, 0);
  trunk = g;
  return g;
}

let dot: THREE.BufferGeometry | null = null;
export function dotGeometry(): THREE.BufferGeometry {
  if (dot) return dot;
  dot = new THREE.IcosahedronGeometry(1, 0);
  return dot;
}

let box: THREE.BufferGeometry | null = null;
/** A unit box standing on y = 0 (planters, soil caps). */
export function standingBoxGeometry(): THREE.BufferGeometry {
  if (box) return box;
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  box = g;
  return g;
}

/**
 * A flat ground mesh in the x/z plane spanning `size` metres, UVs 0..1 across it, centred on the
 * origin; with an optional rectangular hole (plan coordinates relative to the centre) where a
 * paved build sits flush with the lawn.
 */
export function groundGeometry(size: number, hole: Rect | null): THREE.BufferGeometry {
  if (!hole) {
    const g = new THREE.PlaneGeometry(size, size, 1, 1);
    g.rotateX(-Math.PI / 2);
    return g;
  }
  const h = size / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-h, -h);
  shape.lineTo(h, -h);
  shape.lineTo(h, h);
  shape.lineTo(-h, h);
  shape.closePath();
  // After rotateX(-90°) a shape point (x, y) lands at world (x, 0, -y): flip z.
  const clamp = (v: number) => Math.max(-h + 0.01, Math.min(h - 0.01, v));
  const x0 = clamp(hole.minX);
  const x1 = clamp(hole.maxX);
  const y0 = clamp(-hole.maxZ);
  const y1 = clamp(-hole.minZ);
  const path = new THREE.Path();
  path.moveTo(x0, y0);
  path.lineTo(x0, y1);
  path.lineTo(x1, y1);
  path.lineTo(x1, y0);
  path.closePath();
  shape.holes.push(path);
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  const pos = g.getAttribute("position");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / size + 0.5;
    uv[i * 2 + 1] = 0.5 - pos.getZ(i) / size;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
