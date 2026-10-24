import type { Build } from "../blueprint/builders";

/**
 * The 3D sketch seen from straight above, as flat shapes for an SVG plan on paper: every part's
 * footprint (parts are axis-aligned boxes), lowest first so the top layer (boards, tiles, pavers)
 * covers the structure under it, plus the plan dimension lines. North is up (x → east, z → south),
 * like the plan editor.
 */
export interface PlanDrawing {
  viewBox: [number, number, number, number];
  rects: { x: number; y: number; w: number; h: number; fill: string; context: boolean }[];
  dims: { x1: number; y1: number; x2: number; y2: number; label: string }[];
}

export function planDrawing(build: Build): PlanDrawing {
  const parts = [...build.parts]
    .filter((p) => p.size[0] > 0.005 && p.size[2] > 0.005 && (p.opacity ?? 1) > 0.15)
    .sort((a, b) => a.pos[1] + a.size[1] / 2 - (b.pos[1] + b.size[1] / 2));
  const rects = parts.map((p) => ({
    x: r3(p.pos[0] - p.size[0] / 2),
    y: r3(p.pos[2] - p.size[2] / 2),
    w: r3(p.size[0]),
    h: r3(p.size[2]),
    fill: p.color,
    context: Boolean(p.context),
  }));
  // Height dimensions are vertical: nothing to show from above.
  const dims = build.dims
    .filter((d) => Math.hypot(d.to[0] - d.from[0], d.to[2] - d.from[2]) > 0.05)
    .map((d) => ({ x1: r3(d.from[0]), y1: r3(d.from[2]), x2: r3(d.to[0]), y2: r3(d.to[2]), label: d.label }));

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const r of rects) {
    grow(r.x, r.y);
    grow(r.x + r.w, r.y + r.h);
  }
  for (const d of dims) {
    grow(d.x1, d.y1);
    grow(d.x2, d.y2);
  }
  if (!Number.isFinite(minX)) return { viewBox: [0, 0, 1, 1], rects: [], dims: [] };
  // Room for the dimension labels around the drawing.
  const pad = Math.max(0.35, 0.06 * Math.max(maxX - minX, maxY - minY));
  return { viewBox: [r3(minX - pad), r3(minY - pad), r3(maxX - minX + 2 * pad), r3(maxY - minY + 2 * pad)], rects, dims };
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
