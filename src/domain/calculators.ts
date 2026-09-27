import type { BaseUnit, Lang, MaterialRole, Requirement } from "./types";
import { MATERIAL_ROLES } from "./types";

/**
 * Deterministic material calculators. The LLM gathers dimensions from the customer;
 * these functions turn them into quantities using standard trade rules of thumb.
 * All assumptions are returned so the customer can see *why* a quantity was chosen.
 */

export const PROJECT_TYPES = [
  "paint_room",
  "laminate_floor",
  "tiling",
  "deck",
  "fence",
  "drywall_partition",
  "lawn",
] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export interface Measurement {
  label: string;
  value: number;
  unit: string;
}

export interface CalculationResult {
  projectType: ProjectType;
  title: string;
  inputs: Record<string, unknown>;
  measurements: Measurement[];
  requirements: Requirement[];
  assumptions: string[];
  estimate: { hoursMin: number; hoursMax: number; difficulty: 1 | 2 | 3 | 4 | 5; people: 1 | 2 };
  safetyNotes: string[];
}

export class CalculatorInputError extends Error {}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

function positive(name: string, v: unknown, { max = 1000 }: { max?: number } = {}): number {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) {
    throw new CalculatorInputError(`"${name}" must be a positive number (got ${JSON.stringify(v)})`);
  }
  if (n > max) throw new CalculatorInputError(`"${name}" looks too large (${n}); max is ${max}`);
  return n;
}

function nonNegInt(name: string, v: unknown, fallback: number, max = 50): number {
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > max) {
    throw new CalculatorInputError(`"${name}" must be a whole number between 0 and ${max}`);
  }
  return n;
}

function bool(v: unknown, fallback: boolean): boolean {
  if (v === undefined || v === null) return fallback;
  if (typeof v === "string") return v === "true" || v === "yes" || v === "da";
  return Boolean(v);
}

class Builder {
  requirements: Requirement[] = [];
  assumptions: string[] = [];
  measurements: Measurement[] = [];
  safetyNotes: string[] = [];
  constructor(private lang: Lang) {}

  t(ro: string, en: string) {
    return this.lang === "en" ? en : ro;
  }

  measure(ro: string, en: string, value: number, unit: string) {
    this.measurements.push({ label: this.t(ro, en), value: r2(value), unit });
  }

  assume(ro: string, en: string) {
    this.assumptions.push(this.t(ro, en));
  }

  safety(ro: string, en: string) {
    this.safetyNotes.push(this.t(ro, en));
  }

  need(
    role: MaterialRole,
    quantity: number,
    basisRo: string,
    basisEn: string,
    extra: Partial<Pick<Requirement, "optional" | "areaToCover" | "match">> = {},
  ) {
    const unit: BaseUnit = MATERIAL_ROLES[role].unit;
    const q = unit === "buc" ? Math.ceil(quantity - 1e-9) : r2(quantity);
    if (q <= 0) return;
    this.requirements.push({
      role,
      quantity: q,
      unit,
      basis: this.t(basisRo, basisEn),
      ...extra,
    });
  }

  tool(role: MaterialRole, count = 1, optional = false) {
    this.requirements.push({
      role,
      quantity: count,
      unit: "buc",
      basis: this.t("unealtă", "tool"),
      isTool: true,
      optional,
    });
  }
}

type Params = Record<string, unknown>;

