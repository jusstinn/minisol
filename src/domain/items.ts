import type { ProjectType } from "./calculators";
import type { MaterialRole } from "./types";

/**
 * Things the customer (or the assistant) can place in the sketch — a toilet by the
 * door, a lamp on the left wall, a table on the deck. Each kind has a footprint, a
 * mounting (floor / wall / ceiling) and, when the retailer sells it, a material role:
 * placing it then adds the product to the shopping list, sized by count. Kinds without
 * a role (sofa, bed…) are drawn as context only.
 */

export type ItemKind =
  | "toilet"
  | "sink"
  | "shower"
  | "bathtub"
  | "mirror"
  | "towel_radiator"
  | "washing_machine"
  | "ceiling_lamp"
  | "wall_lamp"
  | "floor_lamp"
  | "garden_light"
  | "table"
  | "chair"
  | "sofa"
  | "bed"
  | "wardrobe"
  | "tv"
  | "radiator"
  | "plant"
  | "planter"
  | "bbq"
  | "lounger"
  | "parasol";

export type Mount = "floor" | "wall" | "ceiling";

export interface ItemSpec {
  label: string;
  labelEn: string;
  /** Footprint width (along its wall) × depth, and height, in metres. */
  w: number;
  d: number;
  h: number;
  mount: Mount;
  /** Height of the bottom above the floor for wall items. */
  elevation?: number;
  color: string;
  /** Product role when the retailer sells it (outdoor/indoor may differ). */
  role?: MaterialRole | ((type: ProjectType) => MaterialRole | undefined);
  outdoor?: boolean;
  indoor?: boolean;
}

const OUTDOOR: ProjectType[] = ["deck", "lawn", "fence"];

export const ITEMS: Record<ItemKind, ItemSpec> = {
  toilet: { label: "Vas WC", labelEn: "Toilet", w: 0.38, d: 0.66, h: 0.8, mount: "floor", color: "#f4f4f2", role: "toilet", indoor: true },
  sink: { label: "Lavoar", labelEn: "Washbasin", w: 0.55, d: 0.45, h: 0.85, mount: "floor", color: "#f4f4f2", role: "washbasin", indoor: true },
  shower: { label: "Cabină de duș", labelEn: "Shower enclosure", w: 0.9, d: 0.9, h: 2.0, mount: "floor", color: "#cfe4f2", role: "shower_enclosure", indoor: true },
  bathtub: { label: "Cadă", labelEn: "Bathtub", w: 1.7, d: 0.7, h: 0.56, mount: "floor", color: "#f4f4f2", role: "bathtub", indoor: true },
  mirror: { label: "Oglindă", labelEn: "Mirror", w: 0.6, d: 0.04, h: 0.8, mount: "wall", elevation: 1.2, color: "#c9dbe6", role: "bathroom_mirror", indoor: true },
  towel_radiator: { label: "Calorifer port-prosop", labelEn: "Towel radiator", w: 0.5, d: 0.08, h: 1.2, mount: "wall", elevation: 0.3, color: "#e9e9e6", role: "towel_radiator", indoor: true },
  washing_machine: { label: "Mașină de spălat", labelEn: "Washing machine", w: 0.6, d: 0.6, h: 0.85, mount: "floor", color: "#f1f1ee", indoor: true },
  ceiling_lamp: { label: "Plafonieră", labelEn: "Ceiling light", w: 0.4, d: 0.4, h: 0.08, mount: "ceiling", color: "#fff4cf", role: "ceiling_light", indoor: true },
  wall_lamp: { label: "Aplică", labelEn: "Wall light", w: 0.18, d: 0.12, h: 0.22, mount: "wall", elevation: 1.75, color: "#fff4cf", role: "wall_light", indoor: true },
  floor_lamp: { label: "Lampadar", labelEn: "Floor lamp", w: 0.36, d: 0.36, h: 1.6, mount: "floor", color: "#2f2f2f", role: "floor_lamp", indoor: true },
  garden_light: { label: "Lampă de grădină", labelEn: "Garden light", w: 0.14, d: 0.14, h: 0.5, mount: "floor", color: "#3a3a3a", role: "garden_light", outdoor: true },
  table: {
    label: "Masă",
    labelEn: "Table",
    w: 1.6,
    d: 0.9,
    h: 0.75,
    mount: "floor",
    color: "#8a6a4a",
    // Outdoors the retailer sells a table + 4 chairs set; indoors it's context.
    role: (t) => (OUTDOOR.includes(t) ? "garden_furniture" : undefined),
  },
  chair: { label: "Scaun", labelEn: "Chair", w: 0.48, d: 0.5, h: 0.9, mount: "floor", color: "#8a6a4a" },
  sofa: { label: "Canapea", labelEn: "Sofa", w: 2.0, d: 0.9, h: 0.85, mount: "floor", color: "#8c93a0", indoor: true },
  bed: { label: "Pat", labelEn: "Bed", w: 1.6, d: 2.05, h: 0.5, mount: "floor", color: "#d9d2c3", indoor: true },
  wardrobe: { label: "Dulap", labelEn: "Wardrobe", w: 1.2, d: 0.6, h: 2.1, mount: "floor", color: "#cbb79a", indoor: true },
  tv: { label: "Televizor", labelEn: "TV", w: 1.25, d: 0.08, h: 0.72, mount: "wall", elevation: 1.0, color: "#1d1f22", indoor: true },
  radiator: { label: "Calorifer", labelEn: "Radiator", w: 0.8, d: 0.1, h: 0.6, mount: "wall", elevation: 0.15, color: "#ededea", indoor: true },
  plant: { label: "Plantă", labelEn: "Plant", w: 0.45, d: 0.45, h: 1.0, mount: "floor", color: "#5d8f4e" },
  planter: { label: "Jardinieră", labelEn: "Planter", w: 0.8, d: 0.35, h: 0.4, mount: "floor", color: "#6b4a33", role: "planter", outdoor: true },
  bbq: { label: "Grătar", labelEn: "BBQ grill", w: 0.9, d: 0.6, h: 1.1, mount: "floor", color: "#26282b", role: "bbq", outdoor: true },
  lounger: { label: "Șezlong", labelEn: "Sun lounger", w: 0.7, d: 1.9, h: 0.4, mount: "floor", color: "#d8cfbf", role: "sun_lounger", outdoor: true },
  parasol: { label: "Umbrelă de soare", labelEn: "Parasol", w: 0.4, d: 0.4, h: 2.4, mount: "floor", color: "#e8dcc4", role: "parasol", outdoor: true },
};

