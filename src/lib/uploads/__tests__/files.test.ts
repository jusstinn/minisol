import { describe, expect, it } from "vitest";
import {
  checkGltf,
  classifyFile,
  estimateGltfTriangles,
  estimateObjTriangles,
  externalUris,
  MAX_MODEL_BYTES,
  MAX_TRIANGLES,
  MB,
  readGltfJson,
  sniff,
} from "../files";
import type { GltfJson } from "../files";

const bytes = (...v: (number | string)[]) => new Uint8Array(v.flatMap((x) => (typeof x === "string" ? [...x].map((c) => c.charCodeAt(0)) : [x])));
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13);
const JPG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 16, "JFIF");
const WEBP = bytes("RIFF", 0, 0, 0, 0, "WEBPVP8 ");
const PDF = bytes("%PDF-1.7\n");
const text = (s: string) => new TextEncoder().encode(s);

/** A minimal binary glTF: 12-byte header + a JSON chunk (padded to 4 bytes). */
function glb(json: object): Uint8Array {
  let j = JSON.stringify(json);
  while (j.length % 4) j += " ";
  const out = new Uint8Array(20 + j.length);
  const v = new DataView(out.buffer);
  out.set(bytes("glTF"), 0);
  v.setUint32(4, 2, true);
  v.setUint32(8, out.length, true);
  v.setUint32(12, j.length, true);
  v.setUint32(16, 0x4e4f534a, true);
  out.set(text(j), 20);
  return out;
}

const tri = (count: number): GltfJson => ({
  asset: { version: "2.0" },
  accessors: [{ count }, { count: count * 3 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
  nodes: [{ mesh: 0 }],
});

describe("file classification", () => {
  it("recognises signatures", () => {
    expect(sniff(PNG)).toBe("png");
    expect(sniff(JPG)).toBe("jpeg");
    expect(sniff(WEBP)).toBe("webp");
    expect(sniff(PDF)).toBe("pdf");
    expect(sniff(glb(tri(1)))).toBe("glb");
    expect(sniff(text("v 0 0 0"))).toBeNull();
  });

  it("accepts models and plans by name + content", () => {
    expect(classifyFile("house.glb", 1000, glb(tri(1)))).toEqual({ ok: true, value: { kind: "model", format: "glb" } });
    expect(classifyFile("house.GLTF", 1000, text('  {"asset":{}}'))).toEqual({ ok: true, value: { kind: "model", format: "gltf" } });
    expect(classifyFile("scan.obj", 1000, text("# Blender\nv 0 0 0\n"))).toEqual({ ok: true, value: { kind: "model", format: "obj" } });
    expect(classifyFile("plan.png", 1000, PNG)).toEqual({ ok: true, value: { kind: "plan", format: "png" } });
    expect(classifyFile("plan.JPEG", 1000, JPG)).toEqual({ ok: true, value: { kind: "plan", format: "jpeg" } });
    expect(classifyFile("plan.webp", 1000, WEBP)).toEqual({ ok: true, value: { kind: "plan", format: "webp" } });
    expect(classifyFile("plan.pdf", 1000, PDF)).toEqual({ ok: true, value: { kind: "plan", format: "pdf" } });
  });

  it("trusts the content of a mislabelled picture, and a signature without an extension", () => {
    expect(classifyFile("plan.png", 1000, JPG)).toEqual({ ok: true, value: { kind: "plan", format: "jpeg" } });
    expect(classifyFile("scan", 1000, glb(tri(1)))).toEqual({ ok: true, value: { kind: "model", format: "glb" } });
  });

  it("refuses everything else with a message in both languages", () => {
    const r = classifyFile("house.fbx", 1000, bytes("Kaydara FBX Binary", 0));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.ro).toMatch(/GLB, GLTF sau OBJ/);
      expect(r.error.en).toMatch(/GLB, GLTF, OBJ/);
    }
    expect(classifyFile("notes.txt", 10, text("hello")).ok).toBe(false);
    expect(classifyFile("plan.svg", 10, text("<svg/>")).ok).toBe(false);
  });

  it("refuses content that doesn't match the name", () => {
    expect(classifyFile("house.glb", 1000, text("{}")).ok).toBe(false);
    expect(classifyFile("house.gltf", 1000, glb(tri(1))).ok).toBe(false);
    expect(classifyFile("house.obj", 1000, bytes(0, 1, 2, 3)).ok).toBe(false);
    expect(classifyFile("house.obj", 1000, text("<html>")).ok).toBe(false);
    expect(classifyFile("plan.pdf", 1000, PNG).ok).toBe(false);
    expect(classifyFile("plan.jpg", 1000, PDF).ok).toBe(false);
  });

  it("enforces the size limits", () => {
    expect(classifyFile("house.glb", MAX_MODEL_BYTES, glb(tri(1))).ok).toBe(true);
    const big = classifyFile("house.glb", MAX_MODEL_BYTES + 1, glb(tri(1)));
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.error.en).toMatch(/up to 30 MB/);
    expect(classifyFile("plan.png", 26 * MB, PNG).ok).toBe(false);
    expect(classifyFile("plan.png", 0, PNG).ok).toBe(false);
  });
});

