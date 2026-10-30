import * as THREE from "three";
import type { FinishTextureSet } from "../textures";
import { normalFromHeight, normalStrength, potSize, toMetalRough } from "./pixels";

/**
 * Bakes a finish's procedural canvases (textures.ts: colour, roughness, bump — drawn once per
 * finish KIND and shared) into the three images a glTF/USDZ material carries: base colour, a
 * metallic-roughness image and a normal map. Browser only (it needs canvases); the pixel maths is
 * in `pixels.ts`.
 *
 * The textures come out in the form a glTF file stores them — image row 0 on top, `flipY = false`,
 * `normalScale.y = -1` for geometry without tangents — i.e. exactly what GLTFLoader produces. That
 * is the one form both exporters (GLTFExporter and USDZExporter) pass through unchanged, and what
 * three's own renderer shows correctly. Power-of-two sizes, repeat 1 (the repeat is baked into
 * the geometry's UVs instead, see scene.ts).
 */

export interface BakedFinish {
  map: THREE.Texture;
  metalRough: THREE.Texture;
  normal: THREE.Texture;
  /** Edge length in pixels of each image (power of two). */
  size: [number, number];
}

type Source = { width: number; height: number };

function canvasOf(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** `src` drawn into a w × h canvas, flipped top-to-bottom (glTF stores images the other way up). */
function flipped(src: Source, w: number, h: number): HTMLCanvasElement {
  const c = canvasOf(w, h);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2d context");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.translate(0, h);
  ctx.scale(1, -1);
  ctx.drawImage(src as unknown as CanvasImageSource, 0, 0, w, h);
  return c;
}

function pixelsOf(c: HTMLCanvasElement): Uint8ClampedArray {
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2d context");
  return ctx.getImageData(0, 0, c.width, c.height).data;
}

function canvasFrom(pixels: Uint8ClampedArray, w: number, h: number): HTMLCanvasElement {
  const c = canvasOf(w, h);
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  const img = ctx.createImageData(w, h);
  img.data.set(pixels);
  ctx.putImageData(img, 0, 0);
  return c;
}

function textureOf(canvas: HTMLCanvasElement, colorSpace: string): THREE.Texture {
  const t = new THREE.CanvasTexture(canvas);
  t.flipY = false;
  t.colorSpace = colorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** The baked set for one finish, cached per source canvas and size (the same wood for every wooden part). */
const cache = new WeakMap<object, Map<number, BakedFinish>>();

export function bakeFinish(set: FinishTextureSet, maxSize = 256): BakedFinish {
  const colorCanvas = set.map.image as Source & object;
  let perSize = cache.get(colorCanvas);
  if (!perSize) cache.set(colorCanvas, (perSize = new Map()));
  const hit = perSize.get(maxSize);
  if (hit) return hit;

  const w = potSize(colorCanvas.width, maxSize);
  const h = potSize(colorCanvas.height, maxSize);
  const albedo = flipped(colorCanvas, w, h);
  const rough = pixelsOf(flipped(set.roughnessMap.image as Source, w, h));
  const height = pixelsOf(flipped(set.bumpMap.image as Source, w, h));

  const map = textureOf(albedo, THREE.SRGBColorSpace);
  const metalRough = textureOf(canvasFrom(toMetalRough(rough), w, h), THREE.NoColorSpace);
  const normal = textureOf(canvasFrom(normalFromHeight(height, w, h, normalStrength(set.bumpScale)), w, h), THREE.NoColorSpace);
  const baked: BakedFinish = { map, metalRough, normal, size: [w, h] };
  perSize.set(maxSize, baked);
  return baked;
}
