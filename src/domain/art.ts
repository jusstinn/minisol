import type { MaterialRole, Product, QualityTier } from "./types";

/**
 * Illustrated "packshot" description for a product. The demo catalogue has no
 * photos, so the UI draws each item from this spec (bucket, sack, box, board…),
 * tinted with the product's real colour and labelled with brand + pack size.
 * Swap for real image URLs when the retailer's catalogue is connected.
 */

export type ArtKind = "bucket" | "bag" | "box" | "roll" | "plank" | "sheet" | "panel" | "tube" | "tool" | "power";
export type ArtPattern = "wood" | "tile" | "dots" | "grass" | "metal" | "plain";
export type ToolGlyph = "drill" | "saw" | "trowel" | "roller" | "brush" | "level" | "tape" | "knife" | "safety" | "ladder" | "garden" | "misc";

export interface ArtSpec {
  kind: ArtKind;
  brand: string;
  /** Pack content, e.g. "10 l", "25 kg", "2,13 m²". */
  label: string;
  /** Product colour (paint colour, wood decor, tile colour…). */
  color: string;
  /** Brand colour for the label band. */
  brandColor: string;
  quality: QualityTier;
  pattern: ArtPattern;
  glyph?: ToolGlyph;
}

const COLOR_WORDS: [RegExp, string][] = [
  [/antracit|negru/, "#34373b"],
  [/toamn/, "#a4714b"],
  [/roșu|rosu|cărămiziu|caramiziu|teracot/, "#a5533d"],
  [/gri perl/, "#c9c9c4"],
  [/gri/, "#9c9fa3"],
  [/alb/, "#f3f0e9"],
  [/bej|nisip|bahama/, "#d8c6a5"],
  [/albastru/, "#a9c6e8"],
  [/verde|salvie/, "#9cb29a"],
  [/roz/, "#e7b9b4"],
  [/maro|nuc|palisandru/, "#7b5334"],
  [/teak/, "#9a6a3c"],
  [/pin|natur|stejar natur|stejar nordic/, "#d2aa76"],
  [/stejar gri/, "#a79b8b"],
  [/stejar/, "#c19466"],
  [/transparent|incolor|lăptos/, "#e8eef2"],
];

const CATEGORY_COLOR: Record<string, string> = {
  paint: "#f3f0e9",
  flooring: "#c19466",
  tiles: "#d8d4cc",
  building: "#a8a39a",
  drywall: "#ecebe6",
  insulation: "#e9c343",
  wood: "#c9935a",
  garden: "#6f9b57",
  fencing: "#a8743f",
  fasteners: "#9aa3ad",
  adhesives: "#b9b5ad",
};

const BRAND_PALETTE = ["#e4572e", "#2f6bff", "#17a398", "#f2a541", "#6c4ab6", "#d7263d", "#1b998b", "#3d5a80", "#c05746", "#4f772d", "#ff8c42", "#0f4c5c"];

function brandColor(brand: string): string {
  let h = 0;
  for (let i = 0; i < brand.length; i++) h = (h * 31 + brand.charCodeAt(i)) >>> 0;
  return BRAND_PALETTE[h % BRAND_PALETTE.length];
}

const PLANKS: MaterialRole[] = ["deck_board", "deck_joist", "skirting_board", "fence_post", "cw_profile", "uw_profile"];
const GLYPHS: Partial<Record<MaterialRole, ToolGlyph>> = {
  cordless_drill: "drill",
  mixing_paddle: "drill",
  jigsaw: "saw",
  mitre_saw: "saw",
  hand_saw: "saw",
  notched_trowel: "trowel",
  grout_float: "trowel",
  putty_knife: "trowel",
  paint_roller: "roller",
  paint_tray: "roller",
  lawn_roller: "roller",
  paint_brush: "brush",
  spirit_level: "level",
  measuring_tape: "tape",
  utility_knife: "knife",
  tin_snips: "knife",
  tile_cutter: "knife",
  work_gloves: "safety",
  safety_glasses: "safety",
  dust_mask: "safety",
  knee_pads: "safety",
  ladder: "ladder",
  garden_rake: "garden",
  spade: "garden",
  wheelbarrow: "garden",
  garden_hose: "garden",
  sprinkler: "garden",
  post_hole_digger: "garden",
};

function fmt(n: number): string {
  return n.toLocaleString("ro-RO", { maximumFractionDigits: 3 });
}

export function artOf(p: Product): ArtSpec {
  const role = p.roles[0];
  const colorWord = String(p.specs.color ?? p.specs.decor ?? p.specs.material ?? "").toLowerCase();
  const color = COLOR_WORDS.find(([re]) => re.test(colorWord))?.[1] ?? CATEGORY_COLOR[p.category] ?? "#d9d4c9";
  const base = { brand: p.brand, brandColor: brandColor(p.brand), quality: p.quality, color };
  const label = p.content.unit === "buc" ? (p.content.amount > 1 ? `${fmt(p.content.amount)} buc` : "") : `${fmt(p.content.amount)} ${p.content.unit}`;

  if (p.isTool) {
    return { ...base, kind: p.category === "power_tools" ? "power" : "tool", label: "", pattern: "plain", glyph: GLYPHS[role] ?? "misc" };
  }
  if (role === "drywall_board") return { ...base, kind: "sheet", label, pattern: "plain" };
  if (role === "fence_panel") return { ...base, kind: "panel", label, pattern: "wood" };
  if (PLANKS.includes(role)) {
    const metal = role === "cw_profile" || role === "uw_profile";
    return { ...base, kind: "plank", label, pattern: metal ? "metal" : "wood", color: metal ? "#b8c0c8" : color };
  }
  if (p.salesUnit === "găleată" || p.salesUnit === "bidon") return { ...base, kind: "bucket", label, pattern: "plain" };
  if (p.salesUnit === "sac") return { ...base, kind: "bag", label, pattern: "plain" };
  if (p.salesUnit === "tub" || role === "sanitary_silicone") return { ...base, kind: "tube", label, pattern: "plain" };
  if (p.salesUnit === "rolă") return { ...base, kind: "roll", label, pattern: role === "mineral_wool" ? "plain" : "plain" };
  const pattern: ArtPattern =
    role === "laminate" ? "wood" : role === "floor_tiles" || role === "wall_tiles" ? "tile" : role === "grass_seed" || role === "lawn_fertilizer" ? "grass" : "dots";
  return { ...base, kind: "box", label, pattern };
}
