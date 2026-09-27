import { MATERIAL_ROLES } from "./types";
import type { Product } from "./types";

/** Lowercase + strip Romanian diacritics so "vopsea lavabila" matches "vopsea lavabilă". */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[șş]/g, "s")
    .replace(/[țţ]/g, "t");
}

function haystack(p: Product): string {
  const roleText = p.roles.map((r) => `${MATERIAL_ROLES[r].label} ${MATERIAL_ROLES[r].labelEn} ${r}`).join(" ");
  const specs = Object.values(p.specs).join(" ");
  return fold(`${p.name} ${p.nameEn} ${p.brand} ${p.category} ${roleText} ${p.description} ${p.descriptionEn} ${specs}`);
}

const cache = new WeakMap<Product, string>();

/** Simple token-overlap scoring; good enough for a demo catalogue of a few hundred items. */
export function scoreProduct(p: Product, text: string): number {
  const tokens = fold(text)
    .split(/[^a-z0-9²]+/)
    .filter((t) => t.length > 1);
  if (tokens.length === 0) return 1;
  let hay = cache.get(p);
  if (!hay) {
    hay = haystack(p);
    cache.set(p, hay);
  }
  const name = fold(`${p.name} ${p.nameEn}`);
  let score = 0;
  for (const t of tokens) {
    const stem = t.length > 5 ? t.slice(0, t.length - 2) : t; // crude RO/EN stemming
    if (name.includes(stem)) score += 3;
    else if (hay.includes(stem)) score += 1;
  }
  return score / tokens.length;
}
