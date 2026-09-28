import type { Lang, Product } from "./types";

/**
 * Human-readable spec labels for the most useful keys, in display priority order.
 * Anything not listed is skipped in highlights (the full specs stay available to the agent).
 */
const LABELS: [key: string, ro: string, en: string, unit?: string][] = [
  ["material", "", ""],
  ["decor", "", ""],
  ["color", "culoare", "colour"],
  ["acClass", "clasa", "class"],
  ["class", "clasă", "class"],
  ["clasa", "clasă lavabilitate", "wash class"],
  ["coverageM2PerL", "randament", "coverage", "m²/l"],
  ["coverageM2PerKg", "randament", "coverage", "m²/kg"],
  ["sizeCm", "format", "size", "cm"],
  ["widthMm", "lățime", "width", "mm"],
  ["thicknessMm", "grosime", "thickness", "mm"],
  ["lengthM", "lungime", "length", "m"],
  ["heightM", "înălțime", "height", "m"],
  ["sectionMm", "secțiune", "section", "mm"],
  ["heightRangeMm", "reglaj", "adjusts", "mm"],
  ["finish", "finisaj", "finish"],
  ["pei", "PEI", "PEI"],
  ["antiSlip", "antiderapant", "anti-slip"],
  ["useClass", "clasă de utilizare", "use class"],
  ["m2PerPack", "", "", "m²/pachet"],
  ["m2PerBox", "", "", "m²/cutie"],
  ["perBox", "", "", "buc/cutie"],
  ["bagKg", "", "", "kg/sac"],
  ["voltage", "", "", "V"],
  ["batteryAh", "baterie", "battery", "Ah"],
  ["powerW", "putere", "power", "W"],
  ["type", "tip", "type"],
  ["waterResistant", "rezistent la apă", "water resistant"],
  ["frostResistant", "rezistent la îngheț", "frost resistant"],
  ["stainless", "inox", "stainless"],
  ["brushless", "motor brushless", "brushless motor"],
  ["uvResistant", "rezistent UV", "UV resistant"],
  ["lambda", "λ", "λ", "W/mK"],
];

export function specHighlights(p: Product, lang: Lang, max = 4): string[] {
  const out: string[] = [];
  for (const [key, ro, en, unit] of LABELS) {
    const v = p.specs[key];
    if (v === undefined || v === "" || v === false) continue;
    const label = lang === "en" ? en : ro;
    if (v === true) {
      if (label) out.push(label);
    } else {
      const value = typeof v === "number" ? v.toLocaleString(lang === "en" ? "en-GB" : "ro-RO") : String(v);
      out.push([label, `${value}${unit ? ` ${unit}` : ""}`].filter(Boolean).join(" "));
    }
    if (out.length >= max) break;
  }
  return out;
}

// ───────────────────────────── full spec table ─────────────────────────────

export interface SpecRow {
  key: string;
  label: string;
  value: string;
  /** False for keys we have no label for (shown raw at the end). */
  known: boolean;
}

