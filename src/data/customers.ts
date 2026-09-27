import type { Customer, MaterialRole, QualityTier } from "@/domain/types";

/**
 * Demo WalletLoop members. Purchase history is written by *role* and resolved to
 * catalogue SKUs at load time, so the seed survives catalogue changes.
 */
export interface CustomerSeed extends Omit<Customer, "purchases"> {
  /** Short persona description for the demo picker (not sent to the LLM). */
  persona: string;
  personaEn: string;
  purchases: {
    date: string;
    storeId: string;
    items: { role: MaterialRole; quality?: QualityTier; qty: number }[];
  }[];
}

export const CUSTOMER_SEEDS: CustomerSeed[] = [
  {
    memberId: "WL-RO-100231",
    firstName: "Andrei",
    persona: "Renovează apartamentul în Drumul Taberei. Are deja scule.",
    personaEn: "Renovating a flat in Drumul Taberei. Already owns tools.",
    tier: "Gold",
    points: 4820,
    homeStoreId: "buc-militari",
    location: { city: "București", lat: 44.425, lng: 26.033 },
    language: "ro",
    memberSince: "2021-03-18",
    segments: ["renovator", "homeowner"],
    consent: { personalization: true, location: true },
    walletPass: { platform: "apple", installedAt: "2024-02-11" },
    purchases: [
      {
        date: "2025-11-08",
        storeId: "buc-militari",
        items: [
          { role: "interior_paint", qty: 2 },
          { role: "paint_roller", qty: 1 },
          { role: "paint_tray", qty: 1 },
        ],
      },
      {
        date: "2026-03-14",
        storeId: "buc-militari",
        items: [
          { role: "cordless_drill", quality: "premium", qty: 1 },
          { role: "jigsaw", qty: 1 },
          { role: "spirit_level", qty: 1 },
          { role: "measuring_tape", qty: 1 },
        ],
      },
      {
        date: "2026-08-29",
        storeId: "buc-berceni",
        items: [
          { role: "drywall_board", qty: 12 },
          { role: "joint_compound", qty: 1 },
          { role: "utility_knife", qty: 1 },
        ],
      },
    ],
  },
  {
    memberId: "WL-RO-204518",
    firstName: "Maria",
    persona: "S-a mutat la casă lângă Cluj. Pasionată de grădină.",
    personaEn: "Just moved into a house near Cluj. Loves gardening.",
    tier: "Silver",
    points: 1240,
    homeStoreId: "cluj",
    location: { city: "Cluj-Napoca", lat: 46.77, lng: 23.59 },
    language: "ro",
    memberSince: "2025-05-02",
    segments: ["garden_lover", "new_homeowner"],
    consent: { personalization: true, location: true },
    walletPass: { platform: "google", installedAt: "2025-05-02" },
    purchases: [
      {
        date: "2026-04-20",
        storeId: "cluj",
        items: [
          { role: "garden_rake", qty: 1 },
          { role: "garden_hose", qty: 1 },
          { role: "grass_seed", qty: 2 },
        ],
      },
      {
        date: "2026-05-10",
        storeId: "cluj",
        items: [
          { role: "spade", qty: 1 },
          { role: "wheelbarrow", qty: 1 },
          { role: "work_gloves", qty: 2 },
        ],
      },
    ],
  },
  {
    memberId: "WL-RO-309877",
    firstName: "James",
    persona: "Expat, abia s-a înscris. Primul lui proiect DIY.",
    personaEn: "Expat, just joined. First DIY project ever.",
    tier: "Bronze",
    points: 180,
    homeStoreId: "timisoara-1",
    location: { city: "Timișoara", lat: 45.756, lng: 21.229 },
    language: "en",
    memberSince: "2026-09-01",
    segments: ["new_member"],
    consent: { personalization: true, location: true },
    walletPass: { platform: "apple", installedAt: "2026-09-01" },
    purchases: [{ date: "2026-09-05", storeId: "timisoara-1", items: [{ role: "work_gloves", qty: 1 }] }],
  },
  {
    memberId: "WL-RO-411902",
    firstName: "Elena",
    persona: "Nu a consimțit la personalizare — vede doar oferte generale.",
    personaEn: "Opted out of personalisation — sees only general offers.",
    tier: "Silver",
    points: 2150,
    homeStoreId: "buc-colentina",
    location: { city: "București", lat: 44.46, lng: 26.14 },
    language: "ro",
    memberSince: "2023-07-21",
    segments: ["renovator"],
    consent: { personalization: false, location: false },
    walletPass: { platform: "google", installedAt: "2023-07-21" },
    purchases: [],
  },
];
