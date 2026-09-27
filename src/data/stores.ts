import type { Store } from "@/domain/types";

/**
 * Demo store network (modelled on a real 11-store Romanian DIY chain). Coordinates are
 * approximate. `name` is the location label; the retailer brand is prefixed per tenant —
 * replace via the StoreProvider adapter with the real store API.
 */
const STANDARD_SERVICES = ["Click & Collect", "Tăiere lemn la dimensiune", "Nuanțare vopsea", "Închiriere utilaje", "Livrare la domiciliu"];

export const STORES: Store[] = [
  { id: "buc-militari", name: "București Militari", city: "București", lat: 44.4353, lng: 25.9776, openingHours: "L–S 07:00–21:00, D 09:00–19:00", services: STANDARD_SERVICES },
  { id: "buc-berceni", name: "București Berceni", city: "București", lat: 44.3635, lng: 26.1233, openingHours: "L–S 07:00–21:00, D 09:00–19:00", services: STANDARD_SERVICES },
  { id: "buc-colentina", name: "București Colentina", city: "București", address: "Șoseaua Andronache 246-252", lat: 44.4712, lng: 26.1667, openingHours: "L–S 07:00–21:00, D 09:00–19:00", services: STANDARD_SERVICES },
  { id: "buc-balotesti", name: "București Balotești", city: "Balotești", address: "Calea București nr. 2A", lat: 44.5913, lng: 26.0842, openingHours: "L–S 07:00–21:00, D 09:00–19:00", services: STANDARD_SERVICES },
  { id: "brasov", name: "Brașov", city: "Brașov", address: "Strada Bucegi nr. 3", lat: 45.6693, lng: 25.5718, openingHours: "L–S 07:00–21:00, D 09:00–19:00", services: STANDARD_SERVICES },
  { id: "timisoara-1", name: "Timișoara 1 Calea Aradului", city: "Timișoara", lat: 45.7806, lng: 21.2279, openingHours: "L–S 07:00–21:00, D 09:00–19:00", services: STANDARD_SERVICES },
  { id: "timisoara-2", name: "Timișoara 2 Calea Buziașului", city: "Timișoara", lat: 45.7318, lng: 21.2551, openingHours: "L–S 07:00–21:00, D 09:00–19:00", services: STANDARD_SERVICES },
  { id: "cluj", name: "Cluj-Napoca", city: "Cluj-Napoca", lat: 46.7788, lng: 23.6362, openingHours: "L–S 07:00–21:00, D 09:00–19:00", services: STANDARD_SERVICES },
  { id: "sibiu", name: "Sibiu", city: "Sibiu", lat: 45.7744, lng: 24.1068, openingHours: "L–S 07:00–21:00, D 09:00–19:00", services: STANDARD_SERVICES },
  { id: "oradea", name: "Oradea", city: "Oradea", lat: 47.0292, lng: 21.9006, openingHours: "L–S 07:00–21:00, D 09:00–19:00", services: STANDARD_SERVICES },
  { id: "constanta", name: "Constanța", city: "Constanța", lat: 44.2033, lng: 28.6195, openingHours: "L–S 07:00–21:00, D 09:00–19:00", services: STANDARD_SERVICES },
];

/** Aisle signage per category — lets the assistant say "culoarul 14". */
export const AISLES: Record<string, number> = {
  paint: 14,
  flooring: 22,
  tiles: 25,
  building: 3,
  drywall: 5,
  insulation: 6,
  wood: 9,
  garden: 31,
  fencing: 33,
  tools: 17,
  power_tools: 18,
  fasteners: 16,
  adhesives: 15,
  safety: 19,
  electrical: 27,
  plumbing: 28,
  bathroom: 29,
};