type U = string | { ro: string; en: string };
/** key → [RO label, EN label, unit]. Order = display order (dimensions → contents → yield → material → performance → features). */
const TABLE: [key: string, ro: string, en: string, unit?: U][] = [
  // dimensions
  ["sizeCm", "Format", "Size", "cm"],
  ["sizeMm", "Dimensiuni", "Dimensions", "mm"],
  ["slabMm", "Format placă", "Slab size", "mm"],
  ["sheetMm", "Format coală", "Sheet size", "mm"],
  ["sectionMm", "Secțiune", "Section", "mm"],
  ["boardLengthMm", "Lungime placă", "Board length", "mm"],
  ["boardWidthMm", "Lățime placă", "Board width", "mm"],
  ["lengthM", "Lungime", "Length", "m"],
  ["lengthCm", "Lungime", "Length", "cm"],
  ["lengthMm", "Lungime", "Length", "mm"],
  ["widthM", "Lățime", "Width", "m"],
  ["widthCm", "Lățime", "Width", "cm"],
  ["widthMm", "Lățime", "Width", "mm"],
  ["heightM", "Înălțime", "Height", "m"],
  ["heightMm", "Înălțime", "Height", "mm"],
  ["heightRangeMm", "Reglaj înălțime", "Height range", "mm"],
  ["thicknessMm", "Grosime", "Thickness", "mm"],
  ["thicknessMicron", "Grosime", "Thickness", "µm"],
  ["steelMm", "Grosime tablă", "Steel gauge", "mm"],
  ["diameterMm", "Diametru", "Diameter", "mm"],
  ["diameterInch", "Diametru", "Diameter", "″"],
  ["diameterM", "Diametru udare", "Watering diameter", "m"],
  ["jointMm", "Rost", "Joint width", "mm"],
  ["tileThicknessMm", "Pentru plăci de", "For tiles", "mm"],
  ["postMm", "Pentru stâlp de", "Fits post", "mm"],
  ["floorThicknessMm", "Grosime pardoseală", "Floor thickness", "mm"],
  ["layerMm", "Grosime strat", "Layer thickness", "mm"],
  ["sizesMm", "Lățimi", "Widths", "mm"],
  ["bladeMm", "Lamă", "Blade", "mm"],
  ["bladeCm", "Lamă", "Blade", "cm"],
  ["bladeWidthMm", "Lățime lamă", "Blade width", "mm"],
  ["handleCm", "Coadă", "Handle", "cm"],
  ["rollerWidthCm", "Lățime trafalet", "Roller width", "cm"],
  ["trayWidthCm", "Lățime tavă", "Tray width", "cm"],
  ["maxRollerCm", "Trafalet maxim", "Max roller", "cm"],
  ["pileMm", "Lungime fir", "Pile", "mm"],
  ["notchMm", "Dinți", "Notch", "mm"],
  ["discMm", "Disc", "Disc", "mm"],
  ["wheelMm", "Rotiță de tăiere", "Scoring wheel", "mm"],
  ["paddleMm", "Paletă", "Paddle", "mm"],
  ["chuckMm", "Mandrină", "Chuck", "mm"],
  // contents per sales unit
  ["m2PerPack", "Suprafață / pachet", "Area per pack", "m²"],
  ["m2PerBox", "Suprafață / cutie", "Area per box", "m²"],
  ["m2PerRoll", "Suprafață / ambalaj", "Area per pack", "m²"],
  ["piecesPerBox", "Plăci / cutie", "Tiles per box", { ro: "buc", en: "pcs" }],
  ["boardsPerPack", "Plăci / pachet", "Boards per pack", { ro: "buc", en: "pcs" }],
  ["perBox", "Bucăți / cutie", "Pieces per box", { ro: "buc", en: "pcs" }],
  ["perBag", "Bucăți / pachet", "Pieces per bag", { ro: "buc", en: "pcs" }],
  ["perSet", "Bucăți / set", "Pieces per set", { ro: "buc", en: "pcs" }],
  ["pieces", "Bucăți", "Pieces", { ro: "buc", en: "pcs" }],
  ["sheets", "Coli", "Sheets", { ro: "buc", en: "pcs" }],
  ["bagKg", "Cantitate netă", "Net weight", "kg"],
  ["kg", "Cantitate netă", "Net weight", "kg"],
  ["litres", "Volum", "Volume", "l"],
  ["volumeL", "Volum", "Volume", "l"],
  ["volumeMl", "Volum", "Volume", "ml"],
  ["cartridgeMl", "Cartuș", "Cartridge", "ml"],
  // yield / use
  ["coverageM2PerL", "Randament (pe strat)", "Coverage (per coat)", "m²/l"],
  ["coverageM2PerKg", "Randament", "Coverage", "m²/kg"],
  ["consumptionKgPerM2", "Consum", "Consumption", "kg/m²"],
  ["consumptionKgPerM2PerMm", "Consum la 1 mm", "Consumption per mm", "kg/m²"],
  ["coats", "Straturi recomandate", "Recommended coats"],
  ["coverageM2", "Suprafață udată", "Watering area", "m²"],
  ["overlapCm", "Suprapunere", "Overlap", "cm"],
  ["expansionGapMm", "Rost de dilatație", "Expansion gap", "mm"],
  ["waterLPerBag", "Apă / sac", "Water per bag", "l"],
  ["dilution", "Diluție", "Dilution"],
  ["maxDepthMm", "Adâncime maximă", "Max depth", "mm"],
  ["maxDepthM", "Adâncime maximă", "Max depth", "m"],
  ["levelsUpToMm", "Compensează denivelări", "Levels unevenness up to", "mm"],
  ["maxHeightDiffMm", "Diferență de nivel max.", "Max height difference", "mm"],
  ["paintableAfterH", "Se vopsește după", "Paintable after", "h"],
  ["setTimeMin", "Priză", "Sets in", "min"],
  ["workingTimeMin", "Timp de lucru", "Working time", "min"],
  ["potLifeMin", "Timp de lucru", "Pot life", "min"],
  ["effectMonths", "Efect", "Lasts", { ro: "luni", en: "months" }],
  ["removeWithinDays", "Se dezlipește în", "Remove within", { ro: "zile", en: "days" }],
  // material & finish
  ["material", "Material", "Material"],
  ["decor", "Decor", "Decor"],
  ["color", "Culoare", "Colour"],
  ["finish", "Finisaj", "Finish"],
  ["base", "Bază", "Base"],
  ["type", "Tip", "Type"],
  ["mix", "Amestec", "Mix"],
  ["npk", "NPK", "NPK"],
  ["ph", "pH", "pH"],
  ["weightGm2", "Gramaj", "Weight", "g/m²"],
  ["weightG", "Greutate", "Weight", "g"],
  ["bevel", "Teșire", "Bevel"],
  ["shape", "Formă", "Shape"],
  ["drive", "Amprentă", "Drive"],
  ["grade", "Calitate inox", "Stainless grade"],
  ["grit", "Granulație", "Grit"],
  ["bristle", "Fir", "Bristle"],
  ["coating", "Acoperire", "Coating"],
  ["lens", "Lentilă", "Lens"],
  ["handle", "Mâner", "Handle"],
  ["handles", "Cozi", "Handles"],
  ["body", "Carcasă", "Body"],
  ["shell", "Carcasă", "Shell"],
  ["frame", "Cadru", "Frame"],
  ["tray", "Cuvă", "Tray"],
  ["wheel", "Roată", "Wheel"],
  ["blade", "Lamă", "Blade"],
  ["padMaterial", "Talpă", "Pad"],
  ["padding", "Căptușeală", "Padding"],
  ["strap", "Prindere", "Strap"],
  ["shank", "Prindere", "Shank"],
  ["headColor", "Culoare cap", "Head colour"],
  ["mounting", "Montaj", "Mounting"],
  ["hardware", "Feronerie", "Hardware"],
  ["mixing", "Preparare", "Mixing"],
  ["fill", "Umplere", "Fill"],
  ["use", "Utilizare", "Use"],
  // classes & performance
  ["acClass", "Clasă de uzură", "Wear class"],
  ["clasa", "Clasă lavabilitate", "Wash class"],
  ["class", "Clasă", "Class"],
  ["pei", "Clasă PEI", "PEI class"],
  ["antiSlip", "Clasă antiderapantă", "Slip rating"],
  ["useClass", "Clasă de utilizare", "Use class"],
  ["strengthClass", "Clasă de rezistență", "Strength class"],
  ["fireClass", "Reacție la foc", "Fire class"],
  ["lambda", "Conductivitate λ", "Conductivity λ", "W/mK"],
  ["impactSoundDb", "Reducere zgomot de impact", "Impact sound reduction", "dB"],
  ["finishLevel", "Nivel finisaj", "Finish level"],
  ["cutLevel", "Nivel protecție la tăiere", "Cut level"],
  ["standard", "Standard", "Standard"],
  ["maxLoadKg", "Sarcină maximă", "Max load", "kg"],
  ["maxWeightKg", "Greutate maximă (umplut)", "Max weight (filled)", "kg"],
  ["maxBatchKg", "Amestec maxim", "Max batch", "kg"],
  ["slopeCompensation", "Compensare pantă", "Slope compensation"],
  ["voltage", "Tensiune", "Voltage", "V"],
  ["batteryAh", "Acumulator", "Battery", "Ah"],
  ["batteries", "Acumulatori", "Batteries", { ro: "buc", en: "pcs" }],
  ["powerW", "Putere", "Power", "W"],
  ["torqueNm", "Cuplu", "Torque", "Nm"],
  ["speeds", "Viteze", "Speeds"],
  ["maxCutMm", "Lungime maximă de tăiere", "Max cut length", "mm"],
  ["maxCutWidthMm", "Lățime maximă de tăiere", "Max cut width", "mm"],
  ["maxCutWoodMm", "Tăiere în lemn", "Max cut in wood", "mm"],
  ["maxThicknessMm", "Grosime placă max.", "Max tile thickness", "mm"],
  ["maxSteelMm", "Tablă max.", "Max sheet steel", "mm"],
  ["maxBevel", "Înclinare max.", "Max bevel", "°"],
  ["teeth", "Dinți", "Teeth"],
  ["tpi", "Dinți / țol", "Teeth per inch", "TPI"],
  ["angles", "Unghiuri", "Angles"],
  ["pendulumSettings", "Trepte pendulare", "Pendulum settings"],
  ["hammerG", "Ciocan", "Hammer", "g"],
  ["spacers", "Distanțiere", "Spacers", { ro: "buc", en: "pcs" }],
  ["spareBlades", "Lame de rezervă", "Spare blades", { ro: "buc", en: "pcs" }],
  ["rangeM", "Rază de acțiune", "Range", "m"],
  ["accuracyMm", "Precizie ±", "Accuracy ±", "mm"],
  ["accuracyMmPerM", "Precizie ±", "Accuracy ±", "mm/m"],
  ["accuracyMmPer10M", "Precizie ±", "Accuracy ±", "mm / 10 m"],
  ["accuracyClass", "Clasă de precizie", "Accuracy class"],
  ["vials", "Bule", "Vials"],
  ["lines", "Linii", "Lines"],
  ["functions", "Funcții", "Functions"],
  ["thrustRatio", "Raport de împingere", "Thrust ratio"],
  ["steps", "Trepte", "Steps"],
  ["workingHeightM", "Înălțime de lucru", "Working height", "m"],
  ["configurations", "Configurații", "Configurations"],
  ["layers", "Straturi", "Layers"],
  ["arms", "Brațe", "Arms"],
  ["nozzles", "Duze", "Nozzles"],
  ["pattern", "Model udare", "Pattern"],
  ["components", "Componente", "Components"],
  ["size", "Mărime", "Size"],
  ["hardness", "Duritate", "Hardness"],
  ["cut", "Tăietură", "Cut"],
  // features (booleans)
  ["waterResistant", "Rezistent la apă", "Water resistant"],
  ["frostResistant", "Rezistent la îngheț", "Frost resistant"],
  ["uvResistant", "Rezistent UV", "UV resistant"],
  ["uvStabilised", "Stabilizat UV", "UV stabilised"],
  ["stainless", "Inox", "Stainless"],
  ["rectified", "Rectificată", "Rectified"],
  ["fullBody", "Colorată în masă", "Full body"],
  ["bevelledEdge", "Margini teșite", "Bevelled edges"],
  ["handmadeLook", "Aspect artizanal", "Handmade look"],
  ["hollow", "Profil gol", "Hollow profile"],
  ["coextruded", "Co-extrudat", "Co-extruded"],
  ["opaque", "Opac", "Privacy (opaque)"],
  ["reinforced", "Armată", "Reinforced"],
  ["woven", "Țesut", "Woven"],
  ["vaporBarrier", "Barieră de vapori integrată", "Built-in vapour barrier"],
  ["underfloorHeating", "Încălzire în pardoseală", "Underfloor heating"],
  ["cableChannel", "Canal pentru cablu", "Cable channel"],
  ["clipChannel", "Canal pentru clipsuri", "Clip channel"],
  ["selfAdhesive", "Autoadezivă", "Self-adhesive"],
  ["pretaped", "Cu bandă de mascare", "Pre-taped"],
  ["readyToUse", "Gata de utilizare", "Ready to use"],
  ["antiMould", "Anti-mucegai", "Anti-mould"],
  ["fungicide", "Cu fungicid", "Fungicide"],
  ["noDrip", "Nu picură", "No drip"],
  ["antiDrip", "Anti-picurare", "Anti-drip"],
  ["slowRelease", "Eliberare lentă", "Slow release"],
  ["starterFertiliser", "Cu îngrășământ starter", "Starter fertiliser"],
  ["selfLevellingHead", "Cap autonivelant", "Self-levelling head"],
  ["screwsIncluded", "Șuruburi incluse", "Screws included"],
  ["brushless", "Motor fără perii", "Brushless motor"],
  ["hammer", "Percuție", "Hammer action"],
  ["batteryIncluded", "Acumulator inclus", "Battery included"],
  ["laser", "Ghidaj laser", "Laser guide"],
  ["laserGuide", "Ghidaj laser", "Laser guide"],
  ["waterCooled", "Răcire cu apă", "Water-cooled"],
  ["diagonalCut45", "Tăiere diagonală 45°", "45° diagonal cut"],
  ["selfLevelling", "Autonivelare", "Self-levelling"],
  ["magneticHook", "Cârlig magnetic", "Magnetic hook"],
  ["telescopicThread", "Filet pentru coadă telescopică", "Telescopic pole thread"],
  ["tappingBlock", "Calapod de batere", "Tapping block"],
  ["pullBar", "Levier de tragere", "Pull bar"],
  ["graduated", "Gradată", "Graduated"],
  ["spout", "Cioc de turnare", "Pouring spout"],
  ["kinkResistant", "Anti-răsucire", "Kink resistant"],
  ["autoLock", "Blocare automată", "Auto-lock"],
  ["hardenedTeeth", "Dinți căliți", "Hardened teeth"],
  ["nonMarking", "Nu lasă urme", "Non-marking"],
  ["antiFog", "Anti-aburire", "Anti-fog"],
  ["antiScratch", "Anti-zgâriere", "Anti-scratch"],
  ["valve", "Supapă", "Valve"],
  ["ventilation", "Ventilație", "Ventilation"],
];
const TABLE_INDEX = new Map(TABLE.map((row, i) => [row[0], i]));

