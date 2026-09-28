import type { MaterialRole, Product } from "./types";

/**
 * Technical sketches of the products a customer buys ("fișă tehnică").
 *
 * Every catalogue product maps onto one of a few pre-made, parametrised templates
 * filled with numbers read from its `specs` / `content`. Nothing is invented: a
 * dimension that is not in the data is simply absent and the renderer does not
 * dimension it. Lengths are millimetres; yields are computed only from real specs
 * (coverage × content, content ÷ consumption) and carry the arithmetic with them.
 */

export type Surface = "wood" | "metal" | "plastic";

/** Deck boards, joists, posts, skirting, transition strips, CW/UW profiles, laminate planks. */
export interface LinearSketch {
  template: "linear";
  /** End-section shape; "none" when the second section dimension is not in the data. */
  section: "rect" | "C" | "U" | "none";
  surface: Surface;
  lengthMm: number;
  /** Section dimension seen in the elevation: board width, joist/post depth, skirting height, profile web. */
  faceMm?: number;
  /** The other section dimension: board thickness, joist width. */
  depthMm?: number;
  /** Sheet-steel thickness of a metal profile. */
  wallMm?: number;
  hollow?: boolean;
  /** Planks per pack and m² per pack (laminate). */
  perPack?: number;
  m2PerPack?: number;
}

export interface TileSketch {
  template: "tile";
  widthMm: number;
  heightMm: number;
  perBox?: number;
  m2PerBox?: number;
}

export interface PanelSketch {
  template: "fence_panel";
  widthMm: number;
  heightMm: number;
  opaque: boolean;
  surface: Surface;
}

/** Plasterboard, insulation slabs, abrasive sheets and pads. */
export interface SheetSketch {
  template: "sheet";
  widthMm: number;
  heightMm: number;
  thicknessMm?: number;
  /** Sheets / pieces per sales unit. */
  pieces?: number;
  m2PerPack?: number;
}

export type Vessel = "bucket" | "canister" | "bag" | "box" | "tube" | "roll";

/** m² one sales unit covers. */
export interface AreaYield {
  kind: "area";
  /** min < max only when the stated consumption is a range ("3–4 kg/m²"). */
  min: number;
  max: number;
  /** "coat": per coat (paint, oil, stain); "mm": per 1 mm layer (filler); "total": at the stated rate. */
  per: "coat" | "mm" | "total";
  /** The arithmetic behind it, every figure straight from the specs. Absent when the pack is sold by area. */
  calc?: {
    op: "×" | "÷";
    amount: number;
    amountUnit: "l" | "kg";
    rateMin: number;
    rateMax: number;
    rateUnit: "m²/l" | "m²/kg" | "kg/m²" | "kg/m²/mm";
  };
  /** Recommended number of coats stated by the manufacturer (per-coat yields only). */
  coats?: number;
}

/** A sheet material sold on a roll or folded: its unrolled width × length. */
export interface StripYield {
  kind: "strip";
  widthMm: number;
  lengthMm: number;
}

/** Tapes: running length (and width when known). */
export interface LengthYield {
  kind: "length";
  lengthMm: number;
  widthMm?: number;
}

/** Paint, primer, oil, stain, bags of adhesive/grout/concrete/soil/seed, rolls of foil/membrane/tape/wool. */
export interface ContainerSketch {
  template: "container";
  vessel: Vessel;
  /** What one sales unit holds. */
  amount: number;
  unit: "l" | "kg" | "ml" | "m²" | "m" | "buc";
  /** Axial width of a roll (= the width of the material on it). */
  rollWidthMm?: number;
  thicknessMm?: number;
  yield?: AreaYield | StripYield | LengthYield;
}

export type FastenerPart = "screw" | "dowel" | "spacer" | "clip" | "u_clip" | "bracket" | "cap" | "pedestal";

/** Screws, dowels, tile spacers/clips, panel clips, post caps, deck pedestals. */
export interface FastenerSketch {
  template: "fastener";
  part: FastenerPart;
  diameterMm?: number;
  lengthMm?: number;
  /** Joint width a spacer/clip makes. */
  jointMm?: number;
  tileThicknessMm?: [number, number];
  /** Post size a clip/cap is made for. */
  postMm?: number;
  capShape?: "pyramid" | "flat";
  heightRangeMm?: [number, number];
  maxLoadKg?: number;
  /** Screw drive, e.g. "TX25" (label only). */
  drive?: string;
  /** Pieces per box / bag / set. */
  count?: number;
}

/** Tools: no dimensioned drawing — the UI shows the packshot and key specs instead. */
export interface ToolSketch {
  template: "tool";
}

