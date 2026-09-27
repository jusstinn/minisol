import { getTenant } from "@/config/tenant";
import { createDemoSources } from "./demo";
import type { DataSources } from "./types";
import { WalletLoopLoyaltyProvider } from "./walletloop";

const cache = new Map<string, DataSources>();

/**
 * DATA_SOURCE=demo (default): everything from the bundled demo data.
 * DATA_SOURCE=walletloop: real WalletLoop members/offers, demo catalogue & stock
 * (swap `catalog`/`inventory`/`stores` for the retailer's APIs the same way).
 */
export function getDataSources(tenantId?: string | null): DataSources {
  const tenant = getTenant(tenantId);
  const hit = cache.get(tenant.id);
  if (hit) return hit;
  let sources = createDemoSources(tenant);
  if (process.env.DATA_SOURCE === "walletloop") {
    const { WALLETLOOP_API_URL, WALLETLOOP_API_KEY, WALLETLOOP_PROGRAM_ID } = process.env;
    if (!WALLETLOOP_API_URL || !WALLETLOOP_API_KEY || !WALLETLOOP_PROGRAM_ID) {
      throw new Error("DATA_SOURCE=walletloop requires WALLETLOOP_API_URL, WALLETLOOP_API_KEY, WALLETLOOP_PROGRAM_ID");
    }
    sources = { ...sources, loyalty: new WalletLoopLoyaltyProvider(WALLETLOOP_API_URL, WALLETLOOP_API_KEY, WALLETLOOP_PROGRAM_ID) };
  }
  cache.set(tenant.id, sources);
  return sources;
}

export type { DataSources } from "./types";
