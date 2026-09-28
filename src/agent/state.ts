import { PROJECT_TYPES } from "@/domain/calculators";
import type { ProjectType } from "@/domain/calculators";
import { checkLayout, defaultLayout } from "@/domain/layout";
import type { Layout } from "@/domain/layout";
import { MATERIAL_ROLES } from "@/domain/types";
import type { MaterialRole } from "@/domain/types";
import type { ProjectSnapshot, SessionState } from "./types";

const QUALITIES = ["budget", "standard", "premium"] as const;

/** Retailer article numbers: letters, digits and dashes — never free text (it reaches the prompt). */
const SKU = /^[A-Za-z0-9-]{1,24}$/;
const isRole = (v: unknown): v is MaterialRole => typeof v === "string" && Object.hasOwn(MATERIAL_ROLES, v);
/** Short free text from the browser: single line, bounded. */
const line = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max) : "");

/**
 * Session state comes from the browser: validate it before any tool sees it.
 * Unknown stores/tiers are dropped, quantities are clamped, and a malformed
 * sketch is replaced by the default layout for the project's inputs.
 */
export function sanitizeState(raw: Partial<SessionState> | undefined, storeIds: string[]): SessionState {
  const rawBasket = Array.isArray(raw?.basket) ? raw.basket.slice(0, 80) : [];
  return {
    basket: rawBasket
      .filter((i) => i && typeof i.sku === "string" && SKU.test(i.sku))
      .map((i) => ({ sku: i.sku, qty: Math.min(999, Math.round(Number(i.qty))), role: isRole(i.role) ? i.role : undefined, basis: typeof i.basis === "string" ? line(i.basis, 200) : undefined }))
      .filter((i) => i.qty > 0),
    storeId: storeIds.includes(raw?.storeId as string) ? raw!.storeId : undefined,
    quality: QUALITIES.includes(raw?.quality as never) ? raw!.quality : undefined,
    project: sanitizeProject(raw?.project),
    suggestions: (Array.isArray(raw?.suggestions) ? raw.suggestions.slice(0, 20) : [])
      .filter((s) => s && typeof s.sku === "string" && SKU.test(s.sku) && isRole(s.role))
      .map((s) => ({
        sku: s.sku,
        qty: Math.max(1, Math.min(999, Math.round(Number(s.qty) || 1))),
        role: s.role,
        basis: typeof s.basis === "string" ? line(s.basis, 200) : undefined,
        isTool: s.isTool === true,
      })),
  };
}

function sanitizeProject(p: ProjectSnapshot | undefined): ProjectSnapshot | undefined {
  if (!p || typeof p !== "object" || !PROJECT_TYPES.includes(p.type as ProjectType)) return undefined;
  const inputs = cleanInputs(p.inputs);
  let layout = p.layout === undefined ? undefined : checkLayout(p.layout, p.type);
  if (p.layout !== undefined && !layout) {
    try {
      layout = defaultLayout(p.type, inputs);
    } catch {
      layout = undefined;
    }
  }
  // Rebuilt field by field: nothing the browser added travels on (into prompts or share links).
  const strings = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.slice(0, n).map((x) => line(x, max)).filter(Boolean) : []);
  const est = (p.estimate ?? {}) as Partial<ProjectSnapshot["estimate"]>;
  const clampN = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  return {
    type: p.type,
    title: line(p.title, 80),
    inputs,
    measurements: (Array.isArray(p.measurements) ? p.measurements.slice(0, 16) : [])
      .filter((m) => m && typeof m === "object")
      .map((m) => ({ label: line(m.label, 60), value: clampN(m.value, -1e6, 1e6, 0), unit: line(m.unit, 12) })),
    assumptions: strings(p.assumptions, 16, 240),
    estimate: {
      hoursMin: clampN(est.hoursMin, 0, 10_000, 1),
      hoursMax: clampN(est.hoursMax, 0, 10_000, 1),
      difficulty: [1, 2, 3, 4, 5].includes(est.difficulty as number) ? (est.difficulty as ProjectSnapshot["estimate"]["difficulty"]) : 1,
      people: est.people === 2 ? 2 : 1,
    },
    safetyNotes: strings(p.safetyNotes, 12, 240),
    layout: layout ?? undefined,
    sketched: p.sketched === true,
    revision: Number.isInteger(p.revision) ? Math.max(0, Math.min(1e6, p.revision as number)) : 0,
    layoutHistory: (Array.isArray(p.layoutHistory) ? p.layoutHistory.slice(-10) : []).map((l) => checkLayout(l, p.type)).filter((l): l is Layout => l !== null),
  };
}

/** Calculator inputs: flat numbers, booleans and short words only. */
function cleanInputs(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, 24)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(k)) continue;
    if (typeof x === "number" && Number.isFinite(x)) out[k] = x;
    else if (typeof x === "boolean") out[k] = x;
    else if (typeof x === "string" && /^[\p{L}\p{N} ._-]{0,40}$/u.test(x)) out[k] = x;
  }
  return out;
}