// ───────────────────────────── paint ─────────────────────────────
function paintRoom(p: Params, lang: Lang): CalculationResult {
  const b = new Builder(lang);
  const L = positive("lengthM", p.lengthM, { max: 50 });
  const W = positive("widthM", p.widthM, { max: 50 });
  const H = p.heightM === undefined ? 2.6 : positive("heightM", p.heightM, { max: 8 });
  const doors = nonNegInt("doors", p.doors, 1);
  const windows = nonNegInt("windows", p.windows, 1);
  const ceiling = bool(p.paintCeiling, true);
  const coats = nonNegInt("coats", p.coats, 2, 4) || 2;
  const surface = (["fresh_plaster", "repaint", "dark_to_light"] as const).includes(p.surface as never)
    ? (p.surface as "fresh_plaster" | "repaint" | "dark_to_light")
    : "repaint";

  const perimeter = 2 * (L + W);
  const walls = Math.max(0, perimeter * H - doors * 1.89 - windows * 1.8);
  const ceil = ceiling ? L * W : 0;
  const area = walls + ceil;

  b.measure("Suprafață pereți (fără uși/ferestre)", "Wall area (excl. doors/windows)", walls, "m²");
  if (ceiling) b.measure("Suprafață tavan", "Ceiling area", ceil, "m²");
  b.measure("Total de vopsit", "Total to paint", area, "m²");
  if (p.heightM === undefined) b.assume("Înălțime cameră presupusă 2,6 m.", "Assumed ceiling height of 2.6 m.");
  b.assume(
    `Scăzute ${doors} uși (0,9×2,1 m) și ${windows} ferestre (1,2×1,5 m).`,
    `Deducted ${doors} door(s) (0.9×2.1 m) and ${windows} window(s) (1.2×1.5 m).`,
  );
  const effCoats = surface === "dark_to_light" ? Math.max(coats, 3) : coats;
  b.assume(
    `${effCoats} straturi de vopsea + 10% rezervă; cantitatea exactă depinde de randamentul vopselei alese.`,
    `${effCoats} coats + 10% spare; exact litres depend on the chosen paint's coverage.`,
  );

  const toCover = area * effCoats * 1.1;
  b.need("interior_paint", toCover / 10, `${r1(area)} m² × ${effCoats} straturi`, `${r1(area)} m² × ${effCoats} coats`, {
    areaToCover: r2(toCover),
  });

  if (surface === "fresh_plaster" || surface === "dark_to_light") {
    b.need("primer", (area * 1.05) / 10, "1 strat de amorsă pe toată suprafața", "1 coat of primer on the whole surface", {
      areaToCover: r2(area * 1.05),
    });
  } else {
    b.need("primer", (area * 1.05) / 10, "recomandat dacă pereții sunt pătați sau absorbanți", "recommended if walls are stained or porous", {
      areaToCover: r2(area * 1.05),
      optional: true,
    });
  }
  if (surface === "repaint") {
    b.need("wall_filler", Math.max(1, walls / 10), "reparații fisuri și găuri (~1 kg / 10 m²)", "patching cracks and holes (~1 kg / 10 m²)");
    b.tool("putty_knife");
    b.need("sandpaper", 3, "șlefuire reparații", "sanding patches");
  }
  const tape = perimeter * (ceiling ? 1 : 2) + doors * 5.1 + windows * 5.4 + perimeter;
  b.need("painters_tape", tape * 1.1, "contur tavan, pervaz, plinte, tocuri", "ceiling line, sills, skirting, frames");
  b.need("protective_foil", L * W * 1.2, "acoperire pardoseală + mobilier", "covering floor + furniture");
  b.tool("paint_roller");
  b.tool("paint_brush");
  b.tool("paint_tray");
  if (ceiling || H > 2.5) b.tool("ladder", 1, true);

  const hours = area / 12 + (surface === "repaint" ? 2 : 0) + 2;
  b.safety("Aerisește camera în timpul și după vopsire.", "Ventilate the room while and after painting.");
  return {
    projectType: "paint_room",
    title: b.t("Vopsire cameră", "Room painting"),
    inputs: { lengthM: L, widthM: W, heightM: H, doors, windows, paintCeiling: ceiling, coats: effCoats, surface },
    measurements: b.measurements,
    requirements: b.requirements,
    assumptions: b.assumptions,
    estimate: { hoursMin: Math.round(hours), hoursMax: Math.round(hours * 1.6), difficulty: 1, people: 1 },
    safetyNotes: b.safetyNotes,
  };
}

