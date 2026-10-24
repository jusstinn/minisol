import { describe, expect, it } from "vitest";
import { footerText } from "../photoFooter";

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
    // Same convention as the sketch's own title block (format.ts's `dec`): 2 decimals for metres.
    expect(f.dims).toBe("4,00 m × 3,00 m");
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
    expect(f.dims).toBe("12 pcs");
  });
});