/** Common catalogue values, so the English sheet doesn't read half in Romanian. */
const VALUE_EN: Record<string, string> = {
  alb: "white",
  gri: "grey",
  "gri perlă": "pearl grey",
  antracit: "anthracite",
  negru: "black",
  bej: "beige",
  "bej nisip": "sand beige",
  "bej bahama": "bahama beige",
  maro: "brown",
  natur: "natural",
  incolor: "clear",
  transparent: "transparent",
  "alb marmorat": "white marble",
  "alb cu granule": "white terrazzo",
  "verde salvie": "sage green",
  "albastru deschis": "light blue",
  roz: "pink",
  nuc: "walnut",
  pin: "pine",
  palisandru: "rosewood",
  "alb grunduit": "white primed",
  "stejar lăcuit": "lacquered oak",
  mat: "matt",
  satinat: "satin",
  lucios: "gloss",
  fosfatat: "phosphated",
  "pin tratat": "treated pine",
  "larice siberian": "Siberian larch",
  "WPC compozit": "WPC composite",
  aluminiu: "aluminium",
  "aluminiu anodizat": "anodised aluminium",
  "oțel zincat": "galvanised steel",
  oțel: "steel",
  inox: "stainless steel",
  "stejar masiv": "solid oak",
  "PVC flexibil": "flexible PVC",
  "gresie ceramică": "ceramic floor tile",
  "gresie porțelanată": "porcelain stoneware",
  "faianță ceramică": "ceramic wall tile",
  "vată de sticlă": "glass wool",
  "vată bazaltică": "stone wool",
  "hârtie microperforată": "micro-perforated paper",
  "fibră de sticlă": "glass fibre",
  "spumă PE": "PE foam",
  "polistiren extrudat": "extruded polystyrene",
  "fibră de lemn": "wood fibre",
  "polimer mineral": "mineral polymer",
  poliacril: "polyacrylic",
  microfibră: "microfibre",
  polipropilenă: "polypropylene",
  "piele de capră": "goatskin",
  policarbonat: "polycarbonate",
  nitril: "nitrile",
  apă: "water",
  solvent: "solvent",
  turbă: "peat",
  "apă, uleiuri vegetale": "water, plant oils",
  "ulei-ceară": "hard wax oil",
  "turbă, nisip, compost": "peat, sand, compost",
  fără: "none",
  piramidal: "pyramid",
  plat: "flat",
  cruce: "cross",
  "clips nivelare": "levelling clip",
  hidro: "moisture-resistant",
  fonic: "acoustic",
  foc: "fire-resistant",
  umbră: "shade",
  acetic: "acetic",
  neutru: "neutral",
  sintetic: "synthetic",
  "sintetic subțiat": "tapered synthetic",
  "fără amestecare": "no mixing",
  "înșurubare": "screw-fixed",
  autoadeziv: "self-adhesive",
  "interior/exterior": "interior/exterior",
  "până la 1:1 cu apă": "up to 1:1 with water",
  "hexagonal 10 mm": "10 mm hex",
  "bi-material": "two-component",
  metalic: "metal",
  frasin: "ash",
  "fibră de sticlă cu mâner D": "fibreglass, D-handle",
  "cauciuc moale": "soft rubber",
  gel: "gel",
  dur: "hard",
  pneumatică: "pneumatic",
  "anti-pană": "puncture-proof",
  "apă sau nisip": "water or sand",
  dreptunghiular: "rectangular",
  circular: "circular",
  segmentată: "snap-off",
  dreaptă: "straight",
  indirectă: "indirect",
  "orizontală + verticală": "horizontal + vertical",
  "trecere/denivelare/capăt": "transition/level/end",
  "suprafață, volum, Pitagora": "area, volume, Pythagoras",
};