// ─────────────────────────── laminate ────────────────────────────
function laminateFloor(p: Params, lang: Lang): CalculationResult {
  const b = new Builder(lang);
  const L = positive("lengthM", p.lengthM, { max: 50 });
  const W = positive("widthM", p.widthM, { max: 50 });
  const diagonal = p.pattern === "diagonal";
  const doorways = nonNegInt("doorways", p.doorways, 1);
  const subfloor = (["concrete", "wood", "old_tiles"] as const).includes(p.subfloor as never)
    ? (p.subfloor as "concrete" | "wood" | "old_tiles")
    : "concrete";

  const area = L * W;
  const perimeter = 2 * (L + W);
  const waste = diagonal ? 0.12 : 0.07;
  b.measure("Suprafață pardoseală", "Floor area", area, "m²");
  b.measure("Perimetru", "Perimeter", perimeter, "m");
  b.assume(
    `Pierderi la tăiere ${Math.round(waste * 100)}% (montaj ${diagonal ? "diagonal" : "drept"}).`,
    `${Math.round(waste * 100)}% cutting waste (${diagonal ? "diagonal" : "straight"} laying).`,
  );

  b.need("laminate", area * (1 + waste), `${r1(area)} m² + ${Math.round(waste * 100)}% pierderi`, `${r1(area)} m² + ${Math.round(waste * 100)}% waste`);
  b.need("underlay", area * 1.05, "suprafața + 5% suprapuneri", "area + 5% overlap");
  if (subfloor === "concrete") {
    b.need("vapor_barrier", area * 1.15, "obligatorie pe șapă de beton (suprapunere 20 cm)", "required on concrete screed (20 cm overlap)");
  }
  const skirting = Math.max(0, perimeter - doorways * 0.9) * 1.08;
  b.need("skirting_board", skirting, "perimetru minus uși + 8% tăieturi", "perimeter minus doorways + 8% cuts");
  if (doorways > 0) b.need("transition_profile", doorways, "câte unul la fiecare prag de ușă", "one per doorway");
  b.tool("flooring_install_kit");
  b.tool("jigsaw");
  b.tool("measuring_tape");
  b.tool("pencil");
  b.tool("utility_knife");
  b.tool("knee_pads", 1, true);
  if (subfloor === "old_tiles") {
    b.assume("Gresia veche trebuie să fie plană (max. 2 mm / 1 m).", "Old tiles must be flat (max. 2 mm per 1 m).");
  }
  b.assume("Lasă parchetul 48 h în cameră înainte de montaj (aclimatizare).", "Let the laminate acclimatise in the room for 48 h before laying.");
  b.safety("Folosește ochelari de protecție la tăiere.", "Wear safety glasses when cutting.");

  const hours = area / 4 + 2;
  return {
    projectType: "laminate_floor",
    title: b.t("Montaj parchet laminat", "Laminate flooring"),
    inputs: { lengthM: L, widthM: W, pattern: diagonal ? "diagonal" : "straight", doorways, subfloor },
    measurements: b.measurements,
    requirements: b.requirements,
    assumptions: b.assumptions,
    estimate: { hoursMin: Math.round(hours), hoursMax: Math.round(hours * 1.5), difficulty: 2, people: 1 },
    safetyNotes: b.safetyNotes,
  };
}