export type SketchSpec = LinearSketch | TileSketch | PanelSketch | SheetSketch | ContainerSketch | FastenerSketch | ToolSketch;
export type SketchTemplate = SketchSpec["template"];

// ───────────────────────────── spec parsing ─────────────────────────────

type Specs = Product["specs"];

/** A positive finite number from a numeric spec (or a plain numeric string like "12,5"). */
export function specNum(v: Specs[string] | undefined): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : undefined;
  if (typeof v === "string" && /^\s*\d+(?:[.,]\d+)?\s*$/.test(v)) {
    const n = Number(v.replace(",", "."));
    return n > 0 ? n : undefined;
  }
  return undefined;
}

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const toNum = (s: string) => Number(s.replace(",", "."));

/** "45x70", "60 × 60", "7.5x30" → [a, b]. */
export function specPair(v: Specs[string] | undefined): [number, number] | undefined {
  if (typeof v !== "string") return undefined;
  const m = v.match(new RegExp(String.raw`^\s*${NUM}\s*[x×]\s*${NUM}\s*$`, "i"));
  if (!m) return undefined;
  const a = toNum(m[1]);
  const b = toNum(m[2]);
  return a > 0 && b > 0 ? [a, b] : undefined;
}

/** "100x70x25" → [a, b, c]. */
export function specTriple(v: Specs[string] | undefined): [number, number, number] | undefined {
  if (typeof v !== "string") return undefined;
  const m = v.match(new RegExp(String.raw`^\s*${NUM}\s*[x×]\s*${NUM}\s*[x×]\s*${NUM}\s*$`, "i"));
  if (!m) return undefined;
  const t = [toNum(m[1]), toNum(m[2]), toNum(m[3])] as [number, number, number];
  return t.every((n) => n > 0) ? t : undefined;
}

/** 3 → [3, 3]; "3–4" / "35-55" / "0,5–3" → [min, max]. */
export function specRange(v: Specs[string] | undefined): [number, number] | undefined {
  const n = specNum(v);
  if (n) return [n, n];
  if (typeof v !== "string") return undefined;
  const m = v.match(new RegExp(String.raw`^\s*${NUM}\s*[–—-]\s*${NUM}\s*$`));
  if (!m) return undefined;
  const a = toNum(m[1]);
  const b = toNum(m[2]);
  return a > 0 && b >= a ? [a, b] : undefined;
}

/** "Șuruburi … 5 × 60 mm, 250 buc" → [5, 60] (diameter × length). */
export function nameDiameterLength(name: string): [number, number] | undefined {
  const m = name.match(new RegExp(String.raw`${NUM}\s*[x×]\s*${NUM}\s*mm`, "i"));
  if (!m) return undefined;
  const d = toNum(m[1]);
  const l = toNum(m[2]);
  return d > 0 && l > d ? [d, l] : undefined;
}

const mm = (m?: number) => (m === undefined ? undefined : round(m * 1000));
const cmToMm = (cm?: number) => (cm === undefined ? undefined : round(cm * 10));
/** Kill float noise from unit conversion (2.6 m → 2600, not 2600.0000000000005). */
const round = (n: number) => Math.round(n * 1e6) / 1e6;

function surfaceOf(p: Product): Surface {
  const m = String(p.specs.material ?? "").toLowerCase();
  if (p.roles.includes("cw_profile") || p.roles.includes("uw_profile") || /alumin|oțel|otel|inox|metal/.test(m)) return "metal";
  if (/pvc|wpc|compozit|plastic|polim/.test(m)) return "plastic";
  return "wood";
}

// ───────────────────────────── templates ─────────────────────────────

const LINEAR_ROLES: MaterialRole[] = ["deck_board", "deck_joist", "skirting_board", "fence_post", "cw_profile", "uw_profile", "laminate", "transition_profile"];

