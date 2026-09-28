/**
 * Validates src/data/catalog.json against the domain model and the demo-data rules.
 * Run: npx tsx scripts/validate-catalog.ts   (exits 1 on any violation)
 */
import catalogJson from "../src/data/catalog.json";
import { ALL_ROLES, MATERIAL_ROLES } from "../src/domain/types";
import type { BaseUnit, CategoryId, MaterialRole, Product, QualityTier } from "../src/domain/types";
import { productLineKey } from "../src/domain/resolve";

const catalog = catalogJson as unknown as Product[];
const errors: string[] = [];
const fail = (p: Product | null, msg: string) => errors.push(p ? `[${p.sku} ${p.name}] ${msg}` : msg);

// ───────────────────────── vocabularies ─────────────────────────
const CATEGORIES: CategoryId[] = [
  "paint", "flooring", "tiles", "building", "drywall", "insulation", "wood", "garden", "fencing", "tools",
  "power_tools", "fasteners", "adhesives", "safety", "electrical", "plumbing", "bathroom",
];
const TIERS: QualityTier[] = ["budget", "standard", "premium"];
const SALES_UNITS = ["găleată", "bidon", "pachet", "cutie", "sac", "rolă", "buc", "set", "tub"];
const BRANDS = [
  "Pigmenta", "Nuanța", "Artizan", "Floorline", "Casaro", "Fixplus", "Kronwald", "Lignara", "Gipsa", "Termika",
  "Ancora", "Verdea", "Toolcraft", "Voltmaster", "Protekt", "Betonix", "Aquanova", "Lumina",
];
/** Real manufacturers that must never appear (prices are invented). */
const REAL_BRANDS = [
  "bosch", "makita", "dewalt", "metabo", "milwaukee", "ryobi", "einhell", "black+decker", "black & decker", "hilti",
  "festool", "stanley", "wolfcraft", "fiskars", "gardena", "karcher", "kärcher", "dulux", "savana", "kober", "policolor",
  "caparol", "tikkurila", "sadolin", "xyladecor", "bondex", "ceresit", "baumit", "mapei", "sika", "weber", "adeplast",
  "henkel", "tytan", "den braven", "soudal", "knauf", "rigips", "siniat", "isover", "ursa", "rockwool", "egger",
  "kronotex", "kronospan", "quick-step", "pergo", "cersanit", "cesarom", "marazzi", "fischer", "würth", "wurth",
  "3m", "uvex", "hornbach",
];

/** Reusable tool roles (everything else is consumed by the project). */
const TOOL_ROLES = new Set<MaterialRole>([
  "paint_roller", "paint_brush", "paint_tray", "putty_knife", "flooring_install_kit", "notched_trowel", "tile_cutter",
  "grout_float", "mixing_paddle", "bucket", "rubber_mallet", "post_hole_digger", "garden_rake", "lawn_roller",
  "garden_hose", "sprinkler", "cordless_drill", "jigsaw", "mitre_saw", "hand_saw", "tin_snips", "utility_knife",
  "measuring_tape", "spirit_level", "pencil", "caulking_gun", "work_gloves", "safety_glasses", "dust_mask",
  "knee_pads", "ladder", "wheelbarrow", "spade",
]);
/** Core consumables: ≥3 products spanning all three quality tiers. */
const CORE_ROLES: MaterialRole[] = [
  "interior_paint", "primer", "laminate", "underlay", "skirting_board", "floor_tiles", "wall_tiles", "tile_adhesive",
  "tile_grout", "deck_board", "deck_oil", "fence_panel", "fence_post", "drywall_board", "mineral_wool", "grass_seed",
  "wood_stain",
];