const fmtNumber = (n: number, lang: Lang) => n.toLocaleString(lang === "en" ? "en-GB" : "ro-RO", { maximumFractionDigits: 3 });

/** "45x70" → "45 × 70", "35-55" → "35–55", decimals in the reader's locale. */
function fmtString(v: string, lang: Lang): string {
  let s = v.trim();
  if (lang === "en" && VALUE_EN[s]) return VALUE_EN[s];
  const n = String.raw`\d+(?:[.,]\d+)?`;
  // Only whole-value sizes and ranges ("45x70", "100x70x25", "35-55") — not "12-20-10" (NPK) or "C20/25".
  if (new RegExp(`^${n}(?:\\s*[x×]\\s*${n}){1,2}$`, "i").test(s)) s = s.replace(/\s*[x×]\s*/gi, " × ");
  else if (new RegExp(`^${n}\\s*[-–]\\s*${n}$`).test(s)) s = s.replace(/\s*[-–]\s*/, "–");
  if (lang === "en") s = s.replace(/(\d),(\d)/g, "$1.$2");
  else s = s.replace(/(\d)\.(\d)/g, "$1,$2");
  return s;
}

/**
 * Every spec of a product as label/value rows with readable units, in a stable
 * technical order. Keys without a label are appended raw at the end.
 */
export function specTable(p: Product, lang: Lang): SpecRow[] {
  const known: (SpecRow & { order: number })[] = [];
  const unknown: SpecRow[] = [];
  const yes = lang === "en" ? "yes" : "da";
  const no = lang === "en" ? "no" : "nu";
  for (const [key, raw] of Object.entries(p.specs)) {
    if (raw === "" || raw === null || raw === undefined) continue;
    const i = TABLE_INDEX.get(key);
    const unitDef = i === undefined ? undefined : TABLE[i][3];
    const unit = unitDef === undefined ? "" : typeof unitDef === "string" ? unitDef : unitDef[lang];
    let value = typeof raw === "boolean" ? (raw ? yes : no) : typeof raw === "number" ? fmtNumber(raw, lang) : fmtString(raw, lang);
    if (unit && typeof raw !== "boolean") value = unit === "″" ? `${value}${unit}` : `${value} ${unit}`;
    if (i === undefined) unknown.push({ key, label: key, value, known: false });
    else known.push({ key, label: lang === "en" ? TABLE[i][2] : TABLE[i][1], value, known: true, order: i });
  }
  known.sort((a, b) => a.order - b.order);
  return [...known.map(({ order: _o, ...r }) => r), ...unknown];
}