// ──────────────────────────── tiling ─────────────────────────────
function tiling(p: Params, lang: Lang): CalculationResult {
  const b = new Builder(lang);
  const L = positive("lengthM", p.lengthM, { max: 30 });
  const W = positive("widthM", p.widthM, { max: 30 });
  const room = (["bathroom", "kitchen", "other"] as const).includes(p.roomType as never)
    ? (p.roomType as "bathroom" | "kitchen" | "other")
    : "bathroom";
  const tileFloor = bool(p.tileFloor, true);
  const wallHeight = p.wallTileHeightM === undefined ? (room === "bathroom" ? 2.1 : 0) : Number(p.wallTileHeightM);
  if (!Number.isFinite(wallHeight) || wallHeight < 0 || wallHeight > 4) {
    throw new CalculatorInputError(`"wallTileHeightM" must be between 0 and 4`);
  }
  const doors = nonNegInt("doors", p.doors, 1);
  const largeFormat = p.largeFormat === undefined ? true : bool(p.largeFormat, true);

  const floor = tileFloor ? L * W : 0;
  const perimeter = 2 * (L + W);
  const wall = wallHeight > 0 ? Math.max(0, perimeter * wallHeight - doors * 0.9 * Math.min(wallHeight, 2.05)) : 0;
  if (floor === 0 && wall === 0) throw new CalculatorInputError("Nothing to tile: enable tileFloor or set wallTileHeightM");

  if (floor) b.measure("Gresie (pardoseală)", "Floor tiling", floor, "m²");
  if (wall) b.measure("Faianță (pereți)", "Wall tiling", wall, "m²");
  b.assume("10% rezervă pentru tăieturi și spargeri.", "10% spare for cuts and breakage.");
  if (p.wallTileHeightM === undefined && room === "bathroom") {
    b.assume("Faianță până la 2,1 m pe toți pereții băii.", "Wall tiles up to 2.1 m on all bathroom walls.");
  }

  if (floor) b.need("floor_tiles", floor * 1.1, `${r1(floor)} m² + 10%`, `${r1(floor)} m² + 10%`);
  if (wall) b.need("wall_tiles", wall * 1.1, `${r1(wall)} m² + 10%`, `${r1(wall)} m² + 10%`);
  const adhesive = floor * (largeFormat ? 5.5 : 4) + wall * 3.5;
  b.need(
    "tile_adhesive",
    adhesive,
    largeFormat ? "~5,5 kg/m² pardoseală (format mare), 3,5 kg/m² pereți" : "~4 kg/m² pardoseală, 3,5 kg/m² pereți",
    largeFormat ? "~5.5 kg/m² floor (large format), 3.5 kg/m² walls" : "~4 kg/m² floor, 3.5 kg/m² walls",
    { match: largeFormat ? { class: "C2TE S1" } : undefined },
  );
  b.need("tile_grout", (floor + wall) * 0.45, "~0,45 kg/m² (rost 2–3 mm)", "~0.45 kg/m² (2–3 mm joints)");
  b.need("tile_spacers", (floor * (largeFormat ? 4 : 12) + wall * 9) * 1.1, "cruciulițe per plăci", "spacers per tile count");
  b.need("substrate_primer", (floor + wall) * 0.15, "amorsă pe tot suportul", "primer on the whole substrate", {
    areaToCover: r2((floor + wall) * 1.05),
  });
  if (room === "bathroom") {
    const wet = floor + perimeter * 0.2 + 3.5;
    b.need("waterproofing", wet * 1.5, "pardoseală + 20 cm pe pereți + zona de duș (2 straturi)", "floor + 20 cm upstand + shower zone (2 coats)");
    b.need("sanitary_silicone", 2, "rosturi cadă/duș și colțuri", "bath/shower joints and corners");
  } else {
    b.need("sanitary_silicone", 1, "rosturi de dilatație la colțuri", "movement joints in corners");
  }
  b.tool("notched_trowel");
  b.tool("tile_cutter");
  b.tool("grout_float");
  b.tool("mixing_paddle");
  b.tool("bucket", 2);
  b.tool("spirit_level");
  b.tool("rubber_mallet");
  b.tool("caulking_gun");
  b.tool("knee_pads", 1, true);
  b.tool("cordless_drill", 1, true);
  b.assume("Paleta de amestec se folosește cu o mașină de găurit.", "The mixing paddle is used with a drill.");
  if (room === "bathroom") {
    b.safety(
      "Nu muta singur prize, instalații electrice sau țevi de gaz — apelează la un electrician/instalator autorizat.",
      "Do not relocate sockets, electrics or gas pipes yourself — use a licensed electrician/plumber.",
    );
  }
  b.safety("Poartă mască de praf la tăiere și ochelari de protecție.", "Wear a dust mask and safety glasses when cutting.");

  const hours = floor * 1.2 + wall * 1.0 + 6;
  return {
    projectType: "tiling",
    title: b.t(room === "bathroom" ? "Placare baie" : room === "kitchen" ? "Placare bucătărie" : "Placare cu gresie/faianță", room === "bathroom" ? "Bathroom tiling" : room === "kitchen" ? "Kitchen tiling" : "Tiling"),
    inputs: { lengthM: L, widthM: W, roomType: room, tileFloor, wallTileHeightM: wallHeight, doors, largeFormat },
    measurements: b.measurements,
    requirements: b.requirements,
    assumptions: b.assumptions,
    estimate: { hoursMin: Math.round(hours), hoursMax: Math.round(hours * 1.6), difficulty: 4, people: 1 },
    safetyNotes: b.safetyNotes,
  };
}

