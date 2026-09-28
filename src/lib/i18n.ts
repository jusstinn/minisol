import type { Lang } from "@/domain/types";

const STRINGS = {
  headline: { ro: ["Construim", "în weekendul ăsta?"], en: ["Let's build", "this weekend."] },
  projects: {
    ro: ["terasa", "baia", "gardul", "dormitorul", "peretele", "gazonul", "aleea", "livingul"],
    en: ["the deck", "the bathroom", "the fence", "the bedroom", "the wall", "the lawn", "the path", "the living room"],
  },
  subhead: {
    ro: "Spune-i ce vrei să faci. Primești planul pas cu pas, lista completă de materiale, prețul tău cu oferte personale și unde e totul pe stoc.",
    en: "Tell it what you want to do. Get a step-by-step plan, the complete materials list, your personal price with offers, and where everything is in stock.",
  },
  pickPass: { ro: "Alege un card de fidelitate demo", en: "Pick a demo loyalty card" },
  fromWallet: { ro: "Deschis din Wallet", en: "Opened from Wallet" },
  placeholder: { ro: "Descrie proiectul… ex. „vreau o terasă de 4 × 3 m în curte”", en: "Describe your project… e.g. “I want a 4 × 3 m deck in the garden”" },
  /** Phones: the landing box is ~150 px wide next to the mic and start buttons. */
  placeholderShort: { ro: "Descrie proiectul… ex. „terasă 4 × 3 m”", en: "Describe your project… e.g. “a 4 × 3 m deck”" },
  placeholderFollow: { ro: "Întreabă sau cere o modificare…", en: "Ask or request a change…" },
  start: { ro: "Începe", en: "Start" },
  send: { ro: "Trimite", en: "Send" },
  points: { ro: "puncte", en: "points" },
  member: { ro: "Membru", en: "Member" },
  since: { ro: "din", en: "since" },
  homeStore: { ro: "Magazinul tău", en: "Your store" },
  boardEmpty: { ro: "Planul tău apare aici", en: "Your plan appears here" },
  boardEmptySub: {
    ro: "Pe măsură ce vorbiți, Blueprint desenează proiectul în 3D, calculează materialele și verifică stocul.",
    en: "As you talk, Blueprint draws your project in 3D, calculates materials and checks stock.",
  },
  total: { ro: "Total proiect", en: "Project total" },
  youSave: { ro: "Economisești", en: "You save" },
  earn: { ro: "Câștigi", en: "You earn" },
  shoppingList: { ro: "Lista de cumpărături", en: "Shopping list" },
  products: { ro: "produse", en: "products" },
  alreadyOwn: { ro: "Ai deja — nu le mai cumperi", en: "You already own — skipped" },
  suggestions: { ro: "Poate îți mai trebuie", en: "You might also need" },
  add: { ro: "Adaugă", en: "Add" },
  aisle: { ro: "Culoar", en: "Aisle" },
  inStock: { ro: "Pe stoc", en: "In stock" },
  low: { ro: "Stoc redus", en: "Low stock" },
  insufficient: { ro: "Insuficient", en: "Not enough" },
  out: { ro: "Epuizat", en: "Out of stock" },
  allInStockAt: { ro: "Totul e pe stoc la", en: "Everything in stock at" },
  missingAt: { ro: "Lipsesc produse la", en: "Items missing at" },
  moveTo: { ro: "Mută la", en: "Move to" },
  byCategory: { ro: "Pe categorii", en: "By category" },
  redeem: { ro: "Plătește cu puncte", en: "Pay with points" },
  delivery: { ro: "Livrare", en: "Delivery" },
  free: { ro: "gratuită", en: "free" },
  truck: { ro: "camion", en: "truck" },
  courier: { ro: "curier", en: "courier" },
  plan: { ro: "Planul de lucru", en: "Work plan" },
  tips: { ro: "Sfaturi de meșter", en: "Pro tips" },
  safety: { ro: "Siguranță", en: "Safety" },
  stock: { ro: "Stoc în magazine", en: "Stock by store" },
  offers: { ro: "Ofertele tale", en: "Your offers" },
  applied: { ro: "Aplicat", en: "Applied" },
  validUntil: { ro: "valabil până la", en: "valid until" },
  measurements: { ro: "Măsurători", en: "Measurements" },
  assumptions: { ro: "Presupuneri", en: "Assumptions" },
  hours: { ro: "ore", en: "hours" },
  people: { ro: "pers.", en: "people" },
  difficulty: { ro: "Dificultate", en: "Difficulty" },
  viewBlueprint: { ro: "Plan", en: "Blueprint" },
  viewReal: { ro: "Real", en: "Real" },
  viewExploded: { ro: "Explodat", en: "Exploded" },
  sendToWallet: { ro: "Trimite lista în Wallet", en: "Send list to Wallet" },
  reserve: { ro: "Rezervă pentru ridicare", en: "Reserve for pickup" },
  newProject: { ro: "Proiect nou", en: "New project" },
  switchMember: { ro: "Schimbă membrul", en: "Switch member" },
  searchResults: { ro: "Rezultate", en: "Results" },
  thinking: { ro: "Mă gândesc", en: "Thinking" },
  error: { ro: "Ceva n-a mers. Încearcă din nou.", en: "Something went wrong. Please try again." },
  quick: {
    ro: ["Variantă mai ieftină", "Vreau premium", "Ce oferte am?", "Unde e totul pe stoc?", "Adaugă sugestiile"],
    en: ["Cheaper option", "Go premium", "What offers do I have?", "Where is everything in stock?", "Add the suggestions"],
  },
  privacy: {
    ro: "Asistentul vede doar nivelul, punctele, magazinul și interesele tale — niciodată numele sau datele de contact.",
    en: "The assistant only sees your tier, points, store and interests — never your name or contact details.",
  },
  /** EU AI Act transparency: say plainly that the customer is dealing with an AI system. */
  aiIntro: {
    ro: "Blueprint este un asistent AI.",
    en: "Blueprint is an AI assistant.",
  },
  aiNotice: {
    ro: "Vorbești cu un asistent AI. Cifrele sunt verificate de motorul de prețuri; schițele și planul sunt orientative.",
    en: "You're talking to an AI assistant. Figures are checked by the pricing engine; sketches and the plan are indicative.",
  },
  noPersonalization: { ro: "Fără personalizare (fără consimțământ)", en: "No personalisation (no consent)" },
  // Price display (EU/RO consumer law): prior price on reductions, personalised prices, VAT.
  /** Omnibus (Dir. 98/6/EC art. 6a): the reference for any crossed-out price. */
  lowest30: { ro: "Cel mai mic preț din ultimele 30 de zile", en: "Lowest price in the last 30 days" },
  /** Shown instead of the struck price for screen readers. */
  referencePrice: { ro: "Preț de referință", en: "Reference price" },
  /** Hint on the basket's struck-through "was" total. */
  compareAtHint: {
    ro: "Produsele reduse sunt comparate cu cel mai mic preț al lor din ultimele 30 de zile.",
    en: "Reduced items are compared with their lowest price in the last 30 days.",
  },
  /** CRD art. 6(1)(ea): line badge, "{label} · membru {program}" / "{label} · {program} member". */
  personalisedPrice: { ro: "Preț personalizat", en: "Personalised price" },
  personalisedWhy: {
    ro: "Reducere stabilită automat pe baza profilului tău WalletLoop (nivel, segmente de interes, istoric de cumpărături). Alți clienți pot vedea alt preț.",
    en: "Discount set automatically from your WalletLoop profile (tier, interest segments, purchase history). Other customers may see a different price.",
  },
  personalisedDisclosure: {
    ro: "Unele prețuri sunt personalizate pentru tine, pe baza prelucrării automate a profilului tău WalletLoop.",
    en: "Some prices are personalised for you, based on automated processing of your WalletLoop profile.",
  },
  vatIncluded: { ro: "Prețurile includ TVA.", en: "Prices include VAT." },
  demoNote: { ro: "Demo · date de catalog și stoc fictive", en: "Demo · fictional catalogue & stock data" },
} as const;

