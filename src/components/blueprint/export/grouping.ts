import type { FinishKind } from "../textures";
import type { PlacedPart } from "./placement";

/**
 * Parts that look the same share ONE material and so end up in ONE merged mesh — the file stays
 * small (a 366-paver path is a single mesh, not 366 nodes) and AR viewers draw a few calls instead
 * of hundreds. What makes two parts "the same":
 *
 * - the finish KIND (wood, tile, paver…: it decides the baked textures and the PBR numbers), and
 * - the colour and opacity.
 *
 * Everything else a part's finish says — texture repeat, unit, axes — is baked into the geometry's
 * UVs (see `scene.ts`), so a 4 m board and a 1.2 m board of the same wood still share a material.
 * Pure: no THREE, no DOM.
 */

export interface MaterialSpec {
  /** Stable grouping key. */
  key: string;
  /** The procedural finish, or null for a plain painted/flat colour. */
  kind: FinishKind | null;
  /** Lower-case CSS colour (the part's own). */
  color: string;
  opacity: number;
}

export function materialSpecFor(p: Pick<PlacedPart, "part">): MaterialSpec {
  const { part } = p;
  const kind = part.finish?.kind ?? null;
  const color = part.color.trim().toLowerCase();
  const opacity = Math.round(Math.min(1, Math.max(0, part.opacity ?? 1)) * 100) / 100;
  return { key: `${kind ?? "flat"}|${color}|${opacity}`, kind, color, opacity };
}

export interface MaterialGroup {
  spec: MaterialSpec;
  parts: PlacedPart[];
}

/** Placed parts bucketed by material, in first-seen order (so the output is deterministic). */
export function groupByMaterial(placed: readonly PlacedPart[]): MaterialGroup[] {
  const groups = new Map<string, MaterialGroup>();
  for (const p of placed) {
    const spec = materialSpecFor(p);
    const g = groups.get(spec.key);
    if (g) g.parts.push(p);
    else groups.set(spec.key, { spec, parts: [p] });
  }
  return [...groups.values()];
}
