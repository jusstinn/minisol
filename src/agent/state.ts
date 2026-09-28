import { PROJECT_TYPES } from "@/domain/calculators";
import type { ProjectType } from "@/domain/calculators";
import { checkLayout, defaultLayout } from "@/domain/layout";
import type { Layout } from "@/domain/layout";
import type { ProjectSnapshot, SessionState } from "./types";

const QUALITIES = ["budget", "standard", "premium"] as const;

/**
 * Session state comes from the browser: validate it before any tool sees it.
 * Unknown stores/tiers are dropped, quantities are clamped, and a malformed
 * sketch is replaced by the default layout for the project's inputs.
 */
export function sanitizeState(raw: Partial<SessionState> | undefined, storeIds: string[]): SessionState {
  const rawBasket = Array.isArray(raw?.basket) ? raw.basket.slice(0, 80) : [];
  return {
    basket: rawBasket
      .filter((i) => i && typeof i.sku === "string")
      .map((i) => ({ sku: i.sku, qty: Math.min(999, Math.round(Number(i.qty))), role: i.role, basis: typeof i.basis === "string" ? i.basis.slice(0, 200) : undefined }))
      .filter((i) => i.qty > 0),
    storeId: storeIds.includes(raw?.storeId as string) ? raw!.storeId : undefined,
    quality: QUALITIES.includes(raw?.quality as never) ? raw!.quality : undefined,
    project: sanitizeProject(raw?.project),
    suggestions: (Array.isArray(raw?.suggestions) ? raw.suggestions.slice(0, 20) : [])
      .filter((s) => s && typeof s.sku === "string" && typeof s.role === "string")
      .map((s) => ({
        sku: s.sku.slice(0, 32),
        qty: Math.max(1, Math.min(999, Math.round(Number(s.qty) || 1))),
        role: s.role,
        basis: typeof s.basis === "string" ? s.basis.slice(0, 200) : undefined,
        isTool: s.isTool === true,
      })),
  };
}

function sanitizeProject(p: ProjectSnapshot | undefined): ProjectSnapshot | undefined {
  if (!p || typeof p !== "object" || !PROJECT_TYPES.includes(p.type as ProjectType)) return undefined;
  const inputs = p.inputs && typeof p.inputs === "object" ? p.inputs : {};
  let layout = p.layout === undefined ? undefined : checkLayout(p.layout, p.type);
  if (p.layout !== undefined && !layout) {
    try {
      layout = defaultLayout(p.type, inputs);
    } catch {
      layout = undefined;
    }
  }
  return {
    ...p,
    title: String(p.title ?? "").slice(0, 120),
    inputs,
    layout: layout ?? undefined,
    sketched: p.sketched === true,
    revision: Number.isInteger(p.revision) ? Math.max(0, Math.min(1e6, p.revision as number)) : 0,
    layoutHistory: (Array.isArray(p.layoutHistory) ? p.layoutHistory.slice(-10) : []).map((l) => checkLayout(l, p.type)).filter((l): l is Layout => l !== null),
  };
}