describe("glTF checks", () => {
  it("reads the JSON chunk of a GLB", () => {
    const r = readGltfJson(glb(tri(12)), "glb");
    expect(r.ok && r.value.accessors?.[0].count).toBe(12);
    expect(readGltfJson(text(JSON.stringify(tri(3))), "gltf").ok).toBe(true);
  });

  it("refuses broken files and glTF 1.0", () => {
    expect(readGltfJson(bytes("glTF", 2, 0, 0, 0), "glb").ok).toBe(false);
    expect(readGltfJson(text("{ nope"), "gltf").ok).toBe(false);
    expect(readGltfJson(text('{"asset":{"version":"1.0"}}'), "gltf").ok).toBe(false);
  });

  it("refuses external resources (no network fetch while parsing)", () => {
    const json: GltfJson = { ...tri(1), buffers: [{ uri: "house.bin" }], images: [{ uri: "data:image/png;base64,AAAA" }, { uri: "https://evil.example/t.png" }] };
    expect(externalUris(json)).toEqual(["house.bin", "https://evil.example/t.png"]);
    const r = checkGltf(json, "house.gltf");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.en).toMatch(/single GLB/);
    expect(checkGltf({ ...tri(1), buffers: [{ uri: "data:application/octet-stream;base64,AAAA" }] }).ok).toBe(true);
  });

  it("refuses compression we can't decode locally", () => {
    const r = checkGltf({ ...tri(1), extensionsRequired: ["KHR_draco_mesh_compression"] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.en).toMatch(/Draco/);
  });

  it("counts triangles per shown node, strips/fans and GPU instances", () => {
    expect(estimateGltfTriangles(tri(100))).toBe(100);
    expect(estimateGltfTriangles({ ...tri(100), nodes: [{ mesh: 0 }, { mesh: 0 }, {}] })).toBe(200);
    expect(estimateGltfTriangles({ asset: { version: "2.0" }, accessors: [{ count: 10 }], meshes: [{ primitives: [{ mode: 5, attributes: { POSITION: 0 } }] }] })).toBe(8);
    expect(estimateGltfTriangles({ ...tri(10), accessors: [{ count: 10 }, { count: 30 }, { count: 7 }], nodes: [{ mesh: 0, extensions: { EXT_mesh_gpu_instancing: { attributes: { TRANSLATION: 2 } } } }] })).toBe(70);
    expect(estimateGltfTriangles({ asset: { version: "2.0" }, accessors: [{ count: 10 }], meshes: [{ primitives: [{ mode: 1, attributes: { POSITION: 0 } }] }] })).toBe(0);
  });

  it("refuses more than 500k triangles", () => {
    expect(checkGltf(tri(MAX_TRIANGLES)).ok).toBe(true);
    const r = checkGltf(tri(MAX_TRIANGLES + 1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.ro).toMatch(/500k/);
  });
});

describe("OBJ triangles", () => {
  it("counts n-gons as n − 2 triangles", () => {
    const obj = ["# cube", "v 0 0 0", "f 1 2 3", "f 1/1/1 2/2/2 3/3/3 4/4/4", "  f 1 2 3 4 5", "vn 0 1 0", "fo 1 2 3", "f 1 2"].join("\r\n");
    expect(estimateObjTriangles(obj)).toBe(1 + 2 + 3);
  });
});