/** Allowed categories per role (first role of a product decides nothing; every role must allow the category). */
const ROLE_CATEGORIES: Partial<Record<MaterialRole, CategoryId[]>> = {
  interior_paint: ["paint"], primer: ["paint", "building"], wall_filler: ["building", "paint", "drywall"],
  painters_tape: ["paint"], protective_foil: ["paint"], paint_roller: ["paint"], paint_brush: ["paint"],
  paint_tray: ["paint"], sandpaper: ["paint", "tools"], putty_knife: ["tools", "paint"],
  laminate: ["flooring"], underlay: ["flooring"], vapor_barrier: ["flooring", "insulation"],
  skirting_board: ["flooring"], transition_profile: ["flooring"], flooring_install_kit: ["flooring", "tools"],
  floor_tiles: ["tiles"], wall_tiles: ["tiles"], tile_adhesive: ["adhesives", "tiles"], tile_grout: ["adhesives", "tiles"],
  tile_spacers: ["tiles"], waterproofing: ["building", "bathroom"], substrate_primer: ["building"],
  sanitary_silicone: ["adhesives", "bathroom"], notched_trowel: ["tools"], tile_cutter: ["tools", "power_tools"],
  grout_float: ["tools"], mixing_paddle: ["tools", "power_tools"], bucket: ["tools"], rubber_mallet: ["tools"],
  deck_board: ["wood"], deck_joist: ["wood"], deck_screws: ["fasteners"], deck_support: ["wood"],
  weed_membrane: ["garden"], deck_oil: ["paint", "wood"],
  fence_panel: ["fencing"], fence_post: ["fencing"], post_concrete: ["building"], fence_fixings: ["fencing", "fasteners"],
  post_cap: ["fencing"], wood_stain: ["paint", "wood"], post_hole_digger: ["garden", "tools"],
  drywall_board: ["drywall"], cw_profile: ["drywall"], uw_profile: ["drywall"], drywall_screws: ["fasteners"],
  anchor_dowels: ["fasteners"], joint_tape: ["drywall"], joint_compound: ["drywall", "building"],
  mineral_wool: ["insulation"], sealing_tape: ["drywall"],
  grass_seed: ["garden"], lawn_fertilizer: ["garden"], topsoil: ["garden"], garden_rake: ["garden"],
  lawn_roller: ["garden"], garden_hose: ["garden"], sprinkler: ["garden"],
  cordless_drill: ["power_tools"], jigsaw: ["power_tools"], mitre_saw: ["power_tools"], hand_saw: ["tools"],
  tin_snips: ["tools"], utility_knife: ["tools"], measuring_tape: ["tools", "power_tools"],
  spirit_level: ["tools", "power_tools"], pencil: ["tools"], caulking_gun: ["tools"], work_gloves: ["safety"],
  safety_glasses: ["safety"], dust_mask: ["safety"], knee_pads: ["safety"], ladder: ["tools"],
  wheelbarrow: ["garden", "tools"], spade: ["garden", "tools"],
  toilet: ["bathroom"], washbasin: ["bathroom"], shower_enclosure: ["bathroom"], bathtub: ["bathroom"],
  bathroom_mirror: ["bathroom"], towel_radiator: ["bathroom", "plumbing"], ceiling_light: ["electrical"],
  wall_light: ["electrical"], floor_lamp: ["electrical"], garden_light: ["garden", "electrical"],
  garden_furniture: ["garden"], planter: ["garden"], bbq: ["garden"], sun_lounger: ["garden"], parasol: ["garden"],
};