// ───────────────────────────── deck ──────────────────────────────
function deck(p: Params, lang: Lang): CalculationResult {
  const b = new Builder(lang);
  const L = positive("lengthM", p.lengthM, { max: 30 });
  const W = positive("widthM", p.widthM, { max: 30 });
  const base = (["concrete_slab", "soil", "gravel"] as const).includes(p.base as never)
    ? (p.base as "concrete_slab" | "soil" | "gravel")
    : "soil";
  const area = L * W;
  const boardPitch = 0.15; // 145 mm board + 5 mm gap
  const joistSpacing = 0.4;
  const rows = Math.ceil(W / boardPitch);
  const joists = Math.ceil(L / joistSpacing) + 1;
  const supportsPerJoist = Math.ceil(W / 0.6) + 1;

  b.measure("Suprafață terasă", "Deck area", area, "m²");
  b.measure("Rânduri de deck", "Board rows", rows, "rânduri");
  b.measure("Grinzi suport", "Joists", joists, "buc");
  b.assume("Deck de ~145 mm lățime cu rost de 5 mm, montat pe lungime.", "~145 mm boards with 5 mm gaps, running lengthwise.");
  b.assume("Grinzi la 40 cm interax, suporturi la max. 60 cm.", "Joists at 40 cm centres, supports every 60 cm max.");
  b.assume("10% pierderi la deck, 5% la grinzi.", "10% waste on boards, 5% on joists.");

  b.need("deck_board", rows * L * 1.1, `${rows} rânduri × ${r1(L)} m + 10%`, `${rows} rows × ${r1(L)} m + 10%`);
  b.need("deck_joist", joists * W * 1.05, `${joists} grinzi × ${r1(W)} m + 5%`, `${joists} joists × ${r1(W)} m + 5%`);
  b.need("deck_screws", rows * joists * 2 * 1.1, "2 șuruburi la fiecare încrucișare deck–grindă", "2 screws per board–joist crossing");
  b.need("deck_support", joists * supportsPerJoist, `${supportsPerJoist} suporturi pe fiecare grindă`, `${supportsPerJoist} supports per joist`);
  if (base !== "concrete_slab") {
    b.need("weed_membrane", area * 1.15, "sub toată terasa, cu suprapuneri", "under the whole deck, with overlaps");
  }
  b.need("deck_oil", (area * 2) / 15, "2 straturi (nu e necesar la WPC)", "2 coats (not needed for WPC)", {
    areaToCover: r2(area * 2),
    optional: true,
  });
  b.tool("cordless_drill");
  b.tool("mitre_saw", 1, true);
  b.tool("hand_saw", 1, true);
  b.tool("spirit_level");
  b.tool("measuring_tape");
  b.tool("pencil");
  b.tool("work_gloves");
  b.tool("safety_glasses");
  if (base === "soil") {
    b.assume("Pe pământ: nivelează și compactează, apoi pune dale/plăci sub suporturi.", "On soil: level and compact, then put paving slabs under the supports.");
  }
  b.safety("Terasele înalte de peste 60 cm necesită balustradă și, uneori, autorizație.", "Decks higher than 60 cm need a railing and may need a permit.");

  const hours = area * 1.5 + 4;
  return {
    projectType: "deck",
    title: b.t("Terasă din deck", "Garden deck"),
    inputs: { lengthM: L, widthM: W, base },
    measurements: b.measurements,
    requirements: b.requirements,
    assumptions: b.assumptions,
    estimate: { hoursMin: Math.round(hours), hoursMax: Math.round(hours * 1.5), difficulty: 3, people: 2 },
    safetyNotes: b.safetyNotes,
  };
}

