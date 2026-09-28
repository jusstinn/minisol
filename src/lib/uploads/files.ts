/**
 * "Bring your own plans and models": what we accept and how we check it — pure
 * functions, no DOM and no three.js, so they run the same in tests and in the browser.
 *
 * Everything the customer drops stays on their device. These checks run before a byte
 * is parsed: the file type is decided from its name *and* its first bytes, sizes are
 * capped, glTF files that point at external resources are refused (so parsing can never
 * make a network request) and the triangle count is estimated from the file itself.
 */

export const MB = 1024 * 1024;
export const MAX_MODEL_BYTES = 30 * MB;
export const MAX_PLAN_BYTES = 25 * MB;
export const MAX_TRIANGLES = 500_000;
/** Above this a model still loads, but phones may struggle (we say so). */
export const HEAVY_TRIANGLES = 200_000;

export type ModelFormat = "glb" | "gltf" | "obj";
export type PlanFormat = "png" | "jpeg" | "webp" | "pdf";
export type UploadKind = { kind: "model"; format: ModelFormat } | { kind: "plan"; format: PlanFormat };

/** A message in both languages (the UI picks one). */
export interface Msg {
  ro: string;
  en: string;
}
export type Checked<T> = { ok: true; value: T } | { ok: false; error: Msg };

const fail = (ro: string, en: string): { ok: false; error: Msg } => ({ ok: false, error: { ro, en } });

const EXT: Record<string, UploadKind> = {
  glb: { kind: "model", format: "glb" },
  gltf: { kind: "model", format: "gltf" },
  obj: { kind: "model", format: "obj" },
  png: { kind: "plan", format: "png" },
  jpg: { kind: "plan", format: "jpeg" },
  jpeg: { kind: "plan", format: "jpeg" },
  webp: { kind: "plan", format: "webp" },
  pdf: { kind: "plan", format: "pdf" },
};

export const ACCEPT = ".glb,.gltf,.obj,.png,.jpg,.jpeg,.webp,.pdf";

const mbText = (bytes: number) => `${(bytes / MB).toFixed(bytes < 10 * MB ? 1 : 0)} MB`;

function startsWith(head: Uint8Array, bytes: number[], at = 0) {
  if (head.length < at + bytes.length) return false;
  return bytes.every((b, i) => head[at + i] === b);
}
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** What the first bytes say the file is (null = none of ours, or plain text). */
export function sniff(head: Uint8Array): ModelFormat | PlanFormat | null {
  if (startsWith(head, ascii("glTF"))) return "glb";
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(head, ascii("RIFF")) && startsWith(head, ascii("WEBP"), 8)) return "webp";
  if (startsWith(head, ascii("%PDF-"))) return "pdf";
  return null;
}

/** First non-whitespace character of a text file ('' when the head looks binary). */
function firstChar(head: Uint8Array): string {
  for (let i = 0; i < head.length; i++) {
    const c = head[i];
    if (c === 0) return "";
    if (c === 0xef && head[i + 1] === 0xbb && head[i + 2] === 0xbf) {
      i += 2; // UTF-8 BOM
      continue;
    }
    if (c !== 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) return String.fromCharCode(c);
  }
  return "";
}

const looksBinary = (head: Uint8Array) => head.subarray(0, 1024).includes(0);

/**
 * Decide what a dropped / picked file is, from its name, size and first bytes (≥ 16 bytes;
 * 1 KB is plenty). Anything that isn't clearly one of ours is refused with a message.
 */
