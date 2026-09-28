/**
 * Retailer (tenant) configuration. Blueprint is a WalletLoop product that runs
 * white-labelled for any retailer on the platform: switch with TENANT=<id>
 * (server) / NEXT_PUBLIC_TENANT=<id> (client) or ?retailer=<id> in the URL.
 */
export interface Tenant {
  id: string;
  /** Retailer brand shown to customers and used by the assistant. */
  name: string;
  /** Prefix for store names ("HORNBACH București Militari"). */
  storePrefix: string;
  /** Primary accent colour (CSS). */
  accent: string;
  /** Text colour on top of the accent. */
  onAccent: string;
  /** Loyalty programme name as members know it. */
  programName: string;
  country: string;
  currency: "RON";
  /**
   * When the 3D sketch is drawn: "auto" for every project (demos, pitches) or
   * "on_demand" — only when the customer taps "Sketch my project" (production:
   * most people just want the list; the sketch is an extra). ?sketch=auto|on_demand overrides.
   */
  sketch: "auto" | "on_demand";
  /**
   * Step-by-step plans: "ai" lets the model write them (demo); "approved" always shows the
   * retailer-reviewed template for the project type, with the model's tips labelled as AI.
   */
  plans: "ai" | "approved";
}

export const TENANTS: Record<string, Tenant> = {
  demo: {
    id: "demo",
    name: "Atelier",
    storePrefix: "Atelier",
    accent: "#FF5B1F",
    onAccent: "#140B06",
    programName: "Atelier Club",
    country: "RO",
    currency: "RON",
    sketch: "auto",
    plans: "ai",
  },
  hornbach: {
    id: "hornbach",
    name: "HORNBACH",
    storePrefix: "HORNBACH",
    accent: "#F57C00",
    onAccent: "#1A1206",
    programName: "HORNBACH Club",
    country: "RO",
    currency: "RON",
    sketch: "on_demand",
    plans: "approved",
  },
  brico: {
    id: "brico",
    name: "Brico Nord",
    storePrefix: "Brico Nord",
    accent: "#2F6BFF",
    onAccent: "#FFFFFF",
    programName: "Brico Nord Plus",
    country: "RO",
    currency: "RON",
    sketch: "on_demand",
    plans: "approved",
  },
};

export function getTenant(id?: unknown): Tenant {
  // `id` comes from URLs and request bodies: anything that isn't a string means "not given".
  const key = (typeof id === "string" ? id : (process.env.TENANT ?? process.env.NEXT_PUBLIC_TENANT ?? "demo")).toLowerCase();
  // Own keys only: ?retailer=constructor or "__proto__" must not resolve to Object.prototype members.
  return Object.prototype.hasOwnProperty.call(TENANTS, key) ? TENANTS[key] : TENANTS.demo;
}