// ───────────────────────────── fence ─────────────────────────────
function fence(p: Params, lang: Lang): CalculationResult {
  const b = new Builder(lang);
  const len = positive("lengthM", p.lengthM, { max: 500 });
  const allowedHeights = [0.9, 1.2, 1.8];
  const hIn = p.heightM === undefined ? 1.8 : Number(p.heightM);
  const H = allowedHeights.reduce((a, c) => (Math.abs(c - hIn) < Math.abs(a - hIn) ? c : a), 1.8);
  const section = 1.8 + 0.09;
  const panels = Math.ceil(len / section - 1e-9);
  const posts = panels + 1;
  b.measure("Lungime gard", "Fence length", len, "m");
  b.measure("Panouri", "Panels", panels, "buc");
  b.measure("Stâlpi", "Posts", posts, "buc");
  b.assume(`Panouri de 1,8 m lățime, înălțime ${H} m; stâlp de 9 cm între panouri.`, `1.8 m wide panels, ${H} m high; 9 cm post between panels.`);
  if (hIn !== H) b.assume(`Înălțimea a fost rotunjită la standardul de ${H} m.`, `Height rounded to the standard ${H} m.`);

  b.need("fence_panel", panels, `${r1(len)} m ÷ 1,89 m`, `${r1(len)} m ÷ 1.89 m`, { match: { heightM: H } });
  b.need("fence_post", posts, "panouri + 1", "panels + 1", { match: { heightM: H >= 1.8 ? 2.4 : H >= 1.2 ? 1.8 : 1.5 } });
  b.need("post_concrete", posts * (H >= 1.8 ? 30 : 20), `${H >= 1.8 ? 30 : 20} kg beton pe stâlp`, `${H >= 1.8 ? 30 : 20} kg concrete per post`);
  b.need("fence_fixings", panels * 4, "4 cleme pe panou", "4 clips per panel");
  b.need("post_cap", posts, "un capac pe stâlp", "one cap per post", { optional: true });
  b.need("wood_stain", (panels * 1.8 * H * 2) / 10, "o mână pe ambele fețe (panouri din lemn)", "one coat both sides (wooden panels)", {
    areaToCover: r2(panels * 1.8 * H * 2),
    optional: true,
  });
  b.tool("post_hole_digger");
  b.tool("spade");
  b.tool("spirit_level");
  b.tool("measuring_tape");
  b.tool("cordless_drill");
  b.tool("work_gloves");
  b.tool("wheelbarrow", 1, true);
  b.safety(
    "Înainte să sapi, verifică traseul cablurilor și conductelor subterane; respectă limita de proprietate.",
    "Before digging, check for underground cables and pipes; respect the property line.",
  );
  const hours = posts * 0.8 + panels * 0.4 + 2;
  return {
    projectType: "fence",
    title: b.t("Gard din panouri", "Panel fence"),
    inputs: { lengthM: len, heightM: H },
    measurements: b.measurements,
    requirements: b.requirements,
    assumptions: b.assumptions,
    estimate: { hoursMin: Math.round(hours), hoursMax: Math.round(hours * 1.5), difficulty: 3, people: 2 },
    safetyNotes: b.safetyNotes,
  };
}

