/** Reading a .glb back, for tests: header, the JSON chunk and the binary chunk. */

export interface Gltf {
  asset: { version: string; generator?: string };
  scene?: number;
  scenes: { nodes: number[] }[];
  nodes: { name?: string; mesh?: number; children?: number[]; extras?: Record<string, unknown>; matrix?: number[]; translation?: number[]; scale?: number[] }[];
  meshes: { name?: string; primitives: { attributes: Record<string, number>; indices?: number; material?: number }[]; extras?: Record<string, unknown> }[];
  materials?: {
    name?: string;
    alphaMode?: string;
    doubleSided?: boolean;
    normalTexture?: { index: number; scale?: number };
    pbrMetallicRoughness: { baseColorFactor?: number[]; metallicFactor?: number; roughnessFactor?: number; baseColorTexture?: { index: number }; metallicRoughnessTexture?: { index: number } };
    extensions?: Record<string, unknown>;
  }[];
  textures?: { source: number; sampler?: number }[];
  images?: { mimeType: string; bufferView: number }[];
  samplers?: { wrapS?: number; wrapT?: number }[];
  accessors: { componentType: number; count: number; type: string; min?: number[]; max?: number[]; bufferView?: number }[];
  bufferViews: { buffer: number; byteOffset?: number; byteLength: number }[];
  buffers: { byteLength: number }[];
  extensionsUsed?: string[];
  extensionsRequired?: string[];
}

export function parseGlb(buf: ArrayBuffer): { json: Gltf; bin: Uint8Array } {
  const view = new DataView(buf);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error("not a GLB (magic)");
  if (view.getUint32(4, true) !== 2) throw new Error("not glTF 2");
  if (view.getUint32(8, true) !== buf.byteLength) throw new Error("GLB length mismatch");
  const jsonLen = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a) throw new Error("first chunk is not JSON");
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen))) as Gltf;
  const binAt = 20 + jsonLen;
  const binLen = binAt < buf.byteLength ? view.getUint32(binAt, true) : 0;
  return { json, bin: new Uint8Array(buf, binAt + 8, binLen) };
}

/** The union of every POSITION accessor's min/max across all meshes (the model's bounds, no node transforms). */
export function glbBounds(json: Gltf): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of json.meshes)
    for (const prim of mesh.primitives) {
      const acc = json.accessors[prim.attributes.POSITION];
      for (let a = 0; a < 3; a++) {
        min[a] = Math.min(min[a], acc.min![a]);
        max[a] = Math.max(max[a], acc.max![a]);
      }
    }
  return { min, max };
}
