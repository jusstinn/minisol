/**
 * Core domain model for the project assistant.
 *
 * Everything the agent says about products, prices, stock and offers must come from
 * these structures (via tools). The LLM never computes prices or quantities itself.
 */

export type Lang = "ro" | "en";

export type CategoryId =
  | "paint"
  | "flooring"
  | "tiles"
  | "building"
  | "drywall"
  | "insulation"
  | "wood"
  | "garden"
  | "fencing"
  | "tools"
  | "power_tools"
  | "fasteners"
  | "adhesives"
  | "safety"
  | "electrical"
  | "plumbing"
  | "bathroom";

/** Base unit a material role is measured in (what calculators output). */
export type BaseUnit = "l" | "kg" | "m²" | "m" | "buc";

/**
 * Controlled vocabulary linking calculators ⇄ catalog. A calculator says
 * "you need 18.4 l of interior_paint"; the catalog says "this 10 l bucket
 * provides interior_paint, content 10 l". Pack maths is then deterministic.
 */
export const MATERIAL_ROLES = {
  // painting
  interior_paint: { unit: "l", label: "Vopsea lavabilă interior", labelEn: "Interior wall paint" },
  primer: { unit: "l", label: "Amorsă / grund", labelEn: "Primer" },
  wall_filler: { unit: "kg", label: "Glet / chit de reparații", labelEn: "Wall filler" },
  painters_tape: { unit: "m", label: "Bandă de mascare", labelEn: "Painter's tape" },
  protective_foil: { unit: "m²", label: "Folie de protecție", labelEn: "Protective sheeting" },
  paint_roller: { unit: "buc", label: "Trafalet", labelEn: "Paint roller" },
  paint_brush: { unit: "buc", label: "Pensulă", labelEn: "Paint brush" },
  paint_tray: { unit: "buc", label: "Tavă / grătar vopsea", labelEn: "Paint tray" },
  sandpaper: { unit: "buc", label: "Hârtie abrazivă", labelEn: "Sandpaper" },
  putty_knife: { unit: "buc", label: "Șpaclu", labelEn: "Putty knife" },

  // laminate / flooring
  laminate: { unit: "m²", label: "Parchet laminat", labelEn: "Laminate flooring" },
  underlay: { unit: "m²", label: "Folie / suport parchet", labelEn: "Flooring underlay" },
  vapor_barrier: { unit: "m²", label: "Folie barieră vapori", labelEn: "Vapour barrier" },
  skirting_board: { unit: "m", label: "Plintă", labelEn: "Skirting board" },
  transition_profile: { unit: "buc", label: "Profil de trecere", labelEn: "Transition strip" },
  flooring_install_kit: { unit: "buc", label: "Kit montaj parchet", labelEn: "Flooring install kit" },

  // tiling
  floor_tiles: { unit: "m²", label: "Gresie", labelEn: "Floor tiles" },
  wall_tiles: { unit: "m²", label: "Faianță", labelEn: "Wall tiles" },
  tile_adhesive: { unit: "kg", label: "Adeziv gresie/faianță", labelEn: "Tile adhesive" },
  tile_grout: { unit: "kg", label: "Chit de rosturi", labelEn: "Tile grout" },
  tile_spacers: { unit: "buc", label: "Distanțieri / cruciulițe", labelEn: "Tile spacers" },
  waterproofing: { unit: "kg", label: "Hidroizolație", labelEn: "Waterproofing membrane" },
  substrate_primer: { unit: "l", label: "Amorsă suport", labelEn: "Substrate primer" },
  sanitary_silicone: { unit: "buc", label: "Silicon sanitar", labelEn: "Sanitary silicone" },
  notched_trowel: { unit: "buc", label: "Gletieră dințată", labelEn: "Notched trowel" },
  tile_cutter: { unit: "buc", label: "Mașină de tăiat gresie", labelEn: "Tile cutter" },
  grout_float: { unit: "buc", label: "Drișcă de cauciuc", labelEn: "Grout float" },
  mixing_paddle: { unit: "buc", label: "Paletă de amestec", labelEn: "Mixing paddle" },
  bucket: { unit: "buc", label: "Găleată", labelEn: "Bucket" },
  rubber_mallet: { unit: "buc", label: "Ciocan de cauciuc", labelEn: "Rubber mallet" },

  // decking
  deck_board: { unit: "m", label: "Deck / scândură terasă", labelEn: "Deck board" },
  deck_joist: { unit: "m", label: "Grindă suport (joist)", labelEn: "Deck joist" },
  deck_screws: { unit: "buc", label: "Șuruburi terasă", labelEn: "Deck screws" },
  deck_support: { unit: "buc", label: "Suport reglabil / plot", labelEn: "Adjustable deck support" },
  weed_membrane: { unit: "m²", label: "Geotextil anti-buruieni", labelEn: "Weed membrane" },
  deck_oil: { unit: "l", label: "Ulei pentru terasă", labelEn: "Decking oil" },

  // fencing
  fence_panel: { unit: "buc", label: "Panou gard", labelEn: "Fence panel" },
  fence_post: { unit: "buc", label: "Stâlp gard", labelEn: "Fence post" },
  post_concrete: { unit: "kg", label: "Beton rapid stâlpi", labelEn: "Post-fix concrete" },
  fence_fixings: { unit: "buc", label: "Cleme / accesorii prindere panou", labelEn: "Panel clips" },
  post_cap: { unit: "buc", label: "Capac stâlp", labelEn: "Post cap" },
  wood_stain: { unit: "l", label: "Lazură lemn", labelEn: "Wood stain" },
  post_hole_digger: { unit: "buc", label: "Burghiu de pământ / sapă", labelEn: "Post-hole digger" },
  fence_gate: { unit: "buc", label: "Poartă gard", labelEn: "Fence gate" },

  // drywall partition
  drywall_board: { unit: "m²", label: "Placă gips-carton", labelEn: "Plasterboard" },
  cw_profile: { unit: "m", label: "Profil CW", labelEn: "CW metal stud" },
  uw_profile: { unit: "m", label: "Profil UW", labelEn: "UW metal track" },
  drywall_screws: { unit: "buc", label: "Șuruburi gips-carton", labelEn: "Drywall screws" },
  anchor_dowels: { unit: "buc", label: "Dibluri cui", labelEn: "Hammer-in anchors" },
  joint_tape: { unit: "m", label: "Bandă de rost", labelEn: "Joint tape" },
  joint_compound: { unit: "kg", label: "Glet de rosturi", labelEn: "Joint compound" },
  mineral_wool: { unit: "m²", label: "Vată minerală", labelEn: "Mineral wool" },
  sealing_tape: { unit: "m", label: "Bandă etanșare profile", labelEn: "Sealing tape" },

  // lawn
  grass_seed: { unit: "kg", label: "Semințe gazon", labelEn: "Grass seed" },
  lawn_fertilizer: { unit: "kg", label: "Îngrășământ gazon", labelEn: "Lawn fertiliser" },
  topsoil: { unit: "l", label: "Pământ / substrat gazon", labelEn: "Lawn soil" },
  garden_rake: { unit: "buc", label: "Greblă", labelEn: "Rake" },
  lawn_roller: { unit: "buc", label: "Tăvălug gazon", labelEn: "Lawn roller" },
  garden_hose: { unit: "buc", label: "Furtun grădină", labelEn: "Garden hose" },
  sprinkler: { unit: "buc", label: "Aspersor", labelEn: "Sprinkler" },

  // fixtures, lights and garden furniture placed in the sketch
  toilet: { unit: "buc", label: "Vas WC", labelEn: "Toilet" },
  washbasin: { unit: "buc", label: "Lavoar", labelEn: "Washbasin" },
  shower_enclosure: { unit: "buc", label: "Cabină de duș", labelEn: "Shower enclosure" },
  bathtub: { unit: "buc", label: "Cadă", labelEn: "Bathtub" },
  bathroom_mirror: { unit: "buc", label: "Oglindă baie", labelEn: "Bathroom mirror" },
  towel_radiator: { unit: "buc", label: "Calorifer port-prosop", labelEn: "Towel radiator" },
  ceiling_light: { unit: "buc", label: "Plafonieră", labelEn: "Ceiling light" },
  wall_light: { unit: "buc", label: "Aplică", labelEn: "Wall light" },
  floor_lamp: { unit: "buc", label: "Lampadar", labelEn: "Floor lamp" },
  garden_light: { unit: "buc", label: "Lampă de grădină", labelEn: "Garden light" },
  garden_furniture: { unit: "buc", label: "Set mobilier grădină", labelEn: "Garden furniture set" },
  planter: { unit: "buc", label: "Jardinieră", labelEn: "Planter" },
  bbq: { unit: "buc", label: "Grătar", labelEn: "BBQ grill" },
  sun_lounger: { unit: "buc", label: "Șezlong", labelEn: "Sun lounger" },
  parasol: { unit: "buc", label: "Umbrelă de soare", labelEn: "Parasol" },

  // general tools / power tools / safety
  cordless_drill: { unit: "buc", label: "Mașină de găurit / înșurubat", labelEn: "Cordless drill" },
  jigsaw: { unit: "buc", label: "Fierăstrău pendular", labelEn: "Jigsaw" },
  mitre_saw: { unit: "buc", label: "Fierăstrău circular de masă / ferăstrău unghiular", labelEn: "Mitre saw" },
  hand_saw: { unit: "buc", label: "Fierăstrău manual", labelEn: "Hand saw" },
  tin_snips: { unit: "buc", label: "Foarfecă de tablă", labelEn: "Tin snips" },
  utility_knife: { unit: "buc", label: "Cutter", labelEn: "Utility knife" },
  measuring_tape: { unit: "buc", label: "Ruletă", labelEn: "Tape measure" },
  spirit_level: { unit: "buc", label: "Nivelă", labelEn: "Spirit level" },
  pencil: { unit: "buc", label: "Creion de tâmplărie", labelEn: "Carpenter's pencil" },
  caulking_gun: { unit: "buc", label: "Pistol silicon", labelEn: "Caulking gun" },
  work_gloves: { unit: "buc", label: "Mănuși de lucru", labelEn: "Work gloves" },
  safety_glasses: { unit: "buc", label: "Ochelari de protecție", labelEn: "Safety glasses" },
  dust_mask: { unit: "buc", label: "Mască de praf", labelEn: "Dust mask" },
  knee_pads: { unit: "buc", label: "Genunchiere", labelEn: "Knee pads" },
  ladder: { unit: "buc", label: "Scară", labelEn: "Ladder" },
  wheelbarrow: { unit: "buc", label: "Roabă", labelEn: "Wheelbarrow" },
  spade: { unit: "buc", label: "Cazma / lopată", labelEn: "Spade" },
} as const satisfies Record<string, { unit: BaseUnit; label: string; labelEn: string }>;

