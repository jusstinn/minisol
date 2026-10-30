import type { Part } from "./builders";
import type { FinishKind } from "./textures";

/**
 * Per-part appearance variation for the REAL view: no two boards, pavers or tiles in a real
 * project are quite the same tone, and two boards cut from different planks never show the same
 * grain at the same spot. Seeded from `part.id` alone, so a part keeps its look across renders,
 * edits and reloads (no flicker), and applied only in the render layer — the builders, the
 * quote and the exports never see it.
 *
 *   dh / ds / dl — hue (turns), saturation and lightness offsets, a few per cent at most;
 *   du / dv      — texture offset in repeats (0 where shifting would misalign a joint or groove).
 */
export interface PartVariation {
  dh: number;
  ds: number;
  dl: number;
  du: number;
  dv: number;
}

const NONE: PartVariation = { dh: 0, ds: 0, dl: 0, du: 0, dv: 0 };

interface Range {
  h: number;
  s: number;
  l: number;
  /** May the grain slide along U / V? Only where the texture has no joints in that direction. */
  u: boolean;
  v: boolean;
}

/** Natural materials vary more than manufactured ones; grout-lined textures never slide. */
const RANGE: Partial<Record<FinishKind, Range>> = {
  // Grain runs along U and wraps seamlessly there; across V the canvas edge is the board's own edge.
  wood: { h: 0.008, s: 0.05, l: 0.045, u: true, v: false },
  wpc: { h: 0.004, s: 0.025, l: 0.025, u: true, v: false },
  fenceBoard: { h: 0.007, s: 0.04, l: 0.04, u: true, v: true }, // tileable noise both ways
  fence: { h: 0.006, s: 0.03, l: 0.03, u: false, v: false },
  paver: { h: 0.006, s: 0.03, l: 0.035, u: false, v: false },
  tile: { h: 0.002, s: 0.01, l: 0.015, u: false, v: false },
  tileWall: { h: 0.002, s: 0.01, l: 0.012, u: false, v: false },
};

/** FNV-1a: the same id always gives the same 32-bit number. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** `n` decorrelated uniforms in [0, 1) from one seed (a few rounds of an integer mix). */
function uniforms(seed: number, n: number): number[] {
  const out: number[] = [];
  let x = seed || 1;
  for (let i = 0; i < n; i++) {
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
    x ^= x >>> 16;
    out.push((x >>> 0) / 4294967296);
  }
  return out;
}

export function partVariation(part: Pick<Part, "id" | "finish" | "context">): PartVariation {
  if (part.context || !part.finish) return NONE;
  const r = RANGE[part.finish.kind];
  if (!r) return NONE;
  const [a, b, c, d, e, f] = uniforms(hash(part.id), 6);
  // Lightness is the most visible: a gentle triangular distribution (most parts near the middle).
  const tri = (a + b) / 2 - 0.5;
  return {
    dh: (c - 0.5) * 2 * r.h,
    ds: (d - 0.5) * 2 * r.s,
    dl: tri * 2 * r.l,
    du: r.u ? e : 0,
    dv: r.v ? f : 0,
  };
}

export const hasVariation = (v: PartVariation) => v.dh !== 0 || v.ds !== 0 || v.dl !== 0 || v.du !== 0 || v.dv !== 0;