type Key = keyof typeof STRINGS;

export function tr<K extends Key>(key: K, lang: Lang): (typeof STRINGS)[K]["ro"] {
  return STRINGS[key][lang] as (typeof STRINGS)[K]["ro"];
}

export const PROJECT_STARTERS: { id: string; icon: string; ro: string; en: string; promptRo: string; promptEn: string }[] = [
  { id: "deck", icon: "deck", ro: "Terasă 4 × 3 m", en: "4 × 3 m deck", promptRo: "Vreau să-mi fac o terasă din lemn de 4 x 3 m în curte, pe pământ.", promptEn: "I want to build a 4 x 3 m wooden deck in my garden, on soil." },
  { id: "paint", icon: "paint", ro: "Vopsesc dormitorul", en: "Paint the bedroom", promptRo: "Vreau să vopsesc dormitorul: 4 x 3,5 m, înălțime 2,6 m, o ușă și o fereastră, inclusiv tavanul.", promptEn: "I want to paint my bedroom: 4 x 3.5 m, 2.6 m high, one door and one window, ceiling included." },
  { id: "laminate", icon: "laminate", ro: "Parchet în living", en: "Laminate in the living room", promptRo: "Vreau parchet laminat în living, 5 x 4 m, pe șapă de beton.", promptEn: "I want laminate flooring in my living room, 5 x 4 m, on a concrete screed." },
  { id: "bath", icon: "tiles", ro: "Baie nouă", en: "New bathroom", promptRo: "Refac baia: 2,5 x 2 m, gresie pe jos și faianță pe pereți.", promptEn: "I'm redoing my bathroom: 2.5 x 2 m, floor tiles and wall tiles." },
  { id: "fence", icon: "fence", ro: "Gard 20 m", en: "20 m fence", promptRo: "Am nevoie de un gard din panouri de 20 m lungime, 1,8 m înălțime.", promptEn: "I need a 20 m long panel fence, 1.8 m high." },
  { id: "drywall", icon: "drywall", ro: "Perete gips-carton", en: "Drywall partition", promptRo: "Vreau să împart o cameră cu un perete de gips-carton de 3,5 m lungime, 2,6 m înălțime, cu o ușă.", promptEn: "I want to split a room with a 3.5 m long, 2.6 m high drywall partition with one door." },
  { id: "lawn", icon: "lawn", ro: "Gazon nou", en: "New lawn", promptRo: "Vreau gazon nou pe 80 mp în spatele casei.", promptEn: "I want a new lawn on 80 m² behind the house." },
  {
    id: "paving",
    icon: "paving",
    ro: "Alee din pavele 6 × 1,2 m",
    en: "Paver path 6 × 1.2 m",
    promptRo: "Vreau o alee din pavele de 6 x 1,2 m prin grădină, cu borduri pe margini.",
    promptEn: "I want a 6 x 1.2 m paver path through the garden, with edging along the sides.",
  },
];