export const ITEM_KINDS = Object.keys(ITEMS) as ItemKind[];

export function itemRole(kind: ItemKind, type: ProjectType): MaterialRole | undefined {
  const r = ITEMS[kind].role;
  return typeof r === "function" ? r(type) : r;
}

/** Which items make sense to offer in the palette for a project type. */
export function paletteFor(type: ProjectType): ItemKind[] {
  switch (type) {
    case "tiling":
      return ["toilet", "sink", "shower", "bathtub", "mirror", "towel_radiator", "washing_machine", "ceiling_lamp"];
    case "paint_room":
    case "laminate_floor":
      return ["ceiling_lamp", "wall_lamp", "floor_lamp", "sofa", "bed", "wardrobe", "table", "tv", "radiator", "plant"];
    case "drywall_partition":
      return ["wall_lamp", "tv", "radiator", "wardrobe", "sofa"];
    case "deck":
      return ["table", "lounger", "parasol", "bbq", "planter", "garden_light", "plant"];
    case "lawn":
      return ["table", "lounger", "parasol", "bbq", "garden_light", "planter"];
    case "fence":
      return ["garden_light", "planter", "bbq", "table"];
  }
}

/** A placed item. x/z = centre of the footprint in plan metres; rot in 90° steps (0 = back to the north). */
export interface Item {
  id: string;
  kind: ItemKind;
  x: number;
  z: number;
  rot: 0 | 90 | 180 | 270;
  /** Zone the item stands in (zone-based projects). */
  zone?: string;
}

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Footprint size on the plan after rotation. */
export function footprint(kind: ItemKind, rot: number): { w: number; d: number } {
  const s = ITEMS[kind];
  return rot % 180 === 0 ? { w: s.w, d: s.d } : { w: s.d, d: s.w };
}

export function itemRect(it: Pick<Item, "kind" | "x" | "z" | "rot">): Rect {
  const f = footprint(it.kind, it.rot);
  return { minX: it.x - f.w / 2, maxX: it.x + f.w / 2, minZ: it.z - f.d / 2, maxZ: it.z + f.d / 2 };
}

export function overlaps(a: Rect, b: Rect, gap = 0.02): boolean {
  return a.minX < b.maxX - gap && b.minX < a.maxX - gap && a.minZ < b.maxZ - gap && b.minZ < a.maxZ - gap;
}

/** Rotation that puts the item's back against a wall. */
export const ROT_FOR_WALL = { n: 0, e: 270, s: 180, w: 90 } as const;

/** Local (x right, z front) → world offset for a rotation. Back of the item is local −z. */
export function rotXZ(x: number, z: number, rot: number): [number, number] {
  switch (rot) {
    case 90:
      return [z, -x];
    case 180:
      return [-x, -z];
    case 270:
      return [-z, x];
    default:
      return [x, z];
  }
}

/** Height band an item occupies above its floor (so a mirror can hang above a washbasin). */
export function verticalRange(kind: ItemKind, ceilingY: number | null): [number, number] {
  const s = ITEMS[kind];
  if (s.mount === "ceiling") {
    const top = ceilingY ?? 2.6;
    return [top - s.h, top];
  }
  if (s.mount === "wall") return [s.elevation ?? 1, (s.elevation ?? 1) + s.h];
  return [0, s.h];
}