// ────────────────────────── drywall wall ─────────────────────────
function drywallPartition(p: Params, lang: Lang): CalculationResult {
  const b = new Builder(lang);
  const L = positive("lengthM", p.lengthM, { max: 30 });
  const H = p.heightM === undefined ? 2.6 : positive("heightM", p.heightM, { max: 6 });
  const doors = nonNegInt("doors", p.doors, 0, 5);
  const insulation = bool(p.insulation, true);
  const layers = bool(p.doubleLayer, false) ? 2 : 1;
  const wet = p.wetRoom === true;

  const wallArea = Math.max(0, L * H - doors * 0.9 * 2.05);
  const boardArea = wallArea * 2 * layers * 1.1;
  const studs = Math.ceil(L / 0.6) + 1 + doors * 2;
  b.measure("Suprafață perete", "Wall area", wallArea, "m²");
  b.measure("Montanți CW", "CW studs", studs, "buc");
  b.assume(
    `Placare pe ambele fețe, ${layers} strat(uri), montanți la 60 cm, 10% pierderi la plăci.`,
    `Boarded on both sides, ${layers} layer(s), studs at 60 cm centres, 10% board waste.`,
  );
  if (p.heightM === undefined) b.assume("Înălțime presupusă 2,6 m.", "Assumed height of 2.6 m.");

  b.need("drywall_board", boardArea, `${r1(wallArea)} m² × 2 fețe × ${layers} + 10%`, `${r1(wallArea)} m² × 2 sides × ${layers} + 10%`, {
    match: wet ? { type: "hidro" } : undefined,
  });
  b.need("uw_profile", (2 * L + doors * 1.2) * 1.05, "sus + jos (+ deasupra ușilor)", "top + bottom (+ door headers)");
  b.need("cw_profile", studs * H * 1.05, `${studs} montanți × ${r1(H)} m`, `${studs} studs × ${r1(H)} m`);
  b.need("drywall_screws", boardArea * 18, "~18 șuruburi / m² de placă", "~18 screws per m² of board");
  b.need("anchor_dowels", Math.ceil((2 * L) / 0.5) + 4, "prindere UW la 50 cm", "UW fixing every 50 cm");
  b.need("sealing_tape", 2 * L + 2 * H, "sub profilele de contur", "under perimeter profiles");
  b.need("joint_tape", boardArea * 1.3, "~1,3 m / m² de placă", "~1.3 m per m² of board");
  b.need("joint_compound", boardArea * 0.4, "~0,4 kg / m² de placă", "~0.4 kg per m² of board");
  if (insulation) b.need("mineral_wool", wallArea * 1.05, "izolare fonică în interiorul peretelui", "acoustic insulation inside the wall");
  b.tool("tin_snips");
  b.tool("utility_knife");
  b.tool("spirit_level");
  b.tool("cordless_drill");
  b.tool("measuring_tape");
  b.tool("pencil");
  b.tool("putty_knife");
  b.tool("dust_mask");
  b.tool("safety_glasses");
  b.safety(
    "Pereții din gips-carton nu sunt structurali — nu demola și nu modifica pereți portanți fără inginer.",
    "Drywall partitions are non-structural — never remove or alter load-bearing walls without an engineer.",
  );
  b.safety("Poartă mască la șlefuirea gletului și mănuși la vata minerală.", "Wear a mask when sanding compound and gloves when handling mineral wool.");
  const hours = wallArea * 1.2 + 4;
  return {
    projectType: "drywall_partition",
    title: b.t("Perete despărțitor din gips-carton", "Drywall partition wall"),
    inputs: { lengthM: L, heightM: H, doors, insulation, doubleLayer: layers === 2, wetRoom: wet },
    measurements: b.measurements,
    requirements: b.requirements,
    assumptions: b.assumptions,
    estimate: { hoursMin: Math.round(hours), hoursMax: Math.round(hours * 1.6), difficulty: 3, people: 2 },
    safetyNotes: b.safetyNotes,
  };
}

