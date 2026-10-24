import { describe, expect, it } from "vitest";
import { contentCrop, footerText, photoFileName } from "../photoFooter";

const date = new Date("2026-10-24T12:00:00Z");

describe("footerText", () => {
  it("joins the first two measurements into a dimension line", () => {
    const f = footerText({
      title: "Terasă din deck",
      measurements: [
        { label: "Lungime", value: 4, unit: "m" },
        { label: "Lățime", value: 3, unit: "m" },
        { label: "Suprafață", value: 12, unit: "m²" },
      ],
      tenant: "HORNBACH",
      lang: "ro",
      date,
    });
    expect(f.title).toBe("Terasă din deck");
    // Same convention as the sketch's own title block (format.ts's `dec`): 2 decimals for metres;
    // different quantities keep their labels instead of being multiplied.
    expect(f.dims).toBe("Lungime 4,00 m  ·  Lățime 3,00 m");
    const sized = footerText({ title: "Terasă din deck", measurements: [{ label: "Suprafață terasă", value: 12, unit: "m²" }, { label: "Rânduri", value: 20, unit: "rânduri" }], tenant: "HORNBACH", lang: "ro", date, size: "4 m × 3 m" });
    expect(sized.dims).toBe("4 m × 3 m  ·  Suprafață terasă 12,00 m²");
  });

  it("never mentions a price or anything beyond title, dims, tenant, date and the notice", () => {
    const f = footerText({
      title: "Baie nouă",
      measurements: [{ label: "Lungime", value: 2.5, unit: "m" }],
      tenant: "HORNBACH",
      lang: "ro",
      date,
    });
    const all = `${f.title} ${f.dims} ${f.meta}`.toLowerCase();
    expect(all).not.toMatch(/lei|ron|€|\$|preț|price/);
  });

  it("shows the Romanian notice in ro, the English one in en", () => {
    const base = { title: "x", measurements: [], tenant: "HORNBACH", date };
    expect(footerText({ ...base, lang: "ro" }).meta).toContain("Schiță orientativă");
    expect(footerText({ ...base, lang: "en" }).meta).toContain("Indicative sketch");
  });

  it("includes the tenant name in the meta line", () => {
    const f = footerText({ title: "x", measurements: [], tenant: "Brico Nord", lang: "ro", date });
    expect(f.meta).toContain("Brico Nord");
  });

  it("formats whole-number units (pcs/rows) without decimals", () => {
    const f = footerText({ title: "x", measurements: [{ label: "Panouri", value: 12, unit: "buc" }], tenant: "HORNBACH", lang: "en", date });
    expect(f.dims).toBe("Panouri 12 pcs");
  });
});

describe("contentCrop / photoFileName", () => {
  // A 1000 × 600 frame with something drawn in [600..800] × [300..400].
  const alpha = (x: number, y: number) => (x >= 600 && x <= 800 && y >= 300 && y <= 400 ? 255 : 0);

  it("crops to what's drawn, with a margin, in a photo-like shape inside the frame", () => {
    const c = contentCrop(alpha, 1000, 600);
    expect(c.x).toBeLessThanOrEqual(600);
    expect(c.y).toBeLessThanOrEqual(300);
    expect(c.x + c.w).toBeGreaterThanOrEqual(800);
    expect(c.y + c.h).toBeGreaterThanOrEqual(400);
    expect(c.w / c.h).toBeGreaterThanOrEqual(4 / 3 - 0.01);
    expect(c.w / c.h).toBeLessThanOrEqual(16 / 9 + 0.01);
    expect(c.x).toBeGreaterThanOrEqual(0);
    expect(c.x + c.w).toBeLessThanOrEqual(1000);
    expect(c.y + c.h).toBeLessThanOrEqual(600);
    expect(c.w).toBeLessThan(500);
  });

  it("keeps the whole frame when nothing is drawn", () => {
    expect(contentCrop(() => 0, 1000, 600)).toEqual({ x: 0, y: 0, w: 1000, h: 600 });
  });

  it("names the file after the project, the retailer and the day", () => {
    expect(photoFileName("Terasă din deck", "hornbach", new Date(2026, 9, 24))).toBe("terasa-din-deck-hornbach-2026-10-24.png");
    expect(photoFileName("", "demo", new Date(2026, 0, 5))).toBe("schita-demo-2026-01-05.png");
  });
});