function linear(p: Product): LinearSketch | undefined {
  const s = p.specs;
  const role = p.roles[0];
  const byRole = LINEAR_ROLES.includes(role);
  // Unknown roles: timber and profiles are sold per piece with a length content.
  if (!byRole && !(p.content.unit === "m" && p.salesUnit === "buc")) return undefined;

  if (specNum(s.boardLengthMm)) {
    return {
      template: "linear",
      section: specNum(s.boardWidthMm) && specNum(s.thicknessMm) ? "rect" : "none",
      surface: "wood",
      lengthMm: specNum(s.boardLengthMm)!,
      faceMm: specNum(s.boardWidthMm),
      depthMm: specNum(s.thicknessMm),
      perPack: specNum(s.boardsPerPack),
      m2PerPack: specNum(s.m2PerPack) ?? (p.content.unit === "m²" ? p.content.amount : undefined),
    };
  }

  const lengthMm =
    mm(specNum(s.lengthM)) ?? specNum(s.lengthMm) ?? cmToMm(specNum(s.lengthCm)) ?? mm(specNum(s.heightM)) ?? (p.content.unit === "m" ? mm(p.content.amount) : undefined);
  if (!lengthMm) return undefined;

  const surface = surfaceOf(p);
  if (role === "cw_profile" || role === "uw_profile") {
    const faceMm = specNum(s.widthMm);
    return { template: "linear", section: faceMm ? (role === "cw_profile" ? "C" : "U") : "none", surface, lengthMm, faceMm, wallMm: specNum(s.steelMm) };
  }

  const section = specPair(s.sectionMm);
  // "45x70" = width × height: 70 is what the side elevation shows, 45 is the depth.
  const faceMm = section ? section[1] : (specNum(s.widthMm) ?? specNum(s.heightMm));
  const depthMm = section ? section[0] : specNum(s.thicknessMm);
  return {
    template: "linear",
    section: faceMm && depthMm ? "rect" : "none",
    surface,
    lengthMm,
    faceMm,
    depthMm,
    hollow: s.hollow === true || undefined,
  };
}

function tile(p: Product): TileSketch | undefined {
  const size = specPair(p.specs.sizeCm);
  if (!size) return undefined;
  return {
    template: "tile",
    widthMm: cmToMm(size[0])!,
    heightMm: cmToMm(size[1])!,
    perBox: specNum(p.specs.piecesPerBox),
    m2PerBox: specNum(p.specs.m2PerBox) ?? (p.content.unit === "m²" ? p.content.amount : undefined),
  };
}

function panel(p: Product): PanelSketch | undefined {
  if (!p.roles.includes("fence_panel") && p.category !== "fencing") return undefined;
  const widthMm = mm(specNum(p.specs.widthM));
  const heightMm = mm(specNum(p.specs.heightM));
  if (!widthMm || !heightMm) return undefined;
  return { template: "fence_panel", widthMm, heightMm, opaque: p.specs.opaque === true, surface: surfaceOf(p) };
}

function sheet(p: Product): SheetSketch | undefined {
  const s = p.specs;
  const pieces = specNum(s.sheets) ?? specNum(s.pieces);
  const slab = specPair(s.slabMm);
  if (slab) {
    return {
      template: "sheet",
      widthMm: slab[0],
      heightMm: slab[1],
      thicknessMm: specNum(s.thicknessMm),
      m2PerPack: specNum(s.m2PerRoll) ?? specNum(s.m2PerPack) ?? (p.content.unit === "m²" ? p.content.amount : undefined),
    };
  }
  const sheetSize = specPair(s.sheetMm);
  if (sheetSize) return { template: "sheet", widthMm: sheetSize[0], heightMm: sheetSize[1], pieces };
  const block = specTriple(s.sizeMm);
  if (block) return { template: "sheet", widthMm: block[0], heightMm: block[1], thicknessMm: block[2], pieces };
  // Boards sold per piece with a face size (plasterboard).
  const w = specNum(s.widthMm);
  const h = specNum(s.heightMm);
  if (w && h && (p.roles.includes("drywall_board") || p.content.unit === "m²")) {
    return { template: "sheet", widthMm: w, heightMm: h, thicknessMm: specNum(s.thicknessMm) };
  }
  return undefined;
}

const FASTENER_ROLES: MaterialRole[] = ["deck_screws", "drywall_screws", "anchor_dowels", "tile_spacers", "fence_fixings", "post_cap", "deck_support"];

function fastener(p: Product): FastenerSketch | undefined {
  const s = p.specs;
  const role = p.roles[0];
  if (!FASTENER_ROLES.includes(role) && p.category !== "fasteners") return undefined;
  const piecesInUnit = p.content.unit === "buc" && p.content.amount > 1 ? p.content.amount : undefined;
  const count = specNum(s.perBox) ?? specNum(s.perBag) ?? specNum(s.perSet) ?? piecesInUnit;

  if (role === "tile_spacers") {
    const clip = /clip/i.test(String(s.shape ?? ""));
    return { template: "fastener", part: clip ? "clip" : "spacer", jointMm: specNum(s.jointMm), tileThicknessMm: specRange(s.tileThicknessMm), count };
  }
  if (role === "fence_fixings") {
    const postMm = specNum(s.postMm);
    return { template: "fastener", part: postMm ? "u_clip" : "bracket", postMm, count };
  }
  if (role === "post_cap") {
    const shape = String(s.shape ?? "");
    return {
      template: "fastener",
      part: "cap",
      postMm: specNum(s.postMm),
      capShape: /piramid/i.test(shape) ? "pyramid" : /plat/i.test(shape) ? "flat" : undefined,
      count,
    };
  }
  if (role === "deck_support") {
    return { template: "fastener", part: "pedestal", heightRangeMm: specRange(s.heightRangeMm), maxLoadKg: specNum(s.maxLoadKg), count };
  }

  // Screws and dowels: d × L from the specs, else from the name ("5 × 60 mm").
  const fromName = nameDiameterLength(p.name);
  const diameterMm = specNum(s.diameterMm) ?? fromName?.[0];
  const lengthMm = specNum(s.lengthMm) ?? fromName?.[1];
  const dowel = role === "anchor_dowels" || /dibl/i.test(p.name);
  if (!dowel && !diameterMm && !lengthMm && !FASTENER_ROLES.includes(role)) return undefined;
  return {
    template: "fastener",
    part: dowel ? "dowel" : "screw",
    diameterMm,
    lengthMm,
    drive: typeof s.drive === "string" && s.drive.trim() ? s.drive.trim().slice(0, 12) : undefined,
    count,
  };
}