type SpecType = "number" | "string" | "boolean";
const REQUIRED_SPECS: Partial<Record<MaterialRole, Record<string, SpecType>>> = {
  interior_paint: { coverageM2PerL: "number", color: "string", finish: "string", clasa: "number" },
  primer: { coverageM2PerL: "number" },
  deck_oil: { coverageM2PerL: "number", color: "string" },
  wood_stain: { coverageM2PerL: "number", color: "string" },
  substrate_primer: { coverageM2PerL: "number" },
  laminate: {
    acClass: "string", thicknessMm: "number", boardLengthMm: "number", boardWidthMm: "number",
    m2PerPack: "number", waterResistant: "boolean", decor: "string",
  },
  underlay: { thicknessMm: "number", m2PerPack: "number" },
  vapor_barrier: { thicknessMm: "number", m2PerPack: "number" },
  floor_tiles: { sizeCm: "string", m2PerBox: "number", pei: "number", antiSlip: "string", finish: "string", color: "string" },
  wall_tiles: { sizeCm: "string", m2PerBox: "number", finish: "string", color: "string" },
  tile_adhesive: { class: "string", bagKg: "number" },
  tile_grout: { bagKg: "number", color: "string" },
  waterproofing: { kg: "number" },
  deck_board: { lengthM: "number", widthMm: "number", thicknessMm: "number", material: "string" },
  deck_joist: { lengthM: "number", sectionMm: "string", material: "string" },
  deck_screws: { perBox: "number", lengthMm: "number", stainless: "boolean" },
  deck_support: { heightRangeMm: "string" },
  fence_panel: { widthM: "number", heightM: "number", material: "string" },
  fence_post: { heightM: "number", sectionMm: "string", material: "string" },
  post_concrete: { bagKg: "number" },
  drywall_board: { widthMm: "number", heightMm: "number", thicknessMm: "number", type: "string" },
  cw_profile: { lengthM: "number", widthMm: "number" },
  uw_profile: { lengthM: "number", widthMm: "number" },
  mineral_wool: { thicknessMm: "number", m2PerRoll: "number" },
  drywall_screws: { perBox: "number", lengthMm: "number" },
  grass_seed: { coverageM2PerKg: "number", type: "string" },
  lawn_fertilizer: { coverageM2PerKg: "number" },
  topsoil: { litres: "number" },
  skirting_board: { lengthM: "number", heightMm: "number", material: "string" },
};

/** Inclusive numeric ranges for key specs. */
const SPEC_RANGES: Partial<Record<MaterialRole, Record<string, [number, number]>>> = {
  interior_paint: { coverageM2PerL: [8, 14], clasa: [1, 3] },
  primer: { coverageM2PerL: [8, 12] },
  deck_oil: { coverageM2PerL: [12, 20] },
  wood_stain: { coverageM2PerL: [8, 12] },
  substrate_primer: { coverageM2PerL: [3, 12] },
  grass_seed: { coverageM2PerKg: [25, 40] },
  lawn_fertilizer: { coverageM2PerKg: [20, 50] },
  laminate: { thicknessMm: [6, 14] },
  floor_tiles: { pei: [1, 5] },
};

/** Spec that must equal content.amount (the per-pack quantity). */
const AMOUNT_SPEC: Partial<Record<MaterialRole, string>> = {
  laminate: "m2PerPack", underlay: "m2PerPack", vapor_barrier: "m2PerPack", floor_tiles: "m2PerBox",
  wall_tiles: "m2PerBox", tile_adhesive: "bagKg", tile_grout: "bagKg", post_concrete: "bagKg", waterproofing: "kg",
  deck_board: "lengthM", deck_joist: "lengthM", skirting_board: "lengthM", cw_profile: "lengthM", uw_profile: "lengthM",
  deck_screws: "perBox", drywall_screws: "perBox", mineral_wool: "m2PerRoll", topsoil: "litres",
};

const ALWAYS_BULKY = new Set<MaterialRole>([
  "deck_board", "deck_joist", "fence_panel", "fence_post", "drywall_board", "laminate", "floor_tiles", "wall_tiles",
  "wheelbarrow", "ladder", "mitre_saw",
]);

const approx = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= Math.max(Math.abs(b) * tol, 1e-9);
const roNum = (n: number) => String(n).replace(".", ",");

// ───────────────────────── per-product checks ─────────────────────────
if (!Array.isArray(catalog)) {
  console.error("catalog.json is not an array");
  process.exit(1);
}
if (catalog.length < 200 || catalog.length > 300) fail(null, `catalog has ${catalog.length} products; expected 200–300`);

const skus = new Set<string>();
const PRODUCT_KEYS = new Set([
  "sku", "name", "nameEn", "brand", "category", "price", "salesUnit", "roles", "content", "quality", "specs",
  "description", "descriptionEn", "rating", "isTool", "bulky",
]);
const oneSentence = (s: string) => (s.match(/[.!?](\s|$)/g) ?? []).length === 1 && /[.!?]$/.test(s.trim());

