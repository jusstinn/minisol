import * as THREE from "three";

/**
 * A soft circular falloff (white centre fading to black at the edge, used as an alpha map) — grounds
 * the REAL-mode model in a patch of garden/floor instead of it looking pasted onto the blueprint
 * grid with nothing around it (see Scene.tsx's `GroundHalo`). One shared canvas, generated once
 * (browser only — never called during SSR or in tests, same convention as textures.ts).
 */
let cached: THREE.CanvasTexture | null = null;

export function groundHaloTexture(): THREE.CanvasTexture {
  if (cached) return cached;
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    // Greyscale (it's used as an alphaMap, which reads the green channel), with a long smooth
    // falloff: ground that fades into the backdrop, not a disc with an edge.
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, size, size);
    g.addColorStop(0, "#fff");
    g.addColorStop(0.35, "#d9d9d9");
    g.addColorStop(0.65, "#595959");
    g.addColorStop(0.85, "#141414");
    g.addColorStop(1, "#000");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    // A little noise breaks up the 8-bit steps of a large, slow gradient (visible as rings).
    const img = ctx.getImageData(0, 0, size, size);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 6;
      const v = Math.max(0, Math.min(255, d[i] + n));
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);
  }
  cached = new THREE.CanvasTexture(c);
  cached.needsUpdate = true;
  return cached;
}
