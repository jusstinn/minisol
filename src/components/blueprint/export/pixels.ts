/**
 * Pixel maths for baking the procedural finishes (textures.ts) into the maps a glTF/USDZ file
 * can carry. Plain typed arrays in, plain typed arrays out — no canvas, no THREE — so it is
 * unit-tested in node. `bake.ts` does the canvas plumbing around it.
 *
 * Orientation: everything here works on the image AS STORED IN THE FILE (row 0 on top, glTF's
 * convention: texture v grows downward). That is what lets the same bytes serve glTF (read as-is)
 * and USDZ (three's exporter reads such a texture, flipY = false, as-is).
 */

/** The largest power of two ≤ `max` that is nearest to `n` (in log space), and at least 4. */
export function potSize(n: number, max = 256): number {
  const v = Math.max(4, Math.min(max, Math.round(n) || 4));
  return Math.min(max, 2 ** Math.round(Math.log2(v)));
}

export const isPowerOfTwo = (n: number): boolean => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;

/**
 * A roughness image (grey; the value is in R) as a glTF "metallic-roughness" image: G = roughness,
 * B = metalness, R = occlusion. The metalness and roughness FACTORS stay on the material, so the
 * image holds only the variation (B = 255, R = 255 leave them untouched). Returns a new array.
 */
export function toMetalRough(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    out[i] = 255;
    out[i + 1] = rgba[i];
    out[i + 2] = 255;
    out[i + 3] = 255;
  }
  return out;
}

/**
 * How strong the relief is, from the finish's `bumpScale`: wood (0.0022) is the reference at 1;
 * glazed tile (0.0003) is almost flat, gravel (0.004) rough. Clamped so nothing is invisible or
 * cartoonish. (`bumpScale` is a per-pixel factor in the live renderer, so there is no exact
 * conversion — this is tuned by eye against it.)
 */
export function normalStrength(bumpScale: number): number {
  return Math.min(2.6, Math.max(0.35, (bumpScale / 0.0022) * 1.15));
}

/**
 * A tangent-space normal map from a height image (grey; the value is in R, brighter = higher), in
 * the glTF convention: +X right, +Y toward the TOP of the stored image, 0.5-biased. Differences
 * wrap around the edges, so a tileable height stays tileable. `strength` is the tilt per unit of
 * height change per texel.
 */
export function normalFromHeight(height: Uint8ClampedArray, w: number, h: number, strength: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  const at = (x: number, y: number) => height[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5;
      // Rows grow downward, +Y is up: the slope toward "up" is the negative row difference.
      const dyUp = (at(x, y - 1) - at(x, y + 1)) * 0.5;
      let nx = -dx * strength * 4;
      let ny = -dyUp * strength * 4;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const o = (y * w + x) * 4;
      out[o] = Math.round((nx * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      out[o + 3] = 255;
    }
  }
  return out;
}
