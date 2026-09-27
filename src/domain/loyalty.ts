import type { Tier } from "./types";

/**
 * Demo loyalty rules (WalletLoop programme config). In production these come from
 * the retailer's WalletLoop programme settings.
 */
export const LOYALTY = {
  /** Points per 1 RON spent, before multipliers. */
  pointsPerRon: 1,
  tierMultiplier: { Bronze: 1, Silver: 1.25, Gold: 1.5 } satisfies Record<Tier, number>,
  /** RON value of one point when redeeming (100 points = 5 RON). */
  pointValueRon: 0.05,
  /** Points are redeemed in blocks of this size. */
  redeemBlock: 100,
  /** Max share of the basket that can be paid with points. */
  maxRedeemShare: 0.2,
  tiers: ["Bronze", "Silver", "Gold"] as Tier[],
  /** Yearly spend needed for each tier (shown as progress). */
  tierThresholds: { Bronze: 0, Silver: 3000, Gold: 10000 } satisfies Record<Tier, number>,
};

export function tierRank(t: Tier): number {
  return LOYALTY.tiers.indexOf(t);
}
