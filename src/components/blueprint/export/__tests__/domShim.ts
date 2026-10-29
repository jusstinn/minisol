import { crc32, deflateSync } from "node:zlib";

/**
 * Just enough of a browser for the exporters to run in node: a `document.createElement("canvas")`
 * whose 2D context really stores pixels (fillRect with a flat colour, drawImage with resampling and
 * flips, get/put/createImageData) and encodes a real PNG in `toBlob`, plus a `FileReader`. Drawing
 * calls it can't honour (strokes, gradients, arcs…) are accepted and ignored, so textures.ts'
 * procedural drawing runs unchanged and simply leaves those canvases flat.
 *
 * It exists for the tests only; the real thing runs in the browser (QA covers that).
 */

type Rgba = Uint8ClampedArray;

class CanvasBase {}

function parseColor(c: unknown): [number, number, number, number] | null {
  if (typeof c !== "string") return null;
  const m = /^#([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

export class FakeCanvas extends CanvasBase {
  private w = 300;
  private h = 150;
  pixels: Rgba = new Uint8ClampedArray(300 * 150 * 4);
  private ctx: FakeContext | null = null;

  get width() {
    return this.w;
  }
  set width(v: number) {
    this.w = v;
    this.pixels = new Uint8ClampedArray(this.w * this.h * 4);
  }
  get height() {
    return this.h;
  }
  set height(v: number) {
    this.h = v;
    this.pixels = new Uint8ClampedArray(this.w * this.h * 4);
  }

  getContext(kind: string) {
    if (kind !== "2d") return null;
    this.ctx ??= new FakeContext(this);
    // Unknown drawing calls and properties are accepted and ignored.
    return new Proxy(this.ctx, {
      get: (t, k) => (k in t ? Reflect.get(t, k) : () => ({ addColorStop() {} })),
      has: (t, k) => k in t,
    });
  }

  toBlob(cb: (b: Blob | null) => void, type = "image/png") {
    const png = encodePng(this.w, this.h, this.pixels);
    queueMicrotask(() => cb(new Blob([new Uint8Array(png)], { type })));
  }

  toDataURL(type = "image/png") {
    return `data:${type};base64,${encodePng(this.w, this.h, this.pixels).toString("base64")}`;
  }
}

class FakeContext {
  fillStyle: unknown = "#000000";
  imageSmoothingEnabled = true;
  imageSmoothingQuality = "low";
  private flipY = false;
  constructor(private canvas: FakeCanvas) {}

  translate() {}
  scale(_sx: number, sy: number) {
    if (sy < 0) this.flipY = !this.flipY;
  }

  fillRect(x: number, y: number, w: number, h: number) {
    const rgba = parseColor(this.fillStyle);
    if (!rgba) return;
    const c = this.canvas;
    for (let yy = Math.max(0, y); yy < Math.min(c.height, y + h); yy++) for (let xx = Math.max(0, x); xx < Math.min(c.width, x + w); xx++) c.pixels.set(rgba, (yy * c.width + xx) * 4);
  }

  drawImage(src: FakeCanvas, ...a: number[]) {
    const c = this.canvas;
    const [dx, dy, dw, dh] = a.length >= 4 ? a : [a[0] ?? 0, a[1] ?? 0, src.width, src.height];
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const tx = Math.round(dx + x);
        const ty = Math.round(this.flipY ? c.height - 1 - (dy + y) : dy + y);
        if (tx < 0 || ty < 0 || tx >= c.width || ty >= c.height) continue;
        // Nearest neighbour is plenty for a test double.
        const sx = Math.min(src.width - 1, Math.floor((x / dw) * src.width));
        const sy = Math.min(src.height - 1, Math.floor((y / dh) * src.height));
        c.pixels.set(src.pixels.subarray((sy * src.width + sx) * 4, (sy * src.width + sx) * 4 + 4), (ty * c.width + tx) * 4);
      }
    }
  }

  getImageData(x: number, y: number, w: number, h: number) {
    const c = this.canvas;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let yy = 0; yy < h; yy++) data.set(c.pixels.subarray(((y + yy) * c.width + x) * 4, ((y + yy) * c.width + x + w) * 4), yy * w * 4);
    return { data, width: w, height: h };
  }

  createImageData(w: number, h: number) {
    return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  }

  putImageData(img: { data: Rgba; width: number; height: number }, x: number, y: number) {
    const c = this.canvas;
    for (let yy = 0; yy < img.height; yy++) c.pixels.set(img.data.subarray(yy * img.width * 4, (yy + 1) * img.width * 4), ((y + yy) * c.width + x) * 4);
  }
}

function chunk(type: string, body: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}

/** A real, valid PNG (8-bit RGBA, no filtering). */
export function encodePng(w: number, h: number, rgba: Rgba): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (1 + w * 4) + 1);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** Width and height from a PNG's IHDR. */
export function pngSize(bytes: Uint8Array): { w: number; h: number } {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { w: v.getUint32(16), h: v.getUint32(20) };
}

class FakeFileReader {
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
      this.result = `data:${blob.type};base64,${Buffer.from(b).toString("base64")}`;
      this.onloadend?.();
    });
  }
}

/** Install the browser pieces on globalThis; returns the function that removes them again. */
export function installDomShim(): () => void {
  const g = globalThis as Record<string, unknown>;
  const saved = { document: g.document, HTMLCanvasElement: g.HTMLCanvasElement, FileReader: g.FileReader };
  g.document = { createElement: (tag: string) => (tag === "canvas" ? new FakeCanvas() : {}) };
  g.HTMLCanvasElement = CanvasBase;
  g.FileReader = FakeFileReader;
  return () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete g[k];
      else g[k] = v;
    }
  };
}
