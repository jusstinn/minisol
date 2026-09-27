import type { Customer, Offer } from "@/domain/types";
import type { LoyaltyProvider } from "./types";

/**
 * Production LoyaltyProvider backed by the WalletLoop REST API (Business tier+).
 *
 * The endpoint paths and payload shapes below are the integration contract we
 * expect to expose; adjust the `toCustomer`/`toOffer` mappers to the final API.
 * Enable with DATA_SOURCE=walletloop, WALLETLOOP_API_URL, WALLETLOOP_API_KEY.
 */
export class WalletLoopLoyaltyProvider implements LoyaltyProvider {
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private programId: string,
  ) {}

  private async get<T>(path: string): Promise<T | undefined> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (res.status === 404) return undefined;
    if (!res.ok) throw new Error(`WalletLoop ${path} → ${res.status}`);
    return (await res.json()) as T;
  }

  async getMember(memberId: string): Promise<Customer | undefined> {
    const m = await this.get<Record<string, unknown>>(`/v1/programs/${this.programId}/members/${encodeURIComponent(memberId)}`);
    return m ? toCustomer(m) : undefined;
  }

  async getOffers(memberId: string): Promise<Offer[]> {
    const list = await this.get<Record<string, unknown>[]>(
      `/v1/programs/${this.programId}/members/${encodeURIComponent(memberId)}/offers?status=active`,
    );
    return (list ?? []).map(toOffer);
  }

  async listDemoMembers(): Promise<Customer[]> {
    return [];
  }
}

// ── mappers: WalletLoop payload → domain model ───────────────────────────────

function toCustomer(m: Record<string, unknown>): Customer {
  const loc = (m.lastKnownLocation ?? {}) as { city?: string; lat?: number; lng?: number };
  return {
    memberId: String(m.id),
    firstName: String(m.firstName ?? ""),
    tier: (m.tier as Customer["tier"]) ?? "Bronze",
    points: Number(m.pointsBalance ?? 0),
    homeStoreId: String(m.homeStoreId ?? ""),
    location: { city: loc.city ?? "", lat: loc.lat ?? 0, lng: loc.lng ?? 0 },
    language: m.locale === "en" ? "en" : "ro",
    memberSince: String(m.createdAt ?? ""),
    segments: (m.segments as string[]) ?? [],
    purchases: (m.recentPurchases as Customer["purchases"]) ?? [],
    consent: {
      personalization: Boolean((m.consents as Record<string, boolean> | undefined)?.personalization),
      location: Boolean((m.consents as Record<string, boolean> | undefined)?.location),
    },
    walletPass: {
      platform: m.passPlatform === "google" ? "google" : "apple",
      installedAt: String(m.passInstalledAt ?? ""),
    },
  };
}

function toOffer(o: Record<string, unknown>): Offer {
  return o as unknown as Offer;
}
