import type { Part } from "../builders";

/**
 * How a part's own geometry looks in the REAL view, beyond a plain box — pure classification
 * (no renderer), so it's unit-tested without WebGL. `Scene.tsx`'s `PartMesh` turns the result
 * into an actual `THREE.BufferGeometry` (see `./geometries.ts`): bevelled products stay a single
 * mesh (their chamfer is baked into a cached geometry at the part's own real size), while
 * `pedestal`/`postCap` swap in a small compound shape and `cylinder`/`cone`/`sphere` cover the
 * handful of furniture/BBQ/lamp highlights that read wrong as a box (see `Part.shape`).
 *
 * PLAN and EXPLODED stay exact boxes on purpose — a chamfered wireframe would just add clutter
 * to a drawing that's supposed to read as construction lines, not a rendered product.
 */

export type ShapeKind = "box" | "bevelFlat" | "bevelTile" | "bevelSoft" | "bevelCrisp" | "pedestal" | "postCap" | "cylinder" | "cone" | "sphere";

const BEVEL_SHAPES: ReadonlySet<ShapeKind> = new Set(["bevelFlat", "bevelTile", "bevelSoft", "bevelCrisp"]);

export function isBevelShape(shape: ShapeKind): shape is "bevelFlat" | "bevelTile" | "bevelSoft" | "bevelCrisp" {
  return BEVEL_SHAPES.has(shape);
}

/** Absolute, real-world chamfer radius (metres) per bevel class — small, believable arrises
 *  (an actual product's eased edge), not a toy-like fillet. `RoundedBoxGeometry` itself clamps
 *  this to at most half the part's own shortest side, so a hair-thin part never self-intersects.
 *  Ceramic tile gets its own, much smaller class: at tile scale even the "soft" product radius
 *  reads as a rounded, stacked-brick edge rather than a crisp, barely-there eased arris. */
export const BEVEL_RADIUS: Record<"bevelFlat" | "bevelTile" | "bevelSoft" | "bevelCrisp", number> = {
  bevelFlat: 0.0015,
  bevelTile: 0.0007,
  bevelSoft: 0.003,
  bevelCrisp: 0.005,
};

/** Round paving-slab pedestals: base, column and levelling plate — never a plain post. */
const PEDESTAL_LAYERS: ReadonlySet<string> = new Set(["deck_support"]);
/** A small finial instead of a flat lid. */
const CAP_LAYERS: ReadonlySet<string> = new Set(["post_cap"]);
/** Framing/trim elements meant to read as a deliberately-cut, slightly crisper chamfer than a
 *  soft product edge: joists, studs, posts, skirting, kerbs, footings, transition profiles. */
const CRISP_LAYERS: ReadonlySet<string> = new Set([
  "deck_joist",
  "cw_profile",
  "uw_profile",
  "fence_post",
  "skirting_board",
  "paving_edging",
  "kerb_concrete",
  "post_concrete",
  "transition_profile",
]);
/** Finishes that read as a thin, flexible sheet (membrane, bare soil, turf): a bevel would just
 *  be noise on something that isn't a cut, rigid product edge. */
const FLAT_FINISHES: ReadonlySet<string> = new Set(["membrane", "soil", "grass"]);
/** Ceramic tile (floor or wall) gets its own much crisper, smaller bevel class — see BEVEL_RADIUS. */
// Wall tiles are drawn butted together with the joints in their texture: a bevel there only
// catches the light along every seam (dotted white lines), so they stay plain boxes.
const TILE_FINISHES: ReadonlySet<string> = new Set(["tile"]);
/** Below this, any bevel radius would be bigger than the part itself — not worth the geometry. */
const MIN_BEVEL_THICKNESS = 0.006;

/**
 * Which shape a part renders as in the REAL view, full quality (desktop, not `lite`): an
 * explicit `part.shape` (the BBQ/lamp/furniture-leg highlights — see `builders.ts`'s
 * `itemBoxes`) always wins; otherwise a small, deterministic read of the part's own
 * layer/finish/size — no new authoring needed for the bulk of the catalogue. Blueprint,
 * exploded, and phones/low-end devices always get a plain box.
 */
export function shapeFor(part: Part, opts: { real: boolean; lite: boolean | "low" }): ShapeKind {
  if (part.shape) return part.shape;
  if (!opts.real || opts.lite) return "box";
  if (PEDESTAL_LAYERS.has(part.layer)) return "pedestal";
  if (CAP_LAYERS.has(part.layer)) return "postCap";
  if (part.finish?.kind === "tileWall") return "box";
  if (part.finish && TILE_FINISHES.has(part.finish.kind)) return "bevelTile";
  if (Math.min(part.size[0], part.size[1], part.size[2]) < MIN_BEVEL_THICKNESS) return "box";
  if (part.context) return "bevelFlat";
  if (part.finish && FLAT_FINISHES.has(part.finish.kind)) return "bevelFlat";
  if (CRISP_LAYERS.has(part.layer)) return "bevelCrisp";
  return "bevelSoft";
}
