import { describe, expect, it } from "vitest";
import type { Quote } from "@/domain/quote";
import { moneyAmounts, verifyReply } from "../verify";

const quote = {
  total: 5094.6,
  subtotal: 5374.5,
  discountTotal: 279.9,
  lines: [{ unitPrice: 149.9, lineTotal: 3297.8, netTotal: 3297.8, discount: 0 }],
  discounts: [{ amount: 150 }, { amount: 129.9 }],
  hints: [],
  points: { earned: 7641, redeemableValue: 240, totalIfRedeemed: 4854.6 },
  delivery: { fee: 0 },
} as unknown as Quote;

describe("moneyAmounts", () => {
  it("parses Romanian, English and plain formats", () => {
    expect(moneyAmounts("total **5.094,60 lei**, economii 279,90 lei")).toEqual([5094.6, 279.9]);
    expect(moneyAmounts("comes to 5,094.60 lei and 240 lei")).toEqual([5094.6, 240]);
    expect(moneyAmounts("costă 3575.29 lei")).toEqual([3575.29]);
  });
});

describe("verifyReply", () => {
  it("accepts amounts that come from the quote", () => {
    expect(verifyReply("Total **5.094,60 lei**, economisești **279,90 lei**, plătești 240 lei cu puncte.", quote)).toMatchObject({ ok: true, checked: 3 });
  });

  it("rejects invented amounts", () => {
    const v = verifyReply("Totalul este 5.759,41 lei.", quote);
    expect(v.ok).toBe(false);
    expect(v.invented).toEqual([5759.41]);
  });

  it("rejects placeholder garbage like '3xx lei'", () => {
    expect(verifyReply("economisești ed. 3xx lei", quote).ok).toBe(false);
  });

  it("allows whole-lei roundings", () => {
    expect(verifyReply("aproximativ 5095 lei", quote).ok).toBe(true);
  });
});