// ───────────────────────────── lawn ──────────────────────────────
function lawn(p: Params, lang: Lang): CalculationResult {
  const b = new Builder(lang);
  const area =
    p.areaM2 !== undefined
      ? positive("areaM2", p.areaM2, { max: 5000 })
      : positive("lengthM", p.lengthM, { max: 200 }) * positive("widthM", p.widthM, { max: 200 });
  const mode = p.mode === "overseed" ? "overseed" : "new";
  b.measure("Suprafață gazon", "Lawn area", area, "m²");
  if (mode === "new") {
    b.need("grass_seed", area / 30, "semănat nou (~35 g/m²)", "new sowing (~35 g/m²)", { areaToCover: r2(area) });
    b.need("topsoil", area * 20, "strat de 2 cm de pământ nou", "2 cm top layer of soil");
    b.need("lawn_fertilizer", area / 40, "îngrășământ starter", "starter fertiliser", { areaToCover: r2(area) });
    b.tool("spade");
    b.tool("wheelbarrow", 1, true);
    b.tool("lawn_roller", 1, true);
    b.assume("Teren nou: săpat/afânat 15–20 cm, nivelat, apoi semănat.", "New lawn: dig/loosen 15–20 cm, level, then sow.");
  } else {
    b.need("grass_seed", area / 60, "supraînsămânțare (~15–20 g/m²)", "overseeding (~15–20 g/m²)", { areaToCover: r2(area / 2) });
    b.need("lawn_fertilizer", area / 40, "îngrășământ de întreținere", "maintenance fertiliser", { areaToCover: r2(area) });
    b.assume("Supraînsămânțare: scarifică gazonul existent înainte.", "Overseeding: scarify the existing lawn first.");
  }
  b.tool("garden_rake");
  b.tool("garden_hose");
  b.tool("sprinkler", 1, true);
  b.assume("Cea mai bună perioadă: aprilie–mai sau sfârșit de august–septembrie.", "Best time: April–May or late August–September.");
  const hours = mode === "new" ? area / 15 + 3 : area / 50 + 1;
  return {
    projectType: "lawn",
    title: b.t(mode === "new" ? "Gazon nou" : "Refacere gazon", mode === "new" ? "New lawn" : "Lawn overseeding"),
    inputs: { areaM2: area, mode },
    measurements: b.measurements,
    requirements: b.requirements,
    assumptions: b.assumptions,
    estimate: { hoursMin: Math.round(hours), hoursMax: Math.round(hours * 1.5), difficulty: mode === "new" ? 2 : 1, people: 1 },
    safetyNotes: b.safetyNotes,
  };
}

const CALCULATORS: Record<ProjectType, (p: Params, lang: Lang) => CalculationResult> = {
  paint_room: paintRoom,
  laminate_floor: laminateFloor,
  tiling,
  deck,
  fence,
  drywall_partition: drywallPartition,
  lawn,
};

export function calculateProject(type: ProjectType, params: Params, lang: Lang = "ro"): CalculationResult {
  const fn = CALCULATORS[type];
  if (!fn) throw new CalculatorInputError(`Unknown project type "${type}"`);
  return fn(params ?? {}, lang);
}

/** Parameter documentation used in the tool schema description. */
export const PROJECT_PARAM_DOCS: Record<ProjectType, string> = {
  paint_room:
    "lengthM, widthM (room floor), heightM (default 2.6), doors (default 1), windows (default 1), paintCeiling (default true), coats (default 2), surface: fresh_plaster | repaint | dark_to_light (default repaint)",
  laminate_floor:
    "lengthM, widthM, pattern: straight | diagonal, doorways (default 1), subfloor: concrete | wood | old_tiles (default concrete)",
  tiling:
    "lengthM, widthM (room floor), roomType: bathroom | kitchen | other, tileFloor (default true), wallTileHeightM (default 2.1 for bathroom, 0 otherwise), doors (default 1), largeFormat (≥60 cm tiles, default true)",
  deck: "lengthM, widthM, base: soil | gravel | concrete_slab (default soil)",
  fence: "lengthM, heightM: 0.9 | 1.2 | 1.8 (default 1.8)",
  drywall_partition: "lengthM, heightM (default 2.6), doors (default 0), insulation (default true), doubleLayer (default false), wetRoom (default false)",
  lawn: "areaM2 (or lengthM + widthM), mode: new | overseed (default new)",
};
