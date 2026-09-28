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

/**
 * Consumer Rights Directive art. 6(1)(ea) (added by the Omnibus Directive): the member
 * must be told when a price was personalised on the basis of automated decision-making.
 * Offers aimed at a tier above the entry tier, a segment or named members are decided by
 * WalletLoop profiling, so they are personalised; offers open to every member are not.
 */
export function isPersonalisedOffer(o: Offer): boolean {
  const e = o.eligibility;
  return Boolean((e.minTier && tierRank(e.minTier) > 0) || e.segments?.length || e.memberIds?.length);
}
