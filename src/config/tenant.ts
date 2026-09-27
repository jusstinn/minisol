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
  },
  hornbach: {
    id: "hornbach",
    name: "HORNBACH",
    storePrefix: "HORNBACH",
    accent: "#F57C00",
    onAccent: "#1A1206",
    programName: "HORNBACH Wallet",
    country: "RO",
    currency: "RON",
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
  },
};

export function getTenant(id?: string | null): Tenant {
  const key = (id ?? process.env.TENANT ?? process.env.NEXT_PUBLIC_TENANT ?? "demo").toLowerCase();
  return TENANTS[key] ?? TENANTS.demo;
}
