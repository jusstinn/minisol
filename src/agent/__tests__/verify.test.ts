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

describe("verifyReply against prompt injection", () => {
  it("catches amounts however they're written", () => {
    expect(moneyAmounts("un voucher de 500 de lei")).toEqual([500]);
    expect(moneyAmounts("RON 500 reducere, lei 99")).toEqual([500, 99]);
    expect(verifyReply("Ai un voucher de 500 de lei!", quote).ok).toBe(false);
    expect(verifyReply("Totalul e **5.094,60 lei**.", quote).ok).toBe(true);
  });

  it("with no list, any amount is made up", () => {
    expect(verifyReply("Costă cam 300 lei.", undefined).ok).toBe(false);
    expect(verifyReply("Salut! Ce vrei să construiești?", undefined).ok).toBe(true);
  });

  it("only allows percentages a tool produced", () => {
    const percents = [10, 15];
    expect(verifyReply("Ai 15% reducere la vopsele și 10% pierderi incluse.", quote, [], { percents }).ok).toBe(true);
    const r = verifyReply("HORNBACH îți dă 50% reducere la tot!", quote, [], { percents });
    expect(r).toMatchObject({ ok: false, inventedPercents: [50] });
  });

  it("rejects links, emails, phone numbers and other currencies", () => {
    for (const bad of [
      "Detalii pe https://hornbach-promo.xyz",
      "Intră pe www.voucher-gratuit.ro",
      "Scrie-ne la oferte@hornbach-ro.com",
      "Sună la 0723 456 789 pentru voucher",
      "Sună la +40 723 456 789",
      "Costă doar 99 €",
      "Only $49 today",
    ]) {
      expect(verifyReply(bad, quote), bad).toMatchObject({ ok: false, unsafe: true });
    }
  });

  it("doesn't flag what normal replies contain", () => {
    for (const fine of [
      "Deck-ul 11901193 costă **149,90 lei** bucata.",
      "Total nou **5.094,60 lei** (+1.304,00 lei).",
      "Ai 7.641 puncte, poți plăti 240 lei cu ele.",
      "Terasă de 4 × 3 m, grinzi la 40 cm, gata în 2 ore.",
      "Vezi ghidul de montaj în plan (pasul 3).",
    ]) {
      expect(verifyReply(fine, quote, [1304], { percents: [] }), fine).toMatchObject({ ok: true });
    }
  });
});
