import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { bevelGeometryFor, slatsGeometryFor, unitGeometryFor } from "../detail/geometries";
import { isBevelShape, isRealSized, shapeFor } from "../detail/shapes";
import type { ShapeKind } from "../detail/shapes";
import type { PlacedPart } from "./placement";

/**
 * Real-size geometry for one placed part, in export space (metres, already at its position) —
 * the same shapes the REAL view draws (bevelled boards and tiles, slatted fence panels, round
 * pedestals, post caps, furniture cylinders), built from `detail/geometries.ts`' own caches but
 * never mutating them. Only `position`, `normal` and `uv` are kept so geometries of different
 * origins merge.
 */

/** Position, normal, uv — the only attributes an export needs (and that every shape has). */
const KEEP = ["position", "normal", "uv"];

/** A geometry made indexed (vertices shared where position, normal and uv agree) — cached, so a
 *  hundred identical boards weld their shared base once. */
const indexedCache = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();
function indexed(base: THREE.BufferGeometry): THREE.BufferGeometry {
  if (base.index) return base;
  let g = indexedCache.get(base);
  if (!g) {
    const slim = base.clone();
    for (const name of Object.keys(slim.attributes)) if (!KEEP.includes(name)) slim.deleteAttribute(name);
    g = mergeVertices(slim, 1e-5);
    slim.dispose();
    indexedCache.set(base, g);
  }
  return g;
}

/** The shape a placed part gets in an export: the REAL view's own pick, at full quality. */
export function exportShapeFor(p: PlacedPart): ShapeKind {
  return shapeFor({ ...p.part, size: p.size }, { real: true, lite: false });
}

function baseGeometry(shape: ShapeKind, size: PlacedPart["size"]): THREE.BufferGeometry {
  if (shape === "slats") return slatsGeometryFor(size);
  if (isBevelShape(shape)) return bevelGeometryFor(shape, size);
  return unitGeometryFor(shape);
}

/**
 * The part's geometry at `pos`, real size. `uvRepeat` multiplies the UVs — the finish's texture
 * repeat, baked here so one material (repeat 1) serves every size of the same finish.
 */
export function partGeometry(p: PlacedPart, uvRepeat?: readonly [number, number]): THREE.BufferGeometry {
  const shape = exportShapeFor(p);
  const g = indexed(baseGeometry(shape, p.size)).clone();
  for (const name of Object.keys(g.attributes)) if (!KEEP.includes(name)) g.deleteAttribute(name);
  // Real-sized shapes already have their dimensions; unit shapes (-0.5..0.5) are scaled to them.
  const scale = isRealSized(shape) ? new THREE.Vector3(1, 1, 1) : new THREE.Vector3(...p.size);
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...p.pos), new THREE.Quaternion(), scale));
  if (uvRepeat && (uvRepeat[0] !== 1 || uvRepeat[1] !== 1)) {
    const uv = g.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvRepeat[0], uv.getY(i) * uvRepeat[1]);
  }
  return g;
}

/** Many geometries as one (null for none); every input is disposed. */
export function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  const merged = mergeGeometries(list, false);
  if (!merged) throw new Error("export: geometries could not be merged");
  for (const g of list) g.dispose();
  return merged;
}
