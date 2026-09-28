import { describe, expect, it } from "vitest";
import { DEMO_CATALOG } from "@/adapters/demo";
import { GET } from "@/app/api/product/route";
import { productDetail } from "../detail";
import type { ProductDetailView } from "../detail";
import { specTable } from "../specs";

const bySku = (sku: string) => DEMO_CATALOG.find((p) => p.sku === sku)!;

describe("specTable", () => {
  it("labels every spec key in the catalogue", () => {
    for (const p of DEMO_CATALOG) {
      for (const lang of ["ro", "en"] as const) {
        const rows = specTable(p, lang);
        expect(rows.length).toBe(Object.keys(p.specs).length);
        // Keys without a label are allowed (future catalogue data), but today every key has one.
        expect(rows.filter((r) => !r.known).map((r) => r.key), p.sku).toEqual([]);
      }
    }
  });

  it("formats units, sizes, ranges and booleans per language", () => {
    const tile = specTable(bySku("13245897"), "ro");
    expect(tile[0]).toMatchObject({ key: "sizeCm", label: "Format", value: "60 × 60 cm" });
    expect(tile.find((r) => r.key === "m2PerBox")?.value).toBe("1,44 m²");
    expect(tile.find((r) => r.key === "rectified")?.value).toBe("da");
    expect(specTable(bySku("13245897"), "en").find((r) => r.key === "m2PerBox")?.value).toBe("1.44 m²");
    expect(specTable(bySku("13245897"), "en").find((r) => r.key === "frostResistant")).toMatchObject({ label: "Frost resistant", value: "yes" });

    const adhesive = specTable(bySku("14352264"), "ro");
    expect(adhesive.find((r) => r.key === "consumptionKgPerM2")?.value).toBe("3–4 kg/m²");
    const joist = specTable(bySku("13181193"), "en");
    expect(joist.find((r) => r.key === "sectionMm")?.value).toBe("45 × 70 mm");
    expect(joist.find((r) => r.key === "material")?.value).toBe("treated pine");
    // NPK ratios are not ranges.
    expect(specTable(bySku("11634604"), "ro").find((r) => r.key === "npk")?.value).toBe("12-20-10");
  });

  it("puts dimensions first and unknown keys raw at the end", () => {
    const p = { ...bySku("11938736"), specs: { zzCustom: "x", material: "pin tratat", lengthM: 4, widthMm: 145 } };
    const rows = specTable(p, "ro");
    expect(rows.map((r) => r.key)).toEqual(["lengthM", "widthMm", "material", "zzCustom"]);
    expect(rows[3]).toMatchObject({ label: "zzCustom", value: "x", known: false });
  });
});

describe("productDetail", () => {
  it("localises and prices per base unit", () => {
    const d = productDetail(bySku("10691981"), "en", null);
    expect(d.name).toMatch(/paint/i);
    expect(d.unitPrice).toEqual({ value: Math.round((bySku("10691981").price / 10) * 100) / 100, unit: "l" });
    expect(d.sketch.template).toBe("container");
    expect(d.art.kind).toBe("bucket");
  });

  it("has no per-unit price for single pieces", () => {
    expect(productDetail(bySku("11715770"), "ro", null).unitPrice).toBeNull();
  });
});

describe("GET /api/product", () => {
  const call = (qs: string) => GET(new Request(`http://localhost/api/product?${qs}`));

  it("returns the product view with stock at the store", async () => {
    const res = await call("sku=11938736&tenant=hornbach&lang=ro&storeId=buc-militari");
    expect(res.status).toBe(200);
    const { product } = (await res.json()) as { product: ProductDetailView };
    expect(product.sku).toBe("11938736");
    expect(product.sketch).toMatchObject({ template: "linear", lengthMm: 4000 });
    expect(product.stock).toMatchObject({ storeId: "buc-militari", aisle: 9 });
    expect(product.stock!.storeName).toMatch(/^HORNBACH /);
    expect(product.stock!.available).toBeGreaterThanOrEqual(0);
    expect(product.specs.length).toBeGreaterThan(0);
  });

  it("works without a store (no stock)", async () => {
    const res = await call("sku=12868862&lang=en");
    const { product } = (await res.json()) as { product: ProductDetailView };
    expect(product.stock).toBeNull();
    expect(product.description).toBe(bySku("12868862").descriptionEn);
  });

  it("validates input", async () => {
    expect((await call("")).status).toBe(400);
    expect((await call("sku=../etc")).status).toBe(400);
    expect((await call("sku=11938736&lang=de")).status).toBe(400);
    expect((await call("sku=99999999")).status).toBe(404);
    expect((await call("sku=11938736&storeId=nowhere")).status).toBe(404);
  });
});