export function classifyFile(name: string, size: number, head: Uint8Array): Checked<UploadKind> {
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  const short = name.length > 40 ? `${name.slice(0, 37)}…` : name;
  const byName = EXT[ext];
  const sniffed = sniff(head);
  // A known signature wins over a missing / odd extension (e.g. "scan" or "plan.bin").
  const kind: UploadKind | undefined = byName ?? (sniffed ? EXT[sniffed === "jpeg" ? "jpg" : sniffed] : undefined);
  if (!kind) {
    return fail(
      `Nu pot deschide „${short}”. Acceptăm modele 3D GLB, GLTF sau OBJ și planuri PNG, JPG, WebP sau PDF.`,
      `Can't open “${short}”. We accept 3D models (GLB, GLTF, OBJ) and plans (PNG, JPG, WebP, PDF).`,
    );
  }
  if (size <= 0) return fail(`„${short}” e gol.`, `“${short}” is empty.`);
  const max = kind.kind === "model" ? MAX_MODEL_BYTES : MAX_PLAN_BYTES;
  if (size > max) {
    return kind.kind === "model"
      ? fail(`„${short}” are ${mbText(size)} — limita pentru modele 3D e ${max / MB} MB.`, `“${short}” is ${mbText(size)} — 3D models can be up to ${max / MB} MB.`)
      : fail(`„${short}” are ${mbText(size)} — limita pentru planuri e ${max / MB} MB.`, `“${short}” is ${mbText(size)} — plans can be up to ${max / MB} MB.`);
  }

  // The content has to agree with the name.
  const f = kind.format;
  const label = f === "jpeg" ? "JPG" : f.toUpperCase();
  const mismatch = () => fail(`„${short}” nu pare un fișier ${label} valid.`, `“${short}” doesn't look like a valid ${label} file.`);
  switch (f) {
    case "glb":
      if (sniffed !== "glb") return mismatch();
      break;
    case "gltf":
      if (sniffed || firstChar(head) !== "{") return mismatch();
      break;
    case "obj": {
      const c = firstChar(head);
      if (sniffed || looksBinary(head) || c === "{" || c === "<" || c === "") return mismatch();
      break;
    }
    default:
      // A JPG saved as .png is still a picture: accept any image signature for images.
      if (f === "pdf" ? sniffed !== "pdf" : !(sniffed === "png" || sniffed === "jpeg" || sniffed === "webp")) return mismatch();
      if (f !== "pdf" && sniffed && sniffed !== f) return { ok: true, value: { kind: "plan", format: sniffed as PlanFormat } };
  }
  return { ok: true, value: kind };
}

// ─────────────────────────────── glTF ───────────────────────────────

export interface GltfJson {
  asset?: { version?: string };
  buffers?: { uri?: string; byteLength?: number }[];
  images?: { uri?: string; bufferView?: number }[];
  meshes?: { primitives?: { mode?: number; indices?: number; attributes?: Record<string, number> }[] }[];
  accessors?: { count?: number }[];
  nodes?: { mesh?: number; children?: number[]; extensions?: Record<string, unknown> }[];
  extensionsUsed?: string[];
  extensionsRequired?: string[];
}

/** The JSON part of a .gltf / .glb (only the header and the first chunk are read). */
export function readGltfJson(data: ArrayBuffer | Uint8Array, format: "glb" | "gltf"): Checked<GltfJson> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const broken = fail("Modelul glTF e deteriorat sau incomplet.", "The glTF model is damaged or incomplete.");
  try {
    let text: string;
    if (format === "glb") {
      if (bytes.length < 20 || sniff(bytes) !== "glb") return broken;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const version = view.getUint32(4, true);
      if (version < 2) return fail("Modelul folosește glTF 1.0 — exportă-l ca glTF 2.0.", "The model is glTF 1.0 — please export it as glTF 2.0.");
      const chunkLength = view.getUint32(12, true);
      const chunkType = view.getUint32(16, true);
      if (chunkType !== 0x4e4f534a || 20 + chunkLength > bytes.length) return broken; // 'JSON'
      text = new TextDecoder().decode(bytes.subarray(20, 20 + chunkLength));
    } else {
      text = new TextDecoder().decode(bytes);
    }
    const json = JSON.parse(text) as GltfJson;
    if (!json || typeof json !== "object") return broken;
    if (!json.asset?.version || Number.parseFloat(json.asset.version) < 2) {
      return fail("Modelul nu e glTF 2.0 — exportă-l ca glTF 2.0 (GLB).", "The model isn't glTF 2.0 — please export it as glTF 2.0 (GLB).");
    }
    return { ok: true, value: json };
  } catch {
    return broken;
  }
}

/** URIs a glTF would fetch from elsewhere (anything but an embedded data: URI). */
export function externalUris(json: GltfJson): string[] {
  const uris = [...(json.buffers ?? []), ...(json.images ?? [])].map((x) => x?.uri).filter((u): u is string => typeof u === "string");
  return uris.filter((u) => !/^data:/i.test(u.trim()));
}

/** Extensions that need decoders we don't ship (they would be fetched from a CDN). */
const UNSUPPORTED_EXTENSIONS: Record<string, string> = {
  KHR_draco_mesh_compression: "Draco",
  KHR_texture_basisu: "KTX2 / Basis",
};