export type MaterialRole = keyof typeof MATERIAL_ROLES;

export const ALL_ROLES = Object.keys(MATERIAL_ROLES) as MaterialRole[];

export type QualityTier = "budget" | "standard" | "premium";

export interface Product {
  /** Article number, e.g. "10234567". */
  sku: string;
  name: string;
  nameEn: string;
  brand: string;
  category: CategoryId;
  /** Price in RON incl. VAT, per sales unit. */
  price: number;
  /**
   * Lowest price (RON incl. VAT, per sales unit) applied in the 30 days before today —
   * the only price a reduction may be compared against (Directive 98/6/EC art. 6a, as
   * amended by the Omnibus Directive 2019/2161). Supplied by the retailer's price
   * history; absent means the price has not changed in that window.
   */
  lowestPrice30d?: number;
  /** What the customer buys, in Romanian: "buc", "găleată", "pachet", "sac", "rolă", "cutie", "set". */
  salesUnit: string;
  /** Which calculator roles this product can satisfy (usually exactly one). */
  roles: MaterialRole[];
  /**
   * How much of the role's base unit ONE sales unit provides.
   * e.g. 10 l bucket → { amount: 10, unit: "l" }; laminate pack → { amount: 2.13, unit: "m²" };
   * 4 m deck board → { amount: 4, unit: "m" }; a single tool → { amount: 1, unit: "buc" }.
   */
  content: { amount: number; unit: BaseUnit };
  quality: QualityTier;
  /** Free-form technical specs (coverage, dimensions, class, colour, ...). */
  specs: Record<string, string | number | boolean>;
  description: string;
  descriptionEn: string;
  /** 1–5 */
  rating: number;
  /** True for items that are reusable tools (not consumed by the project). */
  isTool: boolean;
  /** Bulky items that cannot be delivered by courier (only pickup/truck delivery). */
  bulky?: boolean;
}