function vesselOf(p: Product): Vessel {
  switch (p.salesUnit) {
    case "găleată":
      return "bucket";
    case "bidon":
      return "canister";
    case "sac":
      return "bag";
    case "tub":
      return "tube";
    case "rolă":
      return "roll";
    case "set":
      return p.content.unit === "kg" || p.content.unit === "l" ? "bucket" : "box";
    default:
      return "box";
  }
}

function areaYield(p: Product): AreaYield | undefined {
  const s = p.specs;
  const { amount, unit } = p.content;
  const cover = unit === "l" ? specNum(s.coverageM2PerL) : unit === "kg" ? specNum(s.coverageM2PerKg) : undefined;
  if (cover && (unit === "l" || unit === "kg")) {
    const m2 = round(cover * amount);
    const coats = unit === "l" ? specNum(s.coats) : undefined;
    return {
      kind: "area",
      min: m2,
      max: m2,
      // Coverage for liquids is stated per coat (the calculators multiply area × coats).
      per: unit === "l" ? "coat" : "total",
      calc: { op: "×", amount, amountUnit: unit, rateMin: cover, rateMax: cover, rateUnit: unit === "l" ? "m²/l" : "m²/kg" },
      coats: coats && coats > 1 ? coats : undefined,
    };
  }
  if (unit === "kg") {
    const perM2 = specRange(s.consumptionKgPerM2);
    if (perM2) {
      return {
        kind: "area",
        min: round(amount / perM2[1]),
        max: round(amount / perM2[0]),
        per: "total",
        calc: { op: "÷", amount, amountUnit: "kg", rateMin: perM2[0], rateMax: perM2[1], rateUnit: "kg/m²" },
      };
    }
    const perMm = specNum(s.consumptionKgPerM2PerMm);
    if (perMm) {
      const m2 = round(amount / perMm);
      return { kind: "area", min: m2, max: m2, per: "mm", calc: { op: "÷", amount, amountUnit: "kg", rateMin: perMm, rateMax: perMm, rateUnit: "kg/m²/mm" } };
    }
  }
  const areaPerUnit = unit === "m²" ? amount : (specNum(s.m2PerRoll) ?? specNum(s.m2PerPack));
  if (areaPerUnit) return { kind: "area", min: areaPerUnit, max: areaPerUnit, per: "total" };
  return undefined;
}

function container(p: Product): ContainerSketch {
  const s = p.specs;
  const vessel = vesselOf(p);
  const volumeMl = specNum(s.volumeMl);
  const base: ContainerSketch = {
    template: "container",
    vessel,
    amount: volumeMl ?? p.content.amount,
    unit: volumeMl ? "ml" : p.content.unit,
    thicknessMm: specNum(s.thicknessMm),
  };

  const widthMm = specNum(s.widthMm) ?? mm(specNum(s.widthM));
  const lengthMm = mm(specNum(s.lengthM));
  if (vessel === "roll" && widthMm) base.rollWidthMm = widthMm;

  if (specNum(s.widthM) && lengthMm) {
    // Foil / membrane: the unrolled sheet, to scale.
    return { ...base, yield: { kind: "strip", widthMm: mm(specNum(s.widthM))!, lengthMm } };
  }
  if (lengthMm && (p.content.unit === "m" || vessel === "roll")) {
    return { ...base, yield: { kind: "length", lengthMm, widthMm: specNum(s.widthMm) } };
  }
  const area = areaYield(p);
  return area ? { ...base, yield: area } : base;
}

/** The technical sketch for a catalogue product. Pure; dimensions only from the product's data. */
export function sketchOf(p: Product): SketchSpec {
  if (p.isTool) return { template: "tool" };
  return linear(p) ?? tile(p) ?? panel(p) ?? sheet(p) ?? fastener(p) ?? container(p);
}
