import * as THREE from "three";

/**
 * "Randare foto": a one-off high-resolution still of the live REAL view, read back from the
 * same `WebGLRenderer`/`scene`/`camera` the sketch already uses (see PhotoRender.tsx) — no
 * second renderer, no permanent cost. The resize → render → read-back → restore sequence below
 * runs synchronously end to end (including the pixel read, via `toDataURL` rather than the
 * async `toBlob`), so the live render loop can never sneak a frame in at the temporary, bigger
 * size: nothing is painted to the screen until we've already restored the normal size.
 */

/** Target pixel size for the capture: ~2× what's on screen now, capped so the PNG stays a
 *  reasonable size. Pure (no DOM), so it's unit-tested directly. */
export function computeCaptureSize(cssWidth: number, cssHeight: number, pixelRatio: number, maxWidth = 3000): { width: number; height: number } {
  const currentPx = Math.max(1, cssWidth * Math.max(0.1, pixelRatio));
  const width = Math.max(1, Math.min(maxWidth, Math.round(currentPx * 2)));
  const aspect = cssHeight / Math.max(1, cssWidth);
  const height = Math.max(1, Math.round(width * aspect));
  return { width, height };
}

export interface CaptureParams {
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** The sketch's directional light, if found — its shadow map is temporarily resized for a
   *  crisper capture, then restored. Capture still works (just without that bump) if omitted. */
  light: THREE.DirectionalLight | null;
  width: number;
  height: number;
  mapSize: number;
}

/**
 * Objects marked this way (the ground halo — see Scene.tsx's `GroundHalo`) sit out of "Randare
 * foto": its own soft, wide alpha falloff would otherwise read as "content" to `contentCrop`'s
 * alpha scan (photoFooter.ts) and crop the export to the halo's own, much bigger footprint
 * instead of the model.
 */
export const EXCLUDE_FROM_CAPTURE = "excludeFromCapture";

/** A PNG data URL of the scene at `width`×`height`, with the renderer left exactly as found. */
export function captureHighRes({ gl, scene, camera, light, width, height, mapSize }: CaptureParams): string {
  const size = gl.getSize(new THREE.Vector2());
  const prevPixelRatio = gl.getPixelRatio();
  const prevAspect = camera.aspect;
  const prevMapSize = light ? light.shadow.mapSize.clone() : null;
  const hidden: THREE.Object3D[] = [];
  scene.traverse((o) => {
    if (o.visible && o.userData[EXCLUDE_FROM_CAPTURE]) {
      o.visible = false;
      hidden.push(o);
    }
  });

  try {
    gl.setPixelRatio(1);
    gl.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (light) {
      light.shadow.mapSize.set(mapSize, mapSize);
      light.shadow.map?.dispose();
      light.shadow.map = null;
      light.shadow.needsUpdate = true;
    }
    gl.render(scene, camera);
    return gl.domElement.toDataURL("image/png");
  } finally {
    gl.setPixelRatio(prevPixelRatio);
    gl.setSize(size.x, size.y, false);
    camera.aspect = prevAspect;
    camera.updateProjectionMatrix();
    if (light && prevMapSize) {
      light.shadow.mapSize.copy(prevMapSize);
      // Force a clean reallocation at the restored size on the live renderer's next shadow pass.
      light.shadow.map?.dispose();
      light.shadow.map = null;
      light.shadow.needsUpdate = true;
    }
    for (const o of hidden) o.visible = true;
    // Render once immediately at the restored size, so the canvas never shows a stale frame
    // from the bigger buffer until the live loop's next tick.
    gl.render(scene, camera);
  }
}