export interface Store {
  id: string;
  name: string;
  city: string;
  address?: string;
  lat: number;
  lng: number;
  openingHours: string;
  services: string[];
}

export type Tier = "Bronze" | "Silver" | "Gold";

export interface Purchase {
  date: string; // ISO date
  storeId: string;
  items: { sku: string; qty: number }[];
}

/** A WalletLoop member as held by the loyalty platform. */
export interface Customer {
  memberId: string;
  /** UI only. Never sent to the LLM (data minimisation). */
  firstName: string;
  tier: Tier;
  points: number;
  homeStoreId: string;
  location: { city: string; lat: number; lng: number };
  language: Lang;
  memberSince: string;
  segments: string[];
  purchases: Purchase[];
  consent: { personalization: boolean; location: boolean };
  walletPass: { platform: "apple" | "google"; installedAt: string };
}

export type OfferKind =
  | "percent_category" // X% off lines in categories
  | "percent_role" // X% off lines satisfying roles
  | "fixed_threshold" // fixed RON off when basket ≥ minSpend
  | "bundle_free_role" // buy N of role A, get cheapest line of role B free (1 unit)
  | "points_multiplier"; // extra points on categories

export interface Offer {
  id: string;
  title: string;
  titleEn: string;
  kind: OfferKind;
  percent?: number;
  amount?: number;
  minSpend?: number;
  categories?: CategoryId[];
  roles?: MaterialRole[];
  bundle?: { requiresRole: MaterialRole; requiresQty: number; freeRole: MaterialRole };
  multiplier?: number;
  eligibility: {
    minTier?: Tier;
    segments?: string[];
    memberIds?: string[];
  };
  validUntil: string; // ISO date
  /** Why this customer sees it — shown to the customer. */
  reason: string;
  reasonEn: string;
}

