import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { captureHighRes, computeCaptureSize, EXCLUDE_FROM_CAPTURE } from "../capture";

/** Just enough of a `THREE.WebGLRenderer` for `captureHighRes` — no real GL context, no canvas. */
function fakeGl() {
  return {
    getSize: (v: THREE.Vector2) => v.set(800, 600),
    getPixelRatio: () => 1,
    setPixelRatio: () => {},
    setSize: () => {},
    render: () => {},
    domElement: { toDataURL: () => "data:image/png;base64,x" },
  } as unknown as THREE.WebGLRenderer;
}

describe("computeCaptureSize", () => {
  it("doubles the current pixel resolution", () => {
    const { width, height } = computeCaptureSize(400, 225, 2);
    expect(width).toBe(400 * 2 * 2);
    expect(height).toBe(Math.round(width * (225 / 400)));
  });

  it("caps the width at the given maximum", () => {
    const { width } = computeCaptureSize(2000, 1000, 2, 3000);
    expect(width).toBe(3000);
  });

  it("keeps the on-screen aspect ratio", () => {
    const { width, height } = computeCaptureSize(1024, 576, 1.5);
    expect(width / height).toBeCloseTo(1024 / 576, 2);
  });

  it("never returns a zero or negative size for a degenerate input", () => {
    const { width, height } = computeCaptureSize(0, 0, 0);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
  });
});

describe("captureHighRes", () => {
  it("hides anything marked excludeFromCapture (the ground halo) for the render, then restores it", () => {
    const scene = new THREE.Scene();
    const model = new THREE.Mesh();
    const halo = new THREE.Mesh();
    halo.userData[EXCLUDE_FROM_CAPTURE] = true;
    scene.add(model, halo);
    const camera = new THREE.PerspectiveCamera();
    const gl = fakeGl();
    let sawHaloVisible: boolean | null = null;
    const originalRender = gl.render;
    gl.render = ((...args: unknown[]) => {
      // Captured mid-render: the halo should already be hidden by the time the scene is drawn.
      if (sawHaloVisible === null) sawHaloVisible = halo.visible;
      return (originalRender as (...a: unknown[]) => void)(...args);
    }) as typeof gl.render;

    expect(halo.visible).toBe(true);
    captureHighRes({ gl, scene, camera, light: null, width: 100, height: 100, mapSize: 512 });
    expect(sawHaloVisible).toBe(false);
    // Restored afterwards — the live view still shows it.
    expect(halo.visible).toBe(true);
    expect(model.visible).toBe(true);
  });

  it("leaves everything else alone", () => {
    const scene = new THREE.Scene();
    const model = new THREE.Mesh();
    model.visible = false; // already hidden for some other reason — must stay that way
    scene.add(model);
    captureHighRes({ gl: fakeGl(), scene, camera: new THREE.PerspectiveCamera(), light: null, width: 100, height: 100, mapSize: 512 });
    expect(model.visible).toBe(false);
  });
});
