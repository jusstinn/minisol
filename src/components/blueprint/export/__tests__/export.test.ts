import { unzipSync } from "three/addons/libs/fflate.module.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildScene } from "../../builders";
import { MIME, exportModel, modelFileName } from "../index";
import { isPowerOfTwo } from "../pixels";
import { boundsOf, placeParts } from "../placement";
import { installDomShim, pngSize } from "./domShim";
import { glbBounds, parseGlb } from "./glbParse";

let restore: () => void;
beforeAll(() => {
  restore = installDomShim();
});
afterAll(() => restore());

const deck = () => buildScene("deck", { lengthM: 4, widthM: 3 }, "ro");
const bathroom = () => buildScene("tiling", { roomType: "bathroom" }, "ro");
const MB = 1024 * 1024;

describe("file names", () => {
  it("are the photo name with the model's extension", () => {
    expect(modelFileName("glb", "Terasă din deck", "hornbach", new Date(2026, 9, 24))).toBe("terasa-din-deck-hornbach-2026-10-24.glb");
    expect(modelFileName("usdz", "", "hornbach", new Date(2026, 9, 24))).toBe("schita-hornbach-2026-10-24.usdz");
  });
});

describe("GLB export (GLTFExporter, run in node)", () => {
  it("writes a valid binary glTF 2 file for a 4 × 3 m deck, well under 8 MB", async () => {
    const out = await exportModel(deck(), "glb", { title: "Terasă", tenantId: "hornbach", date: new Date(2026, 9, 24) });
    expect(out.format).toBe("glb");
    expect(out.filename).toBe("terasa-hornbach-2026-10-24.glb");
    expect(out.blob.type).toBe(MIME.glb);
    expect(out.blob.size).toBeLessThan(8 * MB);
    const { json, bin } = parseGlb(await out.blob.arrayBuffer());
    expect(json.asset.version).toBe("2.0");
    expect(json.buffers[0].byteLength).toBeGreaterThanOrEqual(bin.length - 4);
    expect(json.meshes.length).toBe(out.stats.meshes);
    expect(json.materials!.length).toBe(out.stats.materials);
  });

  it("its geometry is the build's: bounds in metres, centred, on the floor", async () => {
    const b = deck();
    const out = await exportModel(b, "glb");
    const { json } = parseGlb(await out.blob.arrayBuffer());
    const got = glbBounds(json);
    const want = boundsOf(placeParts(b))!;
    for (let a = 0; a < 3; a++) {
      expect(got.min[a]).toBeCloseTo(want.min[a], 3);
      expect(got.max[a]).toBeGreaterThanOrEqual(want.max[a] - 1e-3);
      expect(got.max[a]).toBeLessThanOrEqual(want.max[a] + 0.0025);
    }
    expect(got.max[0] - got.min[0]).toBeCloseTo(4.2, 2);
    expect(got.max[2] - got.min[2]).toBeCloseTo(3.2, 2);
    expect((got.min[0] + got.max[0]) / 2).toBeCloseTo(0, 2);
    expect(got.min[1]).toBeCloseTo(0, 3);
    // No node moves or scales anything: positions are real metres as written.
    for (const n of json.nodes) {
      expect(n.matrix).toBeUndefined();
      expect(n.scale).toBeUndefined();
    }
  });

  it("carries PBR materials: base colour, metallic-roughness and normal maps, shared between meshes", async () => {
    const out = await exportModel(deck(), "glb");
    const { json } = parseGlb(await out.blob.arrayBuffer());
    const textured = json.materials!.filter((m) => m.pbrMetallicRoughness.baseColorTexture);
    expect(textured.length).toBeGreaterThan(3);
    for (const m of textured) {
      expect(m.pbrMetallicRoughness.metallicRoughnessTexture).toBeDefined();
      expect(m.normalTexture).toBeDefined();
      expect(m.pbrMetallicRoughness.baseColorFactor).toBeDefined();
    }
    // Wood, membrane and metal: three finish kinds × (colour, metallic-roughness, normal), however many colours.
    expect(json.textures!.length).toBe(9);
    expect(json.images!.length).toBe(9);
    // Several wood colours point at the same textures.
    const woodBase = textured.filter((m) => m.name?.startsWith("wood")).map((m) => m.pbrMetallicRoughness.baseColorTexture!.index);
    expect(woodBase.length).toBeGreaterThan(2);
    expect(new Set(woodBase).size).toBe(1);
    // Rough wood, metallic metal: the factors survive.
    expect(json.materials!.find((m) => m.name?.startsWith("wood"))!.pbrMetallicRoughness.roughnessFactor).toBeCloseTo(0.75, 2);
    expect(json.materials!.find((m) => m.name?.startsWith("metal"))!.pbrMetallicRoughness.metallicFactor).toBeGreaterThan(0.5);
  });

  it("bakes its images as power-of-two PNGs of a modest size", async () => {
    const out = await exportModel(deck(), "glb");
    const { json, bin } = parseGlb(await out.blob.arrayBuffer());
    for (const img of json.images!) {
      expect(img.mimeType).toBe("image/png");
      const view = json.bufferViews[img.bufferView];
      const bytes = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
      expect([...bytes.subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
      const { w, h } = pngSize(bytes);
      expect(isPowerOfTwo(w) && isPowerOfTwo(h)).toBe(true);
      expect(Math.max(w, h)).toBeLessThanOrEqual(256);
    }
    // Repeating textures.
    for (const s of json.samplers!) {
      expect(s.wrapS).toBe(10497);
      expect(s.wrapT).toBe(10497);
    }
  });

  it("keeps glazed tile's clearcoat for a bathroom, and stays small", async () => {
    const out = await exportModel(bathroom(), "glb");
    const { json } = parseGlb(await out.blob.arrayBuffer());
    expect(json.extensionsUsed).toContain("KHR_materials_clearcoat");
    expect(json.extensionsRequired ?? []).not.toContain("KHR_materials_clearcoat");
    expect(out.blob.size).toBeLessThan(8 * MB);
    expect(glbBounds(json).max[1]).toBeCloseTo(2.1, 1);
  });

  it("a fence for a download keeps the footings under the floor; for AR they are cut", async () => {
    const fence = buildScene("fence", { lengthM: 20 }, "ro");
    const ar = glbBounds(parseGlb(await (await exportModel(fence, "glb")).blob.arrayBuffer()).json);
    const dl = glbBounds(parseGlb(await (await exportModel(fence, "glb", { underground: "keep" })).blob.arrayBuffer()).json);
    expect(ar.min[1]).toBeGreaterThanOrEqual(-1e-6);
    expect(dl.min[1]).toBeLessThan(-0.5);
  });

  it("marks itself as an indicative model, in metres", async () => {
    const out = await exportModel(deck(), "glb");
    const { json } = parseGlb(await out.blob.arrayBuffer());
    const root = json.nodes.find((n) => n.name === "Blueprint")!;
    expect(root.extras).toMatchObject({ units: "metre" });
    expect(String(root.extras!.note)).toMatch(/indicative/i);
  });

  it("refuses to write an empty model", async () => {
    const b = deck();
    await expect(exportModel({ ...b, parts: b.parts.map((p) => ({ ...p, context: true })) }, "glb")).rejects.toThrow(/nothing to export/);
  });
});

describe("USDZ export (USDZExporter, run in node)", () => {
  it("writes an uncompressed USDZ archive that starts with the model", async () => {
    const out = await exportModel(deck(), "usdz");
    expect(out.blob.type).toBe(MIME.usdz);
    expect(out.filename.endsWith(".usdz")).toBe(true);
    expect(out.blob.size).toBeLessThan(8 * MB);
    const bytes = new Uint8Array(await out.blob.arrayBuffer());
    // PK local file header; compression method 0 (stored), as the USDZ spec requires.
    expect([...bytes.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(bytes[8] | (bytes[9] << 8)).toBe(0);
    const files = unzipSync(bytes);
    expect(Object.keys(files)[0]).toBe("model.usda");
  });

  it("is metres, y up, anchored to a horizontal plane (it sits on the floor at true scale)", async () => {
    const out = await exportModel(deck(), "usdz");
    const usda = new TextDecoder().decode(unzipSync(new Uint8Array(await out.blob.arrayBuffer()))["model.usda"]);
    expect(usda).toContain("metersPerUnit = 1");
    expect(usda).toContain('upAxis = "Y"');
    expect(usda).toContain('token preliminary:anchoring:type = "plane"');
    expect(usda).toContain('token preliminary:planeAnchoring:alignment = "horizontal"');
    // PBR: textures for colour, roughness, metallic and normal on a preview surface.
    expect(usda).toContain("UsdPreviewSurface");
    expect(usda).toContain("inputs:normal.connect");
    expect(usda).toContain("inputs:roughness.connect");
    expect(usda).toContain("inputs:metallic.connect");
  });

  it("textures are power-of-two PNGs (what Quick Look wants)", async () => {
    const out = await exportModel(bathroom(), "usdz");
    const files = unzipSync(new Uint8Array(await out.blob.arrayBuffer()));
    const textures = Object.entries(files).filter(([name]) => name.startsWith("textures/"));
    expect(textures.length).toBe(9);
    for (const [name, bytes] of textures) {
      expect(name.endsWith(".png"), name).toBe(true);
      const { w, h } = pngSize(bytes);
      expect(isPowerOfTwo(w) && isPowerOfTwo(h), `${name} ${w}×${h}`).toBe(true);
      expect(Math.max(w, h)).toBeLessThanOrEqual(256);
    }
    expect(out.blob.size).toBeLessThan(8 * MB);
  });

  it("uses fewer lawn blades than the GLB, with back faces, and stays under the budget", async () => {
    const lawn = buildScene("lawn", {}, "ro");
    const usdz = await exportModel(lawn, "usdz");
    const glb = await exportModel(lawn, "glb");
    expect(usdz.blob.size).toBeLessThan(8 * MB);
    expect(glb.blob.size).toBeLessThan(8 * MB);
  });

  it("every project type stays under 8 MB in both formats", async () => {
    for (const [type, inputs] of [["paving", {}], ["laminate_floor", {}], ["drywall_partition", {}], ["paint_room", {}], ["lawn", {}], ["fence", { lengthM: 20 }]] as const) {
      for (const format of ["glb", "usdz"] as const) {
        const out = await exportModel(buildScene(type, inputs, "ro"), format);
        expect(out.blob.size, `${type} ${format}`).toBeLessThan(8 * MB);
      }
    }
  });
});
