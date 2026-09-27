import { tierRank } from "./loyalty";
import type { Customer, Offer } from "./types";

/**
 * Which WalletLoop offers a member can see right now.
 * Without personalisation consent, only untargeted (tier-only / public) offers apply.
 */
export function eligibleOffers(offers: Offer[], customer: Customer, now: Date = new Date()): Offer[] {
  const today = now.toISOString().slice(0, 10);
  return offers.filter((o) => {
    if (o.validUntil < today) return false;
    const e = o.eligibility;
    const targeted = Boolean(e.segments?.length || e.memberIds?.length);
    if (targeted && !customer.consent.personalization) return false;
    if (e.minTier && tierRank(customer.tier) < tierRank(e.minTier)) return false;
    if (e.memberIds?.length && !e.memberIds.includes(customer.memberId)) return false;
    if (e.segments?.length && !e.segments.some((s) => customer.segments.includes(s))) return false;
    return true;
  });
}
