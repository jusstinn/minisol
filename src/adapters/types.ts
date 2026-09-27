import type { CategoryId, Customer, MaterialRole, Offer, Product, QualityTier, Store } from "@/domain/types";

/**
 * Integration boundary. The agent and UI only talk to these interfaces.
 * Demo implementations live in ./demo; production ones wrap the retailer's
 * catalogue/inventory APIs and the WalletLoop REST API.
 */

export interface ProductQuery {
  text?: string;
  role?: MaterialRole;
  category?: CategoryId;
  quality?: QualityTier;
  maxPrice?: number;
  limit?: number;
}

export interface CatalogProvider {
  get(sku: string): Promise<Product | undefined>;
  getMany(skus: string[]): Promise<Product[]>;
  search(q: ProductQuery): Promise<Product[]>;
  /** Full catalogue for role-based resolution. Production: role-indexed subset. */
  byRoles(roles: MaterialRole[]): Promise<Product[]>;
}

export interface InventoryProvider {
  /** Batch lookup → Map key `${storeId}:${sku}` → units on hand. */
  stock(storeIds: string[], skus: string[]): Promise<Map<string, number>>;
}

export interface StoreProvider {
  list(): Promise<Store[]>;
}

export interface LoyaltyProvider {
  getMember(memberId: string): Promise<Customer | undefined>;
  /** Offers currently assigned to / visible for the member (pre-eligibility). */
  getOffers(memberId: string): Promise<Offer[]>;
  listDemoMembers(): Promise<Customer[]>;
}

export interface DataSources {
  catalog: CatalogProvider;
  inventory: InventoryProvider;
  stores: StoreProvider;
  loyalty: LoyaltyProvider;
}
