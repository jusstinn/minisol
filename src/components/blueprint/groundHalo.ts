import * as THREE from "three";

/**
 * A soft circular alpha falloff (opaque centre fading to fully transparent at the edge) — grounds
 * the REAL-mode model in a patch of garden/floor instead of it looking pasted onto the blueprint
 * grid with nothing around it (see Scene.tsx's `GroundHalo`). One shared canvas, generated once
 * (browser only — never called during SSR or in tests, same convention as textures.ts).
 */
let cached: THREE.CanvasTexture | null = null;

export function groundHaloTexture(): THREE.CanvasTexture {
  if (cached) return cached;
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(0.5, "rgba(255,255,255,0.6)");
    g.addColorStop(0.8, "rgba(255,255,255,0.22)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  cached = new THREE.CanvasTexture(c);
  cached.needsUpdate = true;
  return cached;
}