for (const p of catalog) {
  for (const k of Object.keys(p)) if (!PRODUCT_KEYS.has(k)) fail(p, `unknown field "${k}"`);

  // sku
  if (typeof p.sku !== "string" || !/^\d{8}$/.test(p.sku)) fail(p, `sku must be an 8-digit string`);
  if (skus.has(p.sku)) fail(p, `duplicate sku`);
  skus.add(p.sku);

  // text fields
  for (const f of ["name", "nameEn", "brand", "description", "descriptionEn", "salesUnit"] as const) {
    if (typeof p[f] !== "string" || p[f].trim() === "") fail(p, `${f} must be a non-empty string`);
  }
  const allText = `${p.name} ${p.nameEn} ${p.description} ${p.descriptionEn} ${p.brand}`;
  if (/[şţŞŢ]/.test(allText)) fail(p, `uses cedilla ş/ţ instead of comma-below ș/ț`);
  if (!p.name.includes(p.brand)) fail(p, `name should contain the brand "${p.brand}"`);
  if (!p.nameEn.includes(p.brand)) fail(p, `nameEn should contain the brand "${p.brand}"`);
  if (!oneSentence(p.description)) fail(p, `description must be exactly one sentence`);
  if (!oneSentence(p.descriptionEn)) fail(p, `descriptionEn must be exactly one sentence`);
  if (/[ăâîșț]/i.test(p.nameEn + p.descriptionEn.replace(p.brand, ""))) {
    // brand names may contain diacritics; anything else in English text is probably untranslated
    const stripped = `${p.nameEn} ${p.descriptionEn}`.split(p.brand).join("");
    if (/[ăâîșț]/i.test(stripped)) fail(p, `English text contains Romanian diacritics`);
  }
  const lower = allText.toLowerCase();
  for (const rb of REAL_BRANDS) {
    if (new RegExp(`(^|[^a-z0-9])${rb.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(lower)) {
      fail(p, `mentions real brand "${rb}"`);
    }
  }
  if (!BRANDS.includes(p.brand)) fail(p, `brand "${p.brand}" not in the fictional brand list`);
  if (!SALES_UNITS.includes(p.salesUnit)) fail(p, `salesUnit "${p.salesUnit}" not allowed`);
  if (!CATEGORIES.includes(p.category)) fail(p, `invalid category "${p.category}"`);
  if (!TIERS.includes(p.quality)) fail(p, `invalid quality "${p.quality}"`);

  // price
  if (typeof p.price !== "number" || !(p.price > 0)) fail(p, `price must be a positive number`);
  else {
    const cents = Math.round(p.price * 100);
    if (Math.abs(cents - p.price * 100) > 1e-6) fail(p, `price must have at most 2 decimals`);
    if (![90, 99].includes(cents % 100)) fail(p, `price ${p.price} should end in .90 or .99`);
  }

  // rating
  if (typeof p.rating !== "number" || p.rating < 3.6 || p.rating > 4.9 || Math.round(p.rating * 10) !== p.rating * 10) {
    fail(p, `rating ${p.rating} must be 3.6–4.9 with one decimal`);
  }

  // roles & units
  if (!Array.isArray(p.roles) || p.roles.length === 0) {
    fail(p, `roles must be a non-empty array`);
    continue;
  }
  const badRoles = p.roles.filter((r) => !(r in MATERIAL_ROLES));
  if (badRoles.length) {
    fail(p, `unknown roles ${badRoles.join(", ")}`);
    continue;
  }
  if (new Set(p.roles).size !== p.roles.length) fail(p, `duplicate roles`);
  const units = new Set<BaseUnit>(p.roles.map((r) => MATERIAL_ROLES[r].unit));
  if (units.size !== 1) fail(p, `roles have mixed base units (${[...units].join(", ")})`);
  const unit = MATERIAL_ROLES[p.roles[0]].unit;
  if (!p.content || p.content.unit !== unit) fail(p, `content.unit "${p.content?.unit}" must be "${unit}"`);
  if (!p.content || typeof p.content.amount !== "number" || !(p.content.amount > 0)) fail(p, `content.amount must be > 0`);
  if (unit === "buc" && !Number.isInteger(p.content.amount)) fail(p, `buc amount must be an integer`);

  // tool / consumable consistency
  const toolFlags = new Set(p.roles.map((r) => TOOL_ROLES.has(r)));
  if (toolFlags.size !== 1) fail(p, `mixes tool and consumable roles`);
  const shouldBeTool = TOOL_ROLES.has(p.roles[0]);
  if (p.isTool !== shouldBeTool) fail(p, `isTool should be ${shouldBeTool}`);
  if (shouldBeTool && p.content.amount < 1) fail(p, `tool amount must be ≥ 1`);

  // category per role
  for (const r of p.roles) {
    const allowed = ROLE_CATEGORIES[r];
    if (allowed && !allowed.includes(p.category)) fail(p, `category "${p.category}" not allowed for role ${r} (${allowed.join("/")})`);
  }

  // specs
  if (!p.specs || typeof p.specs !== "object") {
    fail(p, `specs missing`);
    continue;
  }
  for (const [k, v] of Object.entries(p.specs)) {
    if (!["string", "number", "boolean"].includes(typeof v)) fail(p, `spec ${k} has invalid type`);
    if (typeof v === "string" && v.trim() !== "" && /^-?\d+(\.\d+)?$/.test(v.trim())) fail(p, `spec ${k} is a numeric string; use a number`);
  }
  if (Object.keys(p.specs).length < 2) fail(p, `needs at least 2 meaningful specs`);
  for (const r of p.roles) {
    for (const [k, t] of Object.entries(REQUIRED_SPECS[r] ?? {})) {
      if (typeof p.specs[k] !== t) fail(p, `role ${r} requires spec ${k}: ${t}`);
    }
    for (const [k, [lo, hi]] of Object.entries(SPEC_RANGES[r] ?? {})) {
      const v = p.specs[k];
      if (typeof v === "number" && (v < lo || v > hi)) fail(p, `spec ${k}=${v} outside ${lo}–${hi} for ${r}`);
    }
    const amountKey = AMOUNT_SPEC[r];
    if (amountKey && typeof p.specs[amountKey] === "number" && !approx(p.specs[amountKey] as number, p.content.amount, 0.001)) {
      fail(p, `spec ${amountKey}=${p.specs[amountKey]} ≠ content.amount ${p.content.amount}`);
    }
  }

  // role-specific consistency
  const s = p.specs;
  const has = (r: MaterialRole) => p.roles.includes(r);
  if (has("laminate")) {
    if (!/^AC[3-6]$/.test(String(s.acClass))) fail(p, `acClass "${s.acClass}" invalid`);
    const boards = s.boardsPerPack;
    if (typeof boards === "number") {
      const m2 = ((s.boardLengthMm as number) * (s.boardWidthMm as number) * boards) / 1e6;
      if (!approx(m2, p.content.amount, 0.01)) fail(p, `board dims × ${boards} = ${m2.toFixed(3)} m² ≠ ${p.content.amount}`);
    }
    const perM2 = p.price / p.content.amount;
    if (perM2 < 45 || perM2 > 110) fail(p, `laminate ${perM2.toFixed(2)} RON/m² outside 45–110`);
  }
  if (has("floor_tiles") || has("wall_tiles")) {
    const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(String(s.sizeCm));
    if (!m) fail(p, `sizeCm "${s.sizeCm}" must look like "60x60"`);
    else if (typeof s.piecesPerBox === "number") {
      const m2 = ((Number(m[1]) * Number(m[2])) / 1e4) * s.piecesPerBox;
      if (!approx(m2, p.content.amount, 0.02)) fail(p, `tile size × pieces = ${m2.toFixed(3)} m² ≠ ${p.content.amount}`);
    }
    if (!["mat", "lucios", "satinat"].includes(String(s.finish))) fail(p, `tile finish "${s.finish}" invalid`);
    if (has("floor_tiles")) {
      if (!/^R(9|10|11|12|13)$/.test(String(s.antiSlip))) fail(p, `antiSlip "${s.antiSlip}" invalid`);
      const perM2 = p.price / p.content.amount;
      const porcelain = String(s.material ?? "").includes("porțelanat");
      const [lo, hi] = porcelain ? [50, 150] : [25, 60];
      if (perM2 < lo || perM2 > hi) fail(p, `floor tile ${perM2.toFixed(2)} RON/m² outside ${lo}–${hi}`);
    }
  }
  if (has("tile_adhesive") && p.content.amount === 25) {
    const cls = String(s.class);
    const [lo, hi] = cls === "C2TE S1" ? [80, 140] : cls.startsWith("C1") ? [35, 70] : [50, 95];
    if (p.price < lo || p.price > hi) fail(p, `25 kg ${cls} adhesive price ${p.price} outside ${lo}–${hi}`);
  }
  if (has("tile_adhesive") && !["C1", "C1T", "C1TE", "C2", "C2T", "C2TE", "C2TE S1", "C2TE S2"].includes(String(s.class))) {
    fail(p, `adhesive class "${s.class}" invalid`);
  }
  if (has("deck_board")) {
    if (!["pin tratat", "larice siberian", "WPC compozit"].includes(String(s.material))) fail(p, `deck material "${s.material}" invalid`);
    if (p.content.amount === 4) {
      const [lo, hi] = s.material === "pin tratat" ? [55, 90] : s.material === "WPC compozit" ? [150, 260] : [120, 180];
      if (p.price < lo || p.price > hi) fail(p, `4 m ${s.material} deck board price ${p.price} outside ${lo}–${hi}`);
    }
  }
  if (has("drywall_board")) {
    const m2 = ((s.widthMm as number) * (s.heightMm as number)) / 1e6;
    if (!approx(m2, p.content.amount, 0.005)) fail(p, `board ${s.widthMm}×${s.heightMm} = ${m2} m² ≠ ${p.content.amount}`);
    if (!["standard", "hidro", "fonic", "foc"].includes(String(s.type))) fail(p, `drywall type "${s.type}" invalid`);
    if (p.price < 35 || p.price > 60) fail(p, `drywall board price ${p.price} outside 35–60`);
  }
  if ((has("cw_profile") || has("uw_profile")) && ![50, 75].includes(s.widthMm as number)) fail(p, `profile widthMm must be 50 or 75`);
  if (has("fence_panel")) {
    if (s.widthM !== 1.8) fail(p, `fence panel widthM must be 1.8`);
    if (![0.9, 1.2, 1.8].includes(s.heightM as number)) fail(p, `fence panel heightM must be 0.9/1.2/1.8`);
    if (s.heightM === 1.8 && (p.price < 250 || p.price > 650)) fail(p, `180×180 panel price ${p.price} outside 250–650`);
  }
  if (has("fence_post") && ![1.5, 1.8, 2.4].includes(s.heightM as number)) fail(p, `fence post heightM must be 1.5/1.8/2.4`);
  if (has("cordless_drill") && s.voltage === 18 && (p.price < 450 || p.price > 1400)) fail(p, `18V drill price ${p.price} outside 450–1400`);
  if (has("interior_paint") && p.content.amount === 10 && s.color === "alb" && (p.price < 150 || p.price > 320)) {
    fail(p, `10 l white paint price ${p.price} outside 150–320`);
  }
  if (has("grass_seed") && !["universal", "sport", "umbră", "ornamental"].includes(String(s.type))) fail(p, `grass type "${s.type}" invalid`);
  if (has("deck_support") && !/^\d+-\d+$/.test(String(s.heightRangeMm))) fail(p, `heightRangeMm must look like "60-100"`);

  // pack size in the name for liquids / bagged goods
  if (unit === "l" || unit === "kg") {
    const token = `${roNum(p.content.amount)} ${unit}`;
    if (!p.name.includes(token)) fail(p, `name should state the pack size "${token}"`);
  }

  // bulky
  const mustBeBulky =
    p.roles.some((r) => ALWAYS_BULKY.has(r)) ||
    ((has("cw_profile") || has("uw_profile")) && (s.lengthM as number) >= 3) ||
    (unit === "kg" && p.content.amount >= 20);
  if (mustBeBulky && p.bulky !== true) fail(p, `should be bulky`);
  if (p.bulky !== undefined && typeof p.bulky !== "boolean") fail(p, `bulky must be boolean when present`);
}

// ───────────────────────── coverage per role ─────────────────────────
const byRole = new Map<MaterialRole, Product[]>();
for (const r of ALL_ROLES) byRole.set(r, []);
for (const p of catalog) for (const r of p.roles ?? []) byRole.get(r)?.push(p);

for (const r of ALL_ROLES) {
  const list = byRole.get(r)!;
  if (list.length === 0) {
    fail(null, `role ${r} has no products`);
    continue;
  }
  const tiers = new Set(list.map((p) => p.quality));
  if (CORE_ROLES.includes(r)) {
    if (list.length < 3) fail(null, `core role ${r} needs ≥3 products (has ${list.length})`);
    for (const t of TIERS) if (!tiers.has(t)) fail(null, `core role ${r} is missing a ${t} product`);
  } else if (TOOL_ROLES.has(r)) {
    if (list.length > 3) fail(null, `tool role ${r} should have 1–3 products (has ${list.length})`);
  } else if (list.length < 2) {
    fail(null, `consumable role ${r} needs ≥2 products (has ${list.length})`);
  }
}

// ───────────────────────── product lines & pack sizes ─────────────────────────
const lines = new Map<string, Product[]>();
for (const p of catalog) {
  const k = productLineKey(p);
  lines.set(k, [...(lines.get(k) ?? []), p]);
}
const multiSize = (role: MaterialRole) =>
  [...lines.values()].filter((l) => l[0].roles.includes(role) && new Set(l.map((p) => p.content.amount)).size >= 3);

for (const [key, l] of lines) {
  if (l.length < 2) continue;
  const amounts = l.map((p) => p.content.amount);
  if (new Set(amounts).size !== amounts.length) {
    fail(null, `product line "${key}" has two products with the same pack size: ${l.map((p) => p.sku).join(", ")}`);
  }
  const sorted = [...l].sort((a, b) => a.content.amount - b.content.amount);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].price / sorted[i - 1].content.amount;
    const cur = sorted[i].price / sorted[i].content.amount;
    if (cur >= prev - 1e-9) {
      fail(null, `line "${key}": ${sorted[i].name} (${cur.toFixed(3)}/unit) is not cheaper per unit than ${sorted[i - 1].name} (${prev.toFixed(3)}/unit)`);
    }
  }
}
if (multiSize("interior_paint").length === 0) fail(null, `interior_paint needs a line sold in ≥3 pack sizes`);
if (multiSize("primer").length === 0 && multiSize("deck_oil").length === 0) {
  fail(null, `primer or deck_oil needs a line sold in ≥3 pack sizes`);
}

// ───────────────────────── summary ─────────────────────────
const count = <T extends string>(xs: T[]) => {
  const m = new Map<T, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const pad = (s: string, n: number) => s + " ".repeat(Math.max(1, n - s.length));

console.log(`\nCatalog: ${catalog.length} products, ${new Set(catalog.map((p) => p.brand)).size} brands, ${lines.size} product lines\n`);
console.log("Per category:");
for (const [c, n] of count(catalog.map((p) => p.category))) console.log(`  ${pad(c, 14)}${n}`);
console.log("\nPer quality tier:");
for (const [t, n] of count(catalog.map((p) => p.quality))) console.log(`  ${pad(t, 14)}${n}`);
console.log("\nPer brand:");
for (const [b, n] of count(catalog.map((p) => p.brand))) console.log(`  ${pad(b, 14)}${n}`);
console.log("\nPer role (products | tiers):");
for (const r of ALL_ROLES) {
  const l = byRole.get(r)!;
  const tiers = TIERS.filter((t) => l.some((p) => p.quality === t)).map((t) => t[0].toUpperCase()).join("");
  const kind = CORE_ROLES.includes(r) ? "core" : TOOL_ROLES.has(r) ? "tool" : "cons";
  console.log(`  ${pad(r, 22)}${pad(String(l.length), 4)}${pad(tiers, 5)}${kind}`);
}
const multi = [...lines.values()].filter((l) => l.length > 1);
console.log(`\nMulti-size lines (${multi.length}):`);
for (const l of multi) {
  const sorted = [...l].sort((a, b) => a.content.amount - b.content.amount);
  console.log(
    `  ${l[0].brand} ${l[0].roles.join("+")}: ` +
      sorted.map((p) => `${p.content.amount} ${p.content.unit} @ ${(p.price / p.content.amount).toFixed(2)}`).join(" | "),
  );
}

if (errors.length) {
  console.error(`\n✗ ${errors.length} violation(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("\n✓ Catalog valid — no violations.");
