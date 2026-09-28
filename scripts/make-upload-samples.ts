/**
 * Sample files for "bring your own plans and models" (docs/samples/):
 *   house.glb      — a simple 9 × 7 m house with a gable roof, in metres (GLTFExporter)
 *   plan-baie.svg  — an architect-style plan of a 3.20 × 2.40 m bathroom with dimension lines
 * Rasterise the plan with headless Chrome, e.g.
 *   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
 *     --screenshot=docs/samples/plan-baie.png --window-size=1200,900 docs/samples/plan-baie.svg
 *
 * Run: npx tsx scripts/make-upload-samples.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

// GLTFExporter uses FileReader for binary output; Node has Blob but no FileReader.
class NodeFileReader {
  result: ArrayBuffer | string | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) {
    void blob.arrayBuffer().then((b) => {
      this.result = b;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob: Blob) {
    void blob.arrayBuffer().then((b) => {
      this.result = `data:${blob.type || "application/octet-stream"};base64,${Buffer.from(b).toString("base64")}`;
      this.onloadend?.();
    });
  }
}
(globalThis as unknown as { FileReader: unknown }).FileReader = NodeFileReader;

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "samples");
mkdirSync(out, { recursive: true });

function house(): THREE.Group {
  const W = 9; // x
  const D = 7; // z
  const H = 2.8;
  const T = 0.3;
  const g = new THREE.Group();
  g.name = "House";
  const mat = (color: string, name: string) => Object.assign(new THREE.MeshStandardMaterial({ color, roughness: 0.85 }), { name });
  const wall = mat("#e9e3d6", "Plaster");
  const roofMat = mat("#9a4b32", "Roof tiles");
  const wood = mat("#6b4a2e", "Door");
  const glass = mat("#8fb8e0", "Glass");
  const base = mat("#9c978d", "Plinth");
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, name: string) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.name = name;
    g.add(mesh);
    return mesh;
  };
  box(W + 0.2, 0.3, D + 0.2, 0, 0.15, 0, base, "Plinth");
  box(W, H, T, 0, 0.3 + H / 2, -D / 2 + T / 2, wall, "Wall N");
  box(W, H, T, 0, 0.3 + H / 2, D / 2 - T / 2, wall, "Wall S");
  box(T, H, D - 2 * T, -W / 2 + T / 2, 0.3 + H / 2, 0, wall, "Wall W");
  box(T, H, D - 2 * T, W / 2 - T / 2, 0.3 + H / 2, 0, wall, "Wall E");
  // Door and windows on the south side (towards the garden / deck).
  box(1.0, 2.1, 0.06, -1.2, 0.3 + 1.05, D / 2 + 0.01, wood, "Door");
  for (const x of [1.6, 3.2]) box(1.2, 1.3, 0.06, x, 0.3 + 1.5, D / 2 + 0.01, glass, "Window S");
  for (const x of [-2.8, 2.4]) box(1.2, 1.3, 0.06, x, 0.3 + 1.5, -D / 2 - 0.01, glass, "Window N");

  // Gable roof: a prism along x, 0.4 m overhang.
  const o = 0.4;
  const ridge = 2.2;
  const y0 = 0.3 + H;
  const hw = W / 2 + o;
  const hd = D / 2 + o;
  const v = [
    [-hw, y0, -hd], [hw, y0, -hd], [hw, y0 + ridge, 0], [-hw, y0 + ridge, 0], // north slope
    [-hw, y0, hd], [hw, y0, hd], [hw, y0 + ridge, 0], [-hw, y0 + ridge, 0], // south slope
  ];
  const quads = [
    [0, 3, 2, 1],
    [4, 5, 6, 7],
  ];
  const roofPos: number[] = [];
  for (const q of quads) for (const i of [q[0], q[1], q[2], q[0], q[2], q[3]]) roofPos.push(...v[i]);
  // Gable ends: triangles on the east / west walls, up to the ridge.
  const gablePos = [-W / 2, y0, -D / 2, -W / 2, y0, D / 2, -W / 2, y0 + ridge, 0, W / 2, y0, D / 2, W / 2, y0, -D / 2, W / 2, y0 + ridge, 0];
  const mesh = (p: number[], m: THREE.Material, name: string) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    geo.computeVertexNormals();
    const o3 = new THREE.Mesh(geo, m);
    o3.name = name;
    g.add(o3);
  };
  mesh(roofPos, roofMat, "Roof");
  mesh(gablePos, wall, "Gables");
  return g;
}

async function main() {
  const scene = new THREE.Scene();
  scene.add(house());
  const glb = (await new GLTFExporter().parseAsync(scene, { binary: true })) as ArrayBuffer;
  writeFileSync(join(out, "house.glb"), Buffer.from(glb));
  console.log(`house.glb  ${(glb.byteLength / 1024).toFixed(1)} KB`);

  writeFileSync(join(out, "plan-baie.svg"), planSvg());
  console.log("plan-baie.svg");
}

/** 1200 × 900 px, 250 px per metre: the room is 800 × 600 px. */
function planSvg(): string {
  const s = 250;
  const x0 = 200;
  const y0 = 170;
  const w = 3.2 * s;
  const h = 2.4 * s;
  const t = 14;
  const dim = (x1: number, y1: number, x2: number, y2: number, label: string, vertical = false) => {
    const tick = (x: number, y: number) => `<path d="M${x - 7} ${y + 7}L${x + 7} ${y - 7}" stroke="#111" stroke-width="2"/>`;
    const lx = (x1 + x2) / 2;
    const ly = (y1 + y2) / 2;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#111" stroke-width="1.5"/>${tick(x1, y1)}${tick(x2, y2)}
      <text x="${vertical ? lx - 14 : lx}" y="${vertical ? ly : ly - 12}" font-family="Helvetica, Arial" font-size="26" text-anchor="middle" ${vertical ? `transform="rotate(-90 ${lx - 14} ${ly})"` : ""}>${label}</text>`;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
  <rect width="1200" height="900" fill="#fff"/>
  <text x="60" y="70" font-family="Helvetica, Arial" font-size="30" font-weight="700">PLAN PARTER — BAIE</text>
  <text x="60" y="104" font-family="Helvetica, Arial" font-size="20" fill="#444">Scara 1:50 · cote în metri</text>
  <!-- walls (outer line) -->
  <rect x="${x0 - t}" y="${y0 - t}" width="${w + 2 * t}" height="${h + 2 * t}" fill="none" stroke="#111" stroke-width="${2 * t}"/>
  <!-- door opening 0.80 m in the south wall, with its swing -->
  <rect x="${x0 + 0.4 * s}" y="${y0 + h - 2}" width="${0.8 * s}" height="${2 * t + 4}" fill="#fff"/>
  <path d="M${x0 + 0.4 * s} ${y0 + h}L${x0 + 0.4 * s} ${y0 + h - 0.8 * s}" stroke="#111" stroke-width="3"/>
  <path d="M${x0 + 0.4 * s} ${y0 + h - 0.8 * s}A${0.8 * s} ${0.8 * s} 0 0 1 ${x0 + 1.2 * s} ${y0 + h}" fill="none" stroke="#111" stroke-width="1.5" stroke-dasharray="6 5"/>
  <!-- window 1.00 m in the north wall -->
  <rect x="${x0 + 1.6 * s}" y="${y0 - 2 * t}" width="${1.0 * s}" height="${2 * t}" fill="#fff" stroke="#111" stroke-width="2"/>
  <line x1="${x0 + 1.6 * s}" y1="${y0 - t}" x2="${x0 + 2.6 * s}" y2="${y0 - t}" stroke="#111" stroke-width="2"/>
  <!-- fixtures -->
  <rect x="${x0 + 2.3 * s}" y="${y0 + 0.05 * s}" width="${0.85 * s}" height="${1.6 * s}" rx="18" fill="none" stroke="#111" stroke-width="2.5"/>
  <text x="${x0 + 2.72 * s}" y="${y0 + 0.9 * s}" font-family="Helvetica, Arial" font-size="18" text-anchor="middle" fill="#444">cadă</text>
  <ellipse cx="${x0 + 0.35 * s}" cy="${y0 + 0.3 * s}" rx="${0.2 * s}" ry="${0.26 * s}" fill="none" stroke="#111" stroke-width="2.5"/>
  <rect x="${x0 + 0.9 * s}" y="${y0 + 0.02 * s}" width="${0.6 * s}" height="${0.45 * s}" rx="10" fill="none" stroke="#111" stroke-width="2.5"/>
  <!-- room label -->
  <text x="${x0 + 1.3 * s}" y="${y0 + 1.35 * s}" font-family="Helvetica, Arial" font-size="34" font-weight="700" text-anchor="middle">BAIE</text>
  <text x="${x0 + 1.3 * s}" y="${y0 + 1.35 * s + 36}" font-family="Helvetica, Arial" font-size="24" text-anchor="middle">S = 7,68 m²</text>
  <!-- dimension lines (inner faces) -->
  ${dim(x0, y0 + h + 80, x0 + w, y0 + h + 80, "3,20")}
  <line x1="${x0}" y1="${y0 + h + t + 6}" x2="${x0}" y2="${y0 + h + 92}" stroke="#111" stroke-width="1"/>
  <line x1="${x0 + w}" y1="${y0 + h + t + 6}" x2="${x0 + w}" y2="${y0 + h + 92}" stroke="#111" stroke-width="1"/>
  ${dim(x0 + w + 80, y0, x0 + w + 80, y0 + h, "2,40", true)}
  <line x1="${x0 + w + t + 6}" y1="${y0}" x2="${x0 + w + 92}" y2="${y0}" stroke="#111" stroke-width="1"/>
  <line x1="${x0 + w + t + 6}" y1="${y0 + h}" x2="${x0 + w + 92}" y2="${y0 + h}" stroke="#111" stroke-width="1"/>
  ${dim(x0 + 0.4 * s, y0 + h + 40, x0 + 1.2 * s, y0 + h + 40, "0,80")}
  <!-- north arrow -->
  <path d="M1110 90l14 36-14-9-14 9z" fill="#111"/><text x="1110" y="150" font-family="Helvetica, Arial" font-size="20" text-anchor="middle">N</text>
</svg>
`;
}

void main();