export interface Requirement {
  role: MaterialRole;
  /** Amount in the role's base unit. */
  quantity: number;
  unit: BaseUnit;
  /** Short explanation of how the quantity was derived (shown to the customer). */
  basis: string;
  optional?: boolean;
  isTool?: boolean;
  /**
   * For coverage-based materials (paint, oil, seed…): m² to cover incl. coats.
   * The resolver divides by the chosen product's coverage spec instead of using `quantity`.
   */
  areaToCover?: number;
  /** Preferred product specs, e.g. { heightM: 1.8 } for fence panels. Soft filter. */
  match?: Record<string, string | number | boolean>;
  /**
   * Quantity was computed for a reference product size; scale it for others.
   * e.g. deck boards computed for 145 mm width → 120 mm boards need 145/120 × more.
   */
  scaleBySpec?: { key: string; reference: number };
  /** Prefer products whose "min-max" range spec contains this value (e.g. pedestal height). */
  fitRange?: { key: string; value: number };
  /**
   * Structural members cut from linear stock (joists, studs): `count` pieces of `lengthM` each. An offcut
   * shorter than a member is waste, so 11 joists of 3 m need 11 bars of 4 m, not 34.65 m ÷ 4 = 9 bars.
   */
  members?: { count: number; lengthM: number }[];
}