/** Triangles in a glTF, counted from its accessors (each node that shows a mesh counts once). */
export function estimateGltfTriangles(json: GltfJson): number {
  const acc = json.accessors ?? [];
  const perMesh = (json.meshes ?? []).map((m) =>
    (m?.primitives ?? []).reduce((sum, p) => {
      const mode = p?.mode ?? 4;
      const n = p?.indices !== undefined ? (acc[p.indices]?.count ?? 0) : (acc[p?.attributes?.POSITION ?? -1]?.count ?? 0);
      if (mode === 4) return sum + Math.floor(n / 3); // TRIANGLES
      if (mode === 5 || mode === 6) return sum + Math.max(0, n - 2); // STRIP / FAN
      return sum; // points / lines
    }, 0),
  );
  const nodes = json.nodes ?? [];
  const shown = nodes.filter((n) => typeof n?.mesh === "number");
  if (!shown.length) return perMesh.reduce((a, b) => a + b, 0);
  return shown.reduce((sum, n) => {
    const inst = n.extensions?.EXT_mesh_gpu_instancing as { attributes?: Record<string, number> } | undefined;
    const copies = inst?.attributes ? (acc[Object.values(inst.attributes)[0]]?.count ?? 1) : 1;
    return sum + (perMesh[n.mesh as number] ?? 0) * copies;
  }, 0);
}

/** Everything we check in a glTF before handing it to three.js. */
export function checkGltf(json: GltfJson, name = "model"): Checked<{ triangles: number }> {
  const ext = externalUris(json);
  if (ext.length) {
    return fail(
      `„${name}” trimite la fișiere externe (${ext.length}). Exportă-l ca un singur fișier GLB (sau glTF cu resursele incluse).`,
      `“${name}” refers to external files (${ext.length}). Please export it as a single GLB file (or glTF with embedded resources).`,
    );
  }
  const unsupported = (json.extensionsRequired ?? []).filter((e) => UNSUPPORTED_EXTENSIONS[e]);
  if (unsupported.length) {
    const what = unsupported.map((e) => UNSUPPORTED_EXTENSIONS[e]).join(", ");
    return fail(
      `Modelul e comprimat (${what}) și nu îl putem citi pe dispozitiv. Exportă-l fără compresie.`,
      `The model is compressed (${what}), which we can't read on the device. Please export it without compression.`,
    );
  }
  const triangles = estimateGltfTriangles(json);
  const tooMany = checkTriangles(triangles);
  return tooMany.ok ? { ok: true, value: { triangles } } : tooMany;
}

// ─────────────────────────────── OBJ ───────────────────────────────

/** Triangles an OBJ will become (every n-gon face is n − 2 triangles). */
export function estimateObjTriangles(text: string): number {
  let tris = 0;
  let i = 0;
  const len = text.length;
  while (i < len) {
    let end = text.indexOf("\n", i);
    if (end < 0) end = len;
    // Skip leading blanks.
    let s = i;
    while (s < end && (text.charCodeAt(s) === 32 || text.charCodeAt(s) === 9)) s++;
    if (text.charCodeAt(s) === 102 /* f */ && (text.charCodeAt(s + 1) === 32 || text.charCodeAt(s + 1) === 9)) {
      const verts = text.slice(s + 2, end).trim().split(/\s+/).filter(Boolean).length;
      if (verts >= 3) tris += verts - 2;
    }
    i = end + 1;
  }
  return tris;
}

export function checkTriangles(triangles: number): Checked<{ triangles: number }> {
  if (triangles > MAX_TRIANGLES) {
    const k = (n: number) => `${Math.round(n / 1000)}k`;
    return fail(
      `Modelul are ${k(triangles)} triunghiuri — limita e ${k(MAX_TRIANGLES)}. Simplifică-l (decimate) și încearcă din nou.`,
      `The model has ${k(triangles)} triangles — the limit is ${k(MAX_TRIANGLES)}. Please simplify (decimate) it and try again.`,
    );
  }
  return { ok: true, value: { triangles } };
}

export function describeError(e: unknown): Msg {
  const m = e instanceof Error ? e.message : String(e);
  if (/draco/i.test(m)) return { ro: "Modelul e comprimat Draco — exportă-l fără compresie.", en: "The model uses Draco compression — please export it uncompressed." };
  return { ro: "Nu am putut citi fișierul. E posibil să fie deteriorat.", en: "Couldn't read the file. It may be damaged." };
}
