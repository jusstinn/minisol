import type * as THREE from "three";

/**
 * The two file encoders. Each exporter is imported on demand, so a phone that only wants AR Quick
 * Look never loads GLTFExporter and an Android phone never loads USDZExporter (and neither loads
 * at all until the customer asks for a model).
 */

/** Binary glTF (.glb). */
export async function encodeGlb(root: THREE.Object3D): Promise<ArrayBuffer> {
  const { GLTFExporter } = await import("three/addons/exporters/GLTFExporter.js");
  const result = await new GLTFExporter().parseAsync(root, {
    binary: true,
    onlyVisible: true,
    // The baked textures are already the size we want; never let the exporter resample them again.
    maxTextureSize: 4096,
  });
  if (!(result instanceof ArrayBuffer)) throw new Error("export: GLB expected");
  return result;
}

/** USDZ for AR Quick Look: plane-anchored (it sits on the floor), metres, y up. */
export async function encodeUsdz(root: THREE.Object3D): Promise<ArrayBuffer> {
  const { USDZExporter } = await import("three/addons/exporters/USDZExporter.js");
  const bytes = await new USDZExporter().parseAsync(root, { maxTextureSize: 4096 });
  // A fresh, exactly-sized buffer (the zip may hand out a view into a larger one).
  return bytes.slice().buffer as ArrayBuffer;
}
